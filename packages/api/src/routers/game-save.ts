import {
	type AppDatabase,
	and,
	desc,
	eq,
	type NewRun,
	type Run,
	runs,
	sql,
} from "@ai-lab-tycoon/db";
import {
	assertGameState,
	GAME_STATE_SCHEMA_VERSION,
} from "@ai-lab-tycoon/engine";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { authedProcedure } from "../authed-procedure";
import {
	assertCommandLogLimit,
	assertJsonNestingDepth,
} from "./game-save-validation";

const activeRunInput = z.object({
	seed: z.number().int().nonnegative(),
	state: z.string().min(1).max(2_000_000),
	currentWeek: z.number().int().nonnegative(),
	status: z.enum(["active", "terminal"]).default("active"),
	schemaVersion: z.number().int().positive().default(GAME_STATE_SCHEMA_VERSION),
	/** Expected current revision for optimistic concurrency; omit on create. */
	revision: z.number().int().nonnegative().optional(),
});

/**
 * Authenticated game-save procedures. Every handler keys data by
 * session.user.id — a client-supplied owner id is never accepted. The
 * anonymous Better Auth plugin guarantees a stable userId per browser.
 *
 * Failures surface as real oRPC errors so clients can branch on
 * `error.code`: UNAUTHORIZED (401) and CONFLICT (409) here.
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
			return rows[0] ?? null;
		}),

	/**
	 * Insert-or-update the current user's single active run. Enforces one
	 * run per user via the unique index on runs.userId and optimistic
	 * concurrency: a stale write (mismatched revision) raises CONFLICT and
	 * never overwrites a newer save.
	 */
	upsertActiveRun: authedProcedure
		.input(activeRunInput)
		.handler(async ({ context, input }): Promise<Run> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new ORPCError("UNAUTHORIZED");
			}

			try {
				assertJsonNestingDepth(input.state);
				const state: unknown = JSON.parse(input.state);
				assertGameState(state);
				assertCommandLogLimit(state.commandLog);
				if (state.meta.schemaVersion !== input.schemaVersion) {
					throw new Error(
						`Game state schema version ${state.meta.schemaVersion} does not match the save envelope version ${input.schemaVersion}`,
					);
				}
				if (state.meta.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
					throw new Error(
						`Unsupported game state schema version: ${state.meta.schemaVersion}`,
					);
				}
				if (state.rng.seed !== input.seed) {
					throw new Error(
						`Game state seed ${state.rng.seed} does not match the save envelope seed ${input.seed}`,
					);
				}
				if (
					(input.status === "terminal") !==
					(state.terminal.status === "lost")
				) {
					throw new Error(
						"Save status must match the terminal status in the game state",
					);
				}
			} catch (cause: unknown) {
				throw new ORPCError("UNPROCESSABLE_CONTENT", {
					message:
						cause instanceof Error
							? `Invalid game state: ${cause.message}`
							: "Invalid game state",
				});
			}

			const now = new Date();
			const existing = await db
				.select()
				.from(runs)
				.where(eq(runs.userId, userId))
				.limit(1);
			const row = existing[0];

			if (row === undefined) {
				const inserted: NewRun = {
					id: crypto.randomUUID(),
					userId,
					seed: input.seed,
					state: input.state,
					currentWeek: input.currentWeek,
					status: input.status,
					schemaVersion: input.schemaVersion,
					revision: 1,
					createdAt: now,
					updatedAt: now,
				};
				const result = await db.insert(runs).values(inserted).returning();
				const created = result[0];
				if (created === undefined) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Failed to create run",
					});
				}
				return created;
			}

			// Atomic compare-and-swap: the revision is checked and incremented in
			// the same UPDATE so concurrent saves cannot both succeed.
			const expectedRevision = input.revision ?? 0;
			const updated = await db
				.update(runs)
				.set({
					seed: input.seed,
					state: input.state,
					currentWeek: input.currentWeek,
					status: input.status,
					schemaVersion: input.schemaVersion,
					revision: sql<number>`${runs.revision} + 1`,
					updatedAt: now,
				})
				.where(
					and(
						eq(runs.id, row.id),
						eq(runs.userId, userId),
						eq(runs.revision, expectedRevision),
					),
				)
				.returning();
			const updatedRow = updated[0];
			if (updatedRow !== undefined) {
				return updatedRow;
			}

			const currentRows = await db
				.select()
				.from(runs)
				.where(eq(runs.userId, userId))
				.orderBy(desc(runs.updatedAt))
				.limit(1);
			const currentRow = currentRows[0];
			if (currentRow !== undefined) {
				throw new ORPCError("CONFLICT", {
					message: "Save conflict: this run was saved elsewhere more recently.",
					data: { storedRevision: currentRow.revision },
				});
			}
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Run disappeared while updating",
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

// Re-export helpers for type-level clarity.
export { activeRunInput };
