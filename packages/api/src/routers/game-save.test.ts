import { vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { commandRequests, runEvents, runs } from "@ai-lab-tycoon/db";
import {
	applyProductResume,
	GAME_STATE_SCHEMA_VERSION,
	type GameState,
	serializeGameState,
} from "@ai-lab-tycoon/engine";
import { createClient } from "@libsql/client";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";
import { gameSaveRouter } from "./game-save";
import { applyCommandInput } from "./game-save-command";

const schema = { runEvents, runs } as const;
type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

async function createTestDatabase(userId = "user-1"): Promise<TestDatabase> {
	const client = createClient({ url: "file::memory:" });
	const db = drizzle(client, { schema });
	await db.run(sql.raw("PRAGMA foreign_keys = ON"));
	await db.run(
		sql.raw(
			"CREATE TABLE `user` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `email` text NOT NULL, `email_verified` integer NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL)",
		),
	);
	await db.run(
		sql.raw(
			"CREATE TABLE `runs` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `seed` integer NOT NULL, `schema_version` integer NOT NULL, `state` text NOT NULL, `current_week` integer NOT NULL, `status` text NOT NULL, `revision` integer NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE)",
		),
	);
	await db.run(
		sql.raw("CREATE UNIQUE INDEX `runs_user_id_unique` ON `runs` (`user_id`)"),
	);
	await db.run(
		sql.raw(
			"CREATE TABLE `run_events` (`id` text PRIMARY KEY NOT NULL, `run_id` text NOT NULL, `revision` integer NOT NULL, `request_id` text NOT NULL, `command_kind` text NOT NULL, `command_json` text NOT NULL, `created_at` integer NOT NULL, FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON DELETE CASCADE)",
		),
	);
	await db.run(
		sql.raw(
			"CREATE UNIQUE INDEX `run_events_run_revision_unique` ON `run_events` (`run_id`, `revision`)",
		),
	);
	await db.run(
		sql.raw(
			"CREATE TABLE `command_requests` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `request_id` text NOT NULL, `status` text NOT NULL DEFAULT 'pending', `response_json` text, `revision` integer, `created_at` integer NOT NULL, `completed_at` integer, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE)",
		),
	);
	await db.run(
		sql.raw(
			"CREATE UNIQUE INDEX `command_requests_user_request_unique` ON `command_requests` (`user_id`, `request_id`)",
		),
	);
	await client.execute({
		sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		args: [userId, "Test User", `${userId}@test.invalid`, 0, 0, 0],
	});
	if (userId !== "user-2") {
		await client.execute({
			sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			args: ["user-2", "Other User", "user-2@test.invalid", 0, 0, 0],
		});
	}
	return db;
}

async function apply(db: TestDatabase, userId: string, input: unknown) {
	const procedure = gameSaveRouter.applyCommand.callable({
		context: {
			db: db as never,
			user: { id: userId },
			session: { userId },
			auth: null,
		},
	});
	return procedure(input as never);
}

async function getActive(db: TestDatabase, userId: string) {
	const procedure = gameSaveRouter.getActiveRun.callable({
		context: {
			db: db as never,
			user: { id: userId },
			session: { userId },
			auth: null,
		},
	});
	return procedure(undefined);
}

const startInput = (requestId: string, expectedRevision = 0) => ({
	requestId,
	expectedRevision,
	command: {
		kind: "start_run" as const,
		setup: { companyName: "Test Lab" },
	},
});

async function installPausedProduct(
	db: TestDatabase,
	started: { state: string },
): Promise<GameState> {
	const state = JSON.parse(started.state) as GameState;
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) {
		throw new Error("Expected Text model family unlock");
	}
	familyUnlock.status = "completed";
	state.models = {
		...state.models,
		activeModelId: "model_001",
		items: [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "launched",
				projectId: null,
				family: "text",
				tier: "standard",
				scoreCeiling: 88,
				dataMix: { general: 70, code: 20, multimodal: 10 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				trueScores: {
					capability: 70,
					coding: 60,
					reliability: 60,
					safety: 60,
					efficiency: 60,
					multimodal: 0,
				},
				estimates: {
					capability: { estimate: 60, lower: 40, upper: 80 },
					coding: { estimate: 60, lower: 40, upper: 80 },
					reliability: { estimate: 60, lower: 40, upper: 80 },
					safety: { estimate: 60, lower: 40, upper: 80 },
					efficiency: { estimate: 60, lower: 40, upper: 80 },
					multimodal: { estimate: 0, lower: 0, upper: 20 },
				},
			},
		],
	};
	state.products = {
		items: [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_001",
				status: "paused",
				users: 17,
				lastRevenue: 0,
				cumulativeRevenue: 123,
				servingDemand: 0,
				effectiveQuality: 60,
			},
		],
	};
	await db
		.update(runs)
		.set({
			state: serializeGameState(state),
			currentWeek: state.meta.week,
			schemaVersion: state.meta.schemaVersion,
		})
		.where(eq(runs.userId, "user-1"));
	return state;
}

const replaceInput = (requestId: string, expectedRevision: number) => ({
	requestId,
	expectedRevision,
	command: {
		kind: "replace_run" as const,
		setup: { companyName: "Replacement Lab" },
	},
});

describe("game save router", () => {
	it("executes a server-authoritative start command and persists one event", async () => {
		const db = await createTestDatabase();
		const result = await apply(db, "user-1", startInput("start-1"));

		expect(result.revision).toBe(1);
		expect(result.seed).toBeGreaterThanOrEqual(0);
		expect(JSON.parse(result.state).rng.seed).toBe(result.seed);
		expect(
			await db.select().from(runs).where(eq(runs.userId, "user-1")),
		).toHaveLength(1);
		expect(
			await db.select().from(runEvents).where(eq(runEvents.runId, result.id)),
		).toHaveLength(1);
	});

	it("loads current v1 rows and reports current schema metadata", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("load-v1"));

		const loaded = await getActive(db, "user-1");
		expect(loaded).toMatchObject({
			id: started.id,
			seed: started.seed,
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			currentWeek: 1,
			status: "active",
		});
		expect(JSON.parse(loaded?.state ?? "{}").meta.schemaVersion).toBe(
			GAME_STATE_SCHEMA_VERSION,
		);
	});

	it("writes current schema metadata after loading a persisted state", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("rewrite-v1"));
		await db
			.update(runs)
			.set({ state: ` ${started.state} ` })
			.where(eq(runs.userId, "user-1"));

		const advanced = await apply(db, "user-1", {
			requestId: "rewrite-v1-command",
			expectedRevision: started.revision,
			command: { kind: "buy_compute" },
		});
		const stored = (
			await db.select().from(runs).where(eq(runs.userId, "user-1"))
		)[0];

		expect(advanced.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(stored?.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(JSON.parse(stored?.state ?? "{}").meta.schemaVersion).toBe(
			GAME_STATE_SCHEMA_VERSION,
		);
	});

	it("rejects a row schema version that does not match the raw state", async () => {
		const db = await createTestDatabase();
		await apply(db, "user-1", startInput("load-mismatch"));
		await db
			.update(runs)
			.set({ schemaVersion: GAME_STATE_SCHEMA_VERSION + 1 })
			.where(eq(runs.userId, "user-1"));

		await expect(getActive(db, "user-1")).rejects.toThrow(/schema version/i);
	});

	it("rejects a future state version at the API load boundary", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("load-future"));
		const futureState = JSON.parse(started.state) as {
			meta: { schemaVersion: number };
		};
		futureState.meta.schemaVersion = GAME_STATE_SCHEMA_VERSION + 1;
		await db
			.update(runs)
			.set({
				schemaVersion: GAME_STATE_SCHEMA_VERSION + 1,
				state: JSON.stringify(futureState),
			})
			.where(eq(runs.userId, "user-1"));

		await expect(getActive(db, "user-1")).rejects.toThrow(
			/newer|unsupported.*version/i,
		);
	});

	it("rejects malformed serialized state at the API load boundary", async () => {
		const db = await createTestDatabase();
		await apply(db, "user-1", startInput("load-malformed"));
		await db
			.update(runs)
			.set({ state: "{not-json" })
			.where(eq(runs.userId, "user-1"));

		await expect(getActive(db, "user-1")).rejects.toThrow(/json/i);
	});
	it("rejects unauthenticated calls before loading or mutating the database", async () => {
		const db = await createTestDatabase();
		const procedure = gameSaveRouter.applyCommand.callable({
			context: {
				db: db as never,
				user: null,
				session: null,
				auth: null,
			},
		});

		await expect(
			procedure(startInput("unauthenticated")),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("executes a valid command against the stored state, not a request state blob", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("start-2"));
		const before = JSON.parse(started.state);
		const advanced = await apply(db, "user-1", {
			requestId: "compute-1",
			expectedRevision: started.revision,
			command: { kind: "buy_compute" },
		});
		const after = JSON.parse(advanced.state);

		expect(advanced.revision).toBe(2);
		expect(after.company.cash).toBeLessThan(before.company.cash);
		expect(after.compute.capacity).toBeGreaterThan(before.compute.capacity);
		expect(after.company.cash).not.toBe(999_999_999);
		const events = await db
			.select()
			.from(runEvents)
			.where(eq(runEvents.runId, advanced.id));
		expect(events).toHaveLength(2);
		expect(events[1]).toMatchObject({
			revision: 2,
			requestId: "compute-1",
			commandKind: "buy_compute",
		});
		expect(JSON.parse(events[1]?.commandJson ?? "{}")).toEqual({
			kind: "buy_compute",
		});
		const requests = await db
			.select()
			.from(commandRequests)
			.where(eq(commandRequests.requestId, "compute-1"));
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			status: "completed",
			revision: 2,
		});
	});

	it("rejects forged state fields at the procedure boundary without persisting them", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("attack-start"));
		const before = await db
			.select()
			.from(runs)
			.where(eq(runs.userId, "user-1"));

		await expect(
			apply(db, "user-1", {
				requestId: "attack-command",
				expectedRevision: started.revision,
				command: { kind: "buy_compute" },
				cash: 999_999_999,
				research: { forged: true },
				rng: { streams: { incidents: [1, 2, 3, 4] } },
			}),
		).rejects.toThrow();

		const after = await db.select().from(runs).where(eq(runs.userId, "user-1"));
		expect(after).toEqual(before);
		expect(
			await db.select().from(runEvents).where(eq(runEvents.runId, started.id)),
		).toHaveLength(1);
	});

	it("returns the original result for a duplicate request without a second revision", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("duplicate-1"));
		const first = await apply(db, "user-1", {
			requestId: "duplicate-command",
			expectedRevision: started.revision,
			command: { kind: "buy_compute" },
		});
		const second = await apply(db, "user-1", {
			requestId: "duplicate-command",
			expectedRevision: started.revision,
			command: { kind: "buy_compute" },
		});

		expect(second).toEqual(first);
		expect(
			await db.select().from(runs).where(eq(runs.userId, "user-1")),
		).toHaveLength(1);
		expect(
			await db.select().from(runEvents).where(eq(runEvents.runId, first.id)),
		).toHaveLength(2);
	});

	it("recovers a stale pending request reservation", async () => {
		const db = await createTestDatabase();
		await db.insert(commandRequests).values({
			id: "stale-reservation-row",
			userId: "user-1",
			requestId: "stale-reservation",
			status: "pending",
			createdAt: new Date(Date.now() - 6 * 60 * 1000),
		});

		const result = await apply(db, "user-1", startInput("stale-reservation"));

		expect(result.revision).toBe(1);
		expect(
			await db
				.select()
				.from(commandRequests)
				.where(eq(commandRequests.requestId, "stale-reservation")),
		).toHaveLength(1);
		expect(
			(
				await db
					.select()
					.from(commandRequests)
					.where(eq(commandRequests.requestId, "stale-reservation"))
			)[0]?.status,
		).toBe("completed");
	});

	it("rejects a stale revision and leaves the stored state unchanged", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("stale-1"));
		await apply(db, "user-1", {
			requestId: "fresh-1",
			expectedRevision: started.revision,
			command: { kind: "buy_compute" },
		});

		await expect(
			apply(db, "user-1", {
				requestId: "stale-2",
				expectedRevision: started.revision,
				command: { kind: "buy_compute" },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("does not let another user address the first user's run", async () => {
		const db = await createTestDatabase("user-1");
		await apply(db, "user-1", startInput("owner-1"));
		await expect(
			apply(db, "user-2", {
				requestId: "other-user",
				expectedRevision: 1,
				command: { kind: "buy_compute" },
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects terminal run mutation", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("terminal-1"));
		const terminalState = JSON.parse(started.state);
		terminalState.company.cash = 0;
		terminalState.terminal = {
			...terminalState.terminal,
			status: "lost",
			reason: "cash_depleted",
			contributors: [
				{ kind: "resource_changed", impact: 0, week: 1, index: 0 },
				{ kind: "resource_changed", impact: 0, week: 1, index: 1 },
				{ kind: "resource_changed", impact: 0, week: 1, index: 2 },
			],
		};
		await db
			.update(runs)
			.set({ status: "terminal", state: JSON.stringify(terminalState) })
			.where(and(eq(runs.userId, "user-1"), eq(runs.revision, 1)));

		await expect(
			apply(db, "user-1", {
				requestId: "terminal-2",
				expectedRevision: 1,
				command: { kind: "buy_compute" },
			}),
		).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
	});

	it("rejects a plain start when an active run already exists", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("plain-existing"));

		await expect(
			apply(db, "user-1", startInput("plain-existing-retry", started.revision)),
		).rejects.toMatchObject({ code: "CONFLICT" });

		expect(
			await db.select().from(runs).where(eq(runs.userId, "user-1")),
		).toEqual(await db.select().from(runs).where(eq(runs.id, started.id)));
	});

	it("rejects a plain start when the existing run is terminal", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("plain-terminal"));
		const terminalState = JSON.parse(started.state);
		terminalState.company.cash = 0;
		terminalState.terminal = {
			...terminalState.terminal,
			status: "lost",
			reason: "cash_depleted",
			contributors: [
				{ kind: "resource_changed", impact: 0, week: 1, index: 0 },
				{ kind: "resource_changed", impact: 0, week: 1, index: 1 },
				{ kind: "resource_changed", impact: 0, week: 1, index: 2 },
			],
		};
		await db
			.update(runs)
			.set({ status: "terminal", state: JSON.stringify(terminalState) })
			.where(and(eq(runs.userId, "user-1"), eq(runs.revision, 1)));

		await expect(
			apply(db, "user-1", startInput("plain-terminal-retry", started.revision)),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("allows explicit replacement of a terminal run with its current revision", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("replace-terminal"));
		const terminalState = JSON.parse(started.state);
		terminalState.company.cash = 0;
		terminalState.terminal = {
			...terminalState.terminal,
			status: "lost",
			reason: "cash_depleted",
			contributors: [
				{ kind: "resource_changed", impact: 0, week: 1, index: 0 },
				{ kind: "resource_changed", impact: 0, week: 1, index: 1 },
				{ kind: "resource_changed", impact: 0, week: 1, index: 2 },
			],
		};
		await db
			.update(runs)
			.set({ status: "terminal", state: JSON.stringify(terminalState) })
			.where(and(eq(runs.userId, "user-1"), eq(runs.revision, 1)));

		const replaced = await apply(
			db,
			"user-1",
			replaceInput("replace-terminal-confirmed", started.revision),
		);

		expect(replaced.id).toBe(started.id);
		expect(replaced.revision).toBe(2);
		expect(JSON.parse(replaced.state).company.name).toBe("Replacement Lab");
		expect(
			await db.select().from(runs).where(eq(runs.userId, "user-1")),
		).toHaveLength(1);
		const events = await db
			.select()
			.from(runEvents)
			.where(eq(runEvents.runId, replaced.id));
		expect(events).toHaveLength(2);
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					revision: 2,
					requestId: "replace-terminal-confirmed",
					commandKind: "replace_run",
				}),
			]),
		);
	});

	it("retains one important product-resume report and matches the engine after reload", async () => {
		const db = await createTestDatabase();
		const started = await apply(db, "user-1", startInput("resume-start"));
		const paused = await installPausedProduct(db, started);

		const resumed = await apply(db, "user-1", {
			requestId: "resume-command",
			expectedRevision: started.revision,
			command: { kind: "product_resume", productId: "product_001" },
		});
		const resumedState = JSON.parse(resumed.state) as GameState;
		const report = resumedState.reports.items[0];

		expect(resumedState.products.items[0]?.status).toBe("operating");
		expect(resumedState.reports.items).toHaveLength(1);
		expect(resumedState.reports.totalCount).toBe(1);
		expect(report).toMatchObject({
			priority: "important",
			fact: {
				kind: "product_resumed",
				productId: "product_001",
				channel: "chat",
				week: 1,
			},
		});
		expect(resumedState.queue.reportIds).toEqual([report?.id]);
		expect(
			await getActive(db, "user-1").then((loaded) =>
				JSON.parse(loaded?.state ?? "{}"),
			),
		).toEqual(resumedState);
		expect(
			serializeGameState(applyProductResume(paused, "product_001").state),
		).toBe(resumed.state);

		const retried = await apply(db, "user-1", {
			requestId: "resume-command",
			expectedRevision: started.revision,
			command: { kind: "product_resume", productId: "product_001" },
		});
		expect(retried).toEqual(resumed);
		expect(
			await db.select().from(runEvents).where(eq(runEvents.runId, resumed.id)),
		).toHaveLength(2);
	});

	it("rejects an explicit replacement with a stale revision", async () => {
		const db = await createTestDatabase();
		const started = await apply(
			db,
			"user-1",
			startInput("replace-stale-start"),
		);
		const advanced = await apply(db, "user-1", {
			requestId: "replace-stale-advance",
			expectedRevision: started.revision,
			command: { kind: "buy_compute" },
		});

		await expect(
			apply(db, "user-1", replaceInput("replace-stale", started.revision)),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const stored = await db
			.select()
			.from(runs)
			.where(eq(runs.userId, "user-1"));
		expect(stored[0]?.id).toBe(advanced.id);
		expect(stored[0]?.revision).toBe(advanced.revision);
	});
});

describe("applyCommand attack surface", () => {
	it("rejects forged cash, research, RNG, and incident-roll fields", () => {
		expect(() =>
			applyCommandInput.parse({
				...startInput("attack-1"),
				cash: 999_999_999,
				research: { completed: ["all"] },
				rng: { streams: { incidents: [1, 2, 3, 4] } },
			}),
		).toThrow();
		expect(() =>
			applyCommandInput.parse({
				requestId: "attack-2",
				expectedRevision: 1,
				command: { kind: "advance_week", incidentRolls: [0] },
			}),
		).toThrow();
	});

	it("has no full-state upsert procedure and enforces payload bounds", () => {
		expect("upsertActiveRun" in gameSaveRouter).toBe(false);
		expect(() =>
			applyCommandInput.parse({ ...startInput(""), requestId: "" }),
		).toThrow();
		expect(() =>
			applyCommandInput.parse({
				...startInput("bounds-1"),
				expectedRevision: 1_000_001,
			}),
		).toThrow();
	});
});
