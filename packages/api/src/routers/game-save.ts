import {
	type AppDatabase,
	and,
	type CommandRequest,
	commandRequests,
	desc,
	eq,
	type NewRun,
	type Run,
	runEvents,
	runs,
	sql,
} from "@ai-lab-tycoon/db";
import {
	advanceWeek,
	applyDecision,
	applyProductResume,
	assertGameState,
	assignProject,
	buyCompute,
	cancelProject,
	type DecisionChoice,
	deserializeGameStateWithMetadata,
	designModel,
	type GameState,
	hireTeam,
	launchProduct,
	type ModelDesignSpec,
	runEvaluation,
	serializeGameState,
	startRun,
} from "@ai-lab-tycoon/engine";
import { ORPCError } from "@orpc/server";
import type { QueryBuilder } from "drizzle-orm/sqlite-core/query-builders/query-builder";
import { z } from "zod";

import { authedProcedure } from "../authed-procedure";
import {
	type ApplyCommand,
	type ApplyCommandInput,
	applyCommandInput,
	MAX_COMMAND_JSON_LENGTH,
	MAX_REVISION,
} from "./game-save-command";
import {
	assertCommandLogLimit,
	assertJsonNestingDepth,
	assertWeekWithinLimit,
	isUniqueConstraintError,
	sanitizePublicSaveError,
} from "./game-save-validation";

const MAX_PERSISTED_STATE_LENGTH = 2_000_000;
const MAX_SEED = 4_294_967_295;
const PENDING_RESERVATION_TTL_MS = 5 * 60 * 1000;

type AuthoritativeRunStatus = "active" | "terminal";

// D1's Drizzle adapter gives us batch as the strongest atomic primitive for
// the final snapshot/event/ledger writes. Reservation and engine execution
// happen before that batch; a Worker dying in that gap leaves a pending request
// row, which reserveRequest can reclaim after its bounded lease expires.

/** The serializable run envelope returned by applyCommand and its retries. */
export type AuthoritativeRunResponse = {
	id: string;
	seed: number;
	schemaVersion: number;
	state: string;
	currentWeek: number;
	status: AuthoritativeRunStatus;
	revision: number;
};

/**
 * Authenticated game-save procedures. The browser can load/delete its run, but
 * every gameplay transition goes through applyCommand and server-owned state.
 */
export const gameSaveRouter = {
	/** Load the current user's active run, or null when none exists. */
	getActiveRun: authedProcedure
		.input(z.undefined())
		.handler(async ({ context }): Promise<Run | null> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new ORPCError("UNAUTHORIZED");
			}
			const rows = await db
				.select()
				.from(runs)
				.where(eq(runs.userId, userId))
				.orderBy(desc(runs.updatedAt))
				.limit(1);
			const row = rows[0];
			return row === undefined ? null : loadStoredRun(row);
		}),

	/**
	 * Apply one closed-world command to the state loaded for the session user.
	 * There is deliberately no state, seed, RNG, or incident-roll input here.
	 */
	applyCommand: authedProcedure
		.input(applyCommandInput)
		.handler(async ({ context, input }): Promise<AuthoritativeRunResponse> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const reservation = await reserveRequest(db, userId, input.requestId);
			if (reservation.status === "completed") {
				return readCompletedResponse(reservation);
			}
			if (reservation.status !== "pending") {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Invalid command request ledger state",
				});
			}

			const existingRows = await db
				.select()
				.from(runs)
				.where(eq(runs.userId, userId))
				.limit(1);
			const existing = existingRows[0];

			try {
				const isStartCommand = input.command.kind === "start_run";
				const isReplaceCommand = input.command.kind === "replace_run";
				if (isStartCommand && existing !== undefined) {
					throw new ORPCError("CONFLICT", {
						message:
							"A run already exists; use the explicit replace_run command to replace it.",
					});
				}
				if (!isStartCommand && existing === undefined) {
					throw new ORPCError("NOT_FOUND", {
						message: "No active run exists for this user.",
					});
				}
				assertExpectedRevision(
					existing,
					input.expectedRevision,
					isStartCommand,
				);
				if (
					!isStartCommand &&
					!isReplaceCommand &&
					existing?.status === "terminal"
				) {
					throw new ORPCError("UNPROCESSABLE_CONTENT", {
						message: "Cannot mutate a terminal run.",
					});
				}
			} catch (cause: unknown) {
				await releaseReservation(db, reservation.id);
				if (cause instanceof ORPCError) throw cause;
				throw new ORPCError("CONFLICT", {
					message: "Command conflict: the run revision is no longer current.",
					data: {
						storedRevision: existing?.revision ?? 0,
					},
				});
			}

			if (
				input.command.kind === "start_run" ||
				input.command.kind === "replace_run"
			) {
				return applyStartCommand(
					db,
					userId,
					reservation,
					existing,
					input.command,
				);
			}

			if (existing === undefined) {
				await releaseReservation(db, reservation.id);
				throw new ORPCError("NOT_FOUND", {
					message: "No active run exists for this user.",
				});
			}

			let state: GameState;
			let result: ReturnType<typeof advanceWeek>;
			try {
				state = loadStoredState(existing);
				result = executeCommand(state, input.command);
				// Fact-bearing engine transitions materialize reports in result.state.
				// Do not append result.facts here: advanceWeek, applyDecision,
				// runEvaluation, and product commands all own that reporting boundary.
				assertGameState(
					result.state,
					{ allowNegativeCash: result.state.company.cash < 0 },
					true,
				);
			} catch (cause: unknown) {
				await releaseReservation(db, reservation.id);
				throw new ORPCError("UNPROCESSABLE_CONTENT", {
					message: sanitizePublicSaveError(
						cause,
						"The command could not be applied.",
					),
				});
			}

			const nextRevision = existing.revision + 1;
			return persistExistingCommand({
				db,
				userId,
				reservation,
				existing,
				state: result.state,
				nextRevision,
				command: input.command,
			});
		}),

	/** Delete the current user's run. Returns true when a row was removed. */
	deleteActiveRun: authedProcedure
		.input(z.undefined())
		.handler(async ({ context }): Promise<boolean> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new ORPCError("UNAUTHORIZED");
			}
			const result = await db
				.delete(runs)
				.where(eq(runs.userId, userId))
				.returning({ id: runs.id });
			return result.length > 0;
		}),
};

export type GameSaveRouter = typeof gameSaveRouter;
export type { ApplyCommand, ApplyCommandInput };
export { applyCommandInput };

async function applyStartCommand(
	db: AppDatabase,
	userId: string,
	reservation: CommandRequest,
	existing: Run | undefined,
	command: Extract<ApplyCommand, { kind: "start_run" | "replace_run" }>,
): Promise<AuthoritativeRunResponse> {
	const seed = createServerSeed();
	const state = startRun(command.setup, seed);
	const stateJson = serializeAuthoritativeState(state);

	if (command.kind === "replace_run") {
		if (existing === undefined) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("NOT_FOUND", {
				message: "No active run exists for this user.",
			});
		}
		return persistReplacementCommand({
			db,
			userId,
			reservation,
			existing,
			seed,
			state,
			stateJson,
			command,
		});
	}

	if (existing !== undefined) {
		await releaseReservation(db, reservation.id);
		throw new ORPCError("CONFLICT", {
			message:
				"A run already exists; use the explicit replace_run command to replace it.",
		});
	}

	const now = new Date();
	const timestamp = toSqliteTimestamp(now);
	const runId = crypto.randomUUID();
	const response = createResponse(runId, seed, state, 1, stateJson);
	const newRun: NewRun = {
		id: runId,
		userId,
		seed,
		schemaVersion: state.meta.schemaVersion,
		state: stateJson,
		currentWeek: state.meta.week,
		status: response.status,
		revision: 1,
		createdAt: now,
		updatedAt: now,
	};
	const eventId = crypto.randomUUID();
	const commandJson = serializeCommand(command);
	const reservationCutoff = reservationCutoffSeconds();
	const runInsert = db
		.insert(runs)
		.select(((queryBuilder: QueryBuilder) =>
			queryBuilder
				.select({
					id: sql<string>`${newRun.id}`,
					userId: sql<string>`${newRun.userId}`,
					seed: sql<number>`${newRun.seed}`,
					schemaVersion: sql<number>`${newRun.schemaVersion}`,
					state: sql<string>`${newRun.state}`,
					currentWeek: sql<number>`${newRun.currentWeek}`,
					status: sql<string>`${newRun.status}`,
					revision: sql<number>`${newRun.revision}`,
					createdAt: sql<number>`${timestamp}`,
					updatedAt: sql<number>`${timestamp}`,
				})
				.from(commandRequests)
				.where(
					reservationIsLive(reservation.id, userId, reservationCutoff),
				)) as never)
		.returning();
	const eventInsert = db
		.insert(runEvents)
		.select(((queryBuilder: QueryBuilder) =>
			queryBuilder
				.select({
					id: sql<string>`${eventId}`,
					runId: sql<string>`${runId}`,
					revision: sql<number>`1`,
					requestId: sql<string>`${reservation.requestId}`,
					commandKind: sql<string>`${command.kind}`,
					commandJson: sql<string>`${commandJson}`,
					createdAt: sql<number>`${timestamp}`,
				})
				.from(runs)
				.where(
					and(
						eq(runs.id, runId),
						eq(runs.userId, userId),
						eq(runs.revision, 1),
						reservationIsLive(reservation.id, userId, reservationCutoff),
					),
				)) as never)
		.returning();
	try {
		const results = (await db.batch([
			runInsert,
			eventInsert,
			completeReservation(
				db,
				reservation.id,
				userId,
				reservation.requestId,
				eventId,
				response,
				1,
				reservationCutoff,
			),
		] as never)) as unknown[];
		if (!hasExactlyOneReturnedRow(results[0])) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("CONFLICT", {
				message: "The run changed before the start command was committed.",
			});
		}
		assertExactlyOneReturnedRow(results[1], "run event insert");
		assertExactlyOneReturnedRow(results[2], "command completion");
	} catch (cause: unknown) {
		if (cause instanceof ORPCError) throw cause;
		if (isUniqueConstraintError(cause)) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("CONFLICT", {
				message: "The run changed before the start command was committed.",
			});
		}
		throw cause;
	}
	return readCommittedResponse(db, userId, reservation.id, response);
}

async function persistReplacementCommand(options: {
	db: AppDatabase;
	userId: string;
	reservation: CommandRequest;
	existing: Run;
	seed: number;
	state: GameState;
	stateJson: string;
	command: Extract<ApplyCommand, { kind: "replace_run" }>;
}): Promise<AuthoritativeRunResponse> {
	const { db, userId, reservation, existing, seed, state, stateJson, command } =
		options;
	const nextRevision = existing.revision + 1;
	const response = createResponse(
		existing.id,
		seed,
		state,
		nextRevision,
		stateJson,
	);
	const now = new Date();
	const timestamp = toSqliteTimestamp(now);
	const eventId = crypto.randomUUID();
	const commandJson = serializeCommand(command);
	const reservationCutoff = reservationCutoffSeconds();
	const runUpdate = db
		.update(runs)
		.set({
			seed,
			state: stateJson,
			currentWeek: state.meta.week,
			status: response.status,
			schemaVersion: state.meta.schemaVersion,
			updatedAt: now,
			revision: nextRevision,
		})
		.where(
			and(
				eq(runs.id, existing.id),
				eq(runs.userId, userId),
				eq(runs.revision, existing.revision),
				reservationIsLive(reservation.id, userId, reservationCutoff),
			),
		)
		.returning();
	const eventInsert = db
		.insert(runEvents)
		.select(((queryBuilder: QueryBuilder) =>
			queryBuilder
				.select({
					id: sql<string>`${eventId}`,
					runId: sql<string>`${existing.id}`,
					revision: sql<number>`${nextRevision}`,
					requestId: sql<string>`${reservation.requestId}`,
					commandKind: sql<string>`${command.kind}`,
					commandJson: sql<string>`${commandJson}`,
					createdAt: sql<number>`${timestamp}`,
				})
				.from(runs)
				.where(
					and(
						eq(runs.id, existing.id),
						eq(runs.userId, userId),
						eq(runs.revision, nextRevision),
						reservationIsLive(reservation.id, userId, reservationCutoff),
					),
				)) as never)
		.returning();
	try {
		const results = (await db.batch([
			runUpdate,
			eventInsert,
			completeReservation(
				db,
				reservation.id,
				userId,
				reservation.requestId,
				eventId,
				response,
				nextRevision,
				reservationCutoff,
			),
		] as never)) as unknown[];
		if (!hasExactlyOneReturnedRow(results[0])) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("CONFLICT", {
				message: "Command conflict: the run revision is no longer current.",
				data: { storedRevision: await readRevision(db, userId) },
			});
		}
		assertExactlyOneReturnedRow(results[1], "run event insert");
		assertExactlyOneReturnedRow(results[2], "command completion");
	} catch (cause: unknown) {
		if (cause instanceof ORPCError) throw cause;
		if (isUniqueConstraintError(cause)) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("CONFLICT", {
				message: "Command conflict: the run revision is no longer current.",
			});
		}
		throw cause;
	}
	return readCommittedResponse(db, userId, reservation.id, response);
}

async function persistExistingCommand(options: {
	db: AppDatabase;
	userId: string;
	reservation: CommandRequest;
	existing: Run;
	state: GameState;
	nextRevision: number;
	command: Exclude<ApplyCommand, { kind: "start_run" | "replace_run" }>;
}): Promise<AuthoritativeRunResponse> {
	const { db, userId, reservation, existing, state, nextRevision, command } =
		options;
	const stateJson = serializeAuthoritativeState(state);
	const response = createResponse(
		existing.id,
		existing.seed,
		state,
		nextRevision,
		stateJson,
	);
	const now = new Date();
	const timestamp = toSqliteTimestamp(now);
	const eventId = crypto.randomUUID();
	const commandJson = serializeCommand(command);
	const reservationCutoff = reservationCutoffSeconds();
	const eventInsert = db
		.insert(runEvents)
		.select(((queryBuilder: QueryBuilder) =>
			queryBuilder
				.select({
					id: sql<string>`${eventId}`,
					runId: sql<string>`${runs.id}`,
					revision: sql<number>`${nextRevision}`,
					requestId: sql<string>`${reservation.requestId}`,
					commandKind: sql<string>`${command.kind}`,
					commandJson: sql<string>`${commandJson}`,
					createdAt: sql<number>`${timestamp}`,
				})
				.from(runs)
				.where(
					and(
						eq(runs.id, existing.id),
						eq(runs.userId, userId),
						eq(runs.revision, nextRevision),
						reservationIsLive(reservation.id, userId, reservationCutoff),
					),
				)) as never)
		.returning();
	const runUpdate = db
		.update(runs)
		.set({
			state: stateJson,
			currentWeek: state.meta.week,
			status: response.status,
			schemaVersion: state.meta.schemaVersion,
			updatedAt: now,
			revision: nextRevision,
		})
		.where(
			and(
				eq(runs.id, existing.id),
				eq(runs.userId, userId),
				eq(runs.revision, existing.revision),
				eq(runs.status, "active"),
				reservationIsLive(reservation.id, userId, reservationCutoff),
			),
		)
		.returning();
	try {
		const results = (await db.batch([
			runUpdate,
			eventInsert,
			completeReservation(
				db,
				reservation.id,
				userId,
				reservation.requestId,
				eventId,
				response,
				nextRevision,
				reservationCutoff,
			),
		] as never)) as unknown[];
		if (!hasExactlyOneReturnedRow(results[0])) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("CONFLICT", {
				message: "Command conflict: the run revision is no longer current.",
				data: { storedRevision: await readRevision(db, userId) },
			});
		}
		assertExactlyOneReturnedRow(results[1], "run event insert");
		assertExactlyOneReturnedRow(results[2], "command completion");
	} catch (cause: unknown) {
		if (cause instanceof ORPCError) throw cause;
		if (isUniqueConstraintError(cause)) {
			await releaseReservation(db, reservation.id);
			throw new ORPCError("CONFLICT", {
				message: "Command conflict: the run revision is no longer current.",
			});
		}
		throw cause;
	}
	return readCommittedResponse(db, userId, reservation.id, response);
}

function executeCommand(
	state: GameState,
	command: Exclude<ApplyCommand, { kind: "start_run" | "replace_run" }>,
): ReturnType<typeof advanceWeek> {
	switch (command.kind) {
		case "advance_week":
			return advanceWeek(state);
		case "apply_decision":
			return applyDecision(state, command.choice as DecisionChoice);
		case "assign_project":
			return assignProject(state, command.teamId, command.projectId);
		case "cancel_project":
			return cancelProject(state, command.teamId, command.projectId);
		case "design_model":
			return designModel(state, {
				name: command.name,
				family: command.family,
				foundation: command.foundation,
				parentModelId: command.parentModelId,
				tier: command.tier,
				dataMix: command.dataMix,
				emphasis: command.emphasis,
				teamId: command.teamId,
			} as ModelDesignSpec);
		case "run_evaluation":
			return runEvaluation(state, command.modelId, command.evaluation);
		case "launch_product":
			return launchProduct(state, command.modelId, command.channel);
		case "product_resume":
			return applyProductResume(state, command.productId);
		case "buy_compute":
			return buyCompute(state);
		case "hire_team":
			return hireTeam(state);
	}
}

function loadStoredState(row: Run): GameState {
	assertJsonNestingDepth(row.state);
	const { state, sourceSchemaVersion } = deserializeGameStateWithMetadata(
		row.state,
		{
			allowNegativeCash: row.status === "terminal",
		},
	);
	if (sourceSchemaVersion !== row.schemaVersion) {
		throw new Error(
			"Stored run schema version does not match its serialized engine state",
		);
	}
	if (state.rng.seed !== row.seed) {
		throw new Error("Stored run seed does not match its engine state");
	}
	if (state.meta.week !== row.currentWeek) {
		throw new Error("Stored run week does not match its engine state");
	}
	if ((state.terminal.status === "lost") !== (row.status === "terminal")) {
		throw new Error("Stored run status does not match its engine state");
	}
	assertWeekWithinLimit(row.currentWeek);
	assertCommandLogLimit(state.commandLog);
	return state;
}

function loadStoredRun(row: Run): Run {
	const state = loadStoredState(row);
	return {
		...row,
		schemaVersion: state.meta.schemaVersion,
		state: serializeAuthoritativeState(state),
		currentWeek: state.meta.week,
		status: state.terminal.status === "lost" ? "terminal" : "active",
	};
}

function serializeAuthoritativeState(state: GameState): string {
	const value = serializeGameState(state, {
		allowNegativeCash: state.company.cash < 0,
	});
	if (value.length > MAX_PERSISTED_STATE_LENGTH) {
		throw new Error("The authoritative state exceeds the persistence limit");
	}
	assertJsonNestingDepth(value);
	assertCommandLogLimit(state.commandLog);
	return value;
}

function serializeCommand(command: ApplyCommand): string {
	const value = JSON.stringify(command);
	if (value.length > MAX_COMMAND_JSON_LENGTH) {
		throw new Error("The command event exceeds the persistence limit");
	}
	return value;
}

function createResponse(
	id: string,
	seed: number,
	state: GameState,
	revision: number,
	stateJson: string,
): AuthoritativeRunResponse {
	return {
		id,
		seed,
		schemaVersion: state.meta.schemaVersion,
		state: stateJson,
		currentWeek: state.meta.week,
		status: state.terminal.status === "lost" ? "terminal" : "active",
		revision,
	};
}

function createServerSeed(): number {
	const values = new Uint32Array(1);
	crypto.getRandomValues(values);
	const seed = values[0] ?? 0;
	if (seed > MAX_SEED) {
		throw new Error("Web Crypto returned an invalid run seed");
	}
	return seed;
}

function assertExpectedRevision(
	existing: Run | undefined,
	expectedRevision: number,
	isStart: boolean,
): void {
	if (expectedRevision > MAX_REVISION) {
		throw new Error("Expected revision exceeds the request bound");
	}
	const storedRevision = existing?.revision ?? 0;
	if (expectedRevision !== storedRevision) {
		throw new Error("Expected revision does not match the stored run");
	}
	if (!isStart && existing === undefined) {
		throw new ORPCError("NOT_FOUND", {
			message: "No active run exists for this user.",
		});
	}
}

async function reserveRequest(
	db: AppDatabase,
	userId: string,
	requestId: string,
): Promise<CommandRequest> {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const reservationId = crypto.randomUUID();
		try {
			const inserted = await db
				.insert(commandRequests)
				.values({
					id: reservationId,
					userId,
					requestId,
					status: "pending",
					createdAt: new Date(),
				})
				.onConflictDoNothing({
					target: [commandRequests.userId, commandRequests.requestId],
				})
				.returning();
			const created = inserted[0];
			if (created !== undefined) return created;
		} catch (cause: unknown) {
			if (!isUniqueConstraintError(cause)) throw cause;
		}

		const rows = await db
			.select()
			.from(commandRequests)
			.where(
				and(
					eq(commandRequests.userId, userId),
					eq(commandRequests.requestId, requestId),
				),
			)
			.limit(1);
		const existing = rows[0];
		if (existing === undefined) continue;
		if (existing.status === "pending") {
			const staleCutoff = reservationCutoffSeconds();
			const removed = await db
				.delete(commandRequests)
				.where(
					and(
						eq(commandRequests.id, existing.id),
						eq(commandRequests.userId, userId),
						eq(commandRequests.status, "pending"),
						sql`${commandRequests.createdAt} < ${staleCutoff}`,
					),
				)
				.returning({ id: commandRequests.id });
			if (removed.length > 0) continue;
			throw new ORPCError("CONFLICT", {
				message:
					"This command request is already in progress; retry it shortly.",
			});
		}
		return existing;
	}

	throw new ORPCError("CONFLICT", {
		message: "This command request could not be reserved; retry it shortly.",
	});
}

function reservationCutoffSeconds(now = Date.now()): number {
	return Math.floor((now - PENDING_RESERVATION_TTL_MS) / 1000);
}

function reservationIsLive(
	reservationId: string,
	userId: string,
	cutoffSeconds: number,
) {
	return sql`EXISTS (
		SELECT 1
		FROM command_requests
		WHERE id = ${reservationId}
			AND user_id = ${userId}
			AND status = 'pending'
			AND created_at >= ${cutoffSeconds}
	)`;
}

function toSqliteTimestamp(value: Date): number {
	return Math.floor(value.getTime() / 1000);
}

function hasExactlyOneReturnedRow(value: unknown): value is [unknown] {
	return Array.isArray(value) && value.length === 1;
}

function assertExactlyOneReturnedRow(value: unknown, operation: string): void {
	if (!hasExactlyOneReturnedRow(value)) {
		throw new Error(`${operation} did not affect exactly one row`);
	}
}

function completeReservation(
	db: AppDatabase,
	reservationId: string,
	userId: string,
	requestId: string,
	eventId: string,
	response: AuthoritativeRunResponse,
	revision: number,
	cutoffSeconds: number,
) {
	return db
		.update(commandRequests)
		.set({
			status: "completed",
			responseJson: JSON.stringify(response),
			revision,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(commandRequests.id, reservationId),
				eq(commandRequests.userId, userId),
				eq(commandRequests.status, "pending"),
				sql`${commandRequests.createdAt} >= ${cutoffSeconds}`,
				sql`EXISTS (
					SELECT 1
					FROM run_events
					WHERE id = ${eventId}
						AND run_id = ${response.id}
						AND revision = ${revision}
						AND request_id = ${requestId}
				)`,
			),
		)
		.returning({ id: commandRequests.id });
}

async function releaseReservation(
	db: AppDatabase,
	reservationId: string,
): Promise<void> {
	try {
		await db
			.delete(commandRequests)
			.where(
				and(
					eq(commandRequests.id, reservationId),
					eq(commandRequests.status, "pending"),
				),
			);
	} catch {
		// Keep the original command error; a failed cleanup is operationally visible.
	}
}

function readCompletedResponse(
	reservation: CommandRequest,
): AuthoritativeRunResponse {
	if (reservation.responseJson === null || reservation.revision === null) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Completed command response is missing.",
		});
	}
	try {
		const response: unknown = JSON.parse(reservation.responseJson);
		if (
			!isAuthoritativeRunResponse(response) ||
			response.revision !== reservation.revision
		) {
			throw new Error("invalid completed response");
		}
		return response;
	} catch {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Completed command response is malformed.",
		});
	}
}

function isAuthoritativeRunResponse(
	value: unknown,
): value is AuthoritativeRunResponse {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const response = value as Record<string, unknown>;
	return (
		typeof response.id === "string" &&
		typeof response.seed === "number" &&
		Number.isSafeInteger(response.seed) &&
		typeof response.schemaVersion === "number" &&
		Number.isSafeInteger(response.schemaVersion) &&
		typeof response.state === "string" &&
		typeof response.currentWeek === "number" &&
		Number.isSafeInteger(response.currentWeek) &&
		(response.status === "active" || response.status === "terminal") &&
		typeof response.revision === "number" &&
		Number.isSafeInteger(response.revision)
	);
}

function responsesMatch(
	left: AuthoritativeRunResponse,
	right: AuthoritativeRunResponse,
): boolean {
	return (
		left.id === right.id &&
		left.seed === right.seed &&
		left.schemaVersion === right.schemaVersion &&
		left.state === right.state &&
		left.currentWeek === right.currentWeek &&
		left.status === right.status &&
		left.revision === right.revision
	);
}

async function readCommittedResponse(
	db: AppDatabase,
	userId: string,
	reservationId: string,
	fallback: AuthoritativeRunResponse,
): Promise<AuthoritativeRunResponse> {
	const requests = await db
		.select()
		.from(commandRequests)
		.where(eq(commandRequests.id, reservationId))
		.limit(1);
	const request = requests[0];
	if (request === undefined || request.status !== "completed") {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Command completion was not persisted.",
		});
	}
	const committed = readCompletedResponse(request);
	const storedRows = await db
		.select()
		.from(runs)
		.where(eq(runs.userId, userId))
		.limit(1);
	const stored = storedRows[0];
	if (
		stored === undefined ||
		stored.id !== committed.id ||
		stored.seed !== committed.seed ||
		stored.schemaVersion !== committed.schemaVersion ||
		stored.state !== committed.state ||
		stored.currentWeek !== committed.currentWeek ||
		stored.status !== committed.status ||
		stored.revision !== committed.revision ||
		!responsesMatch(committed, fallback)
	) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Authoritative run readback did not match the command result.",
		});
	}
	return committed;
}

async function readRevision(db: AppDatabase, userId: string): Promise<number> {
	const rows = await db
		.select({ revision: runs.revision })
		.from(runs)
		.where(eq(runs.userId, userId))
		.limit(1);
	return rows[0]?.revision ?? 0;
}
