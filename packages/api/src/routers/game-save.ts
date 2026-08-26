import {
	type AppDatabase,
	and,
	eq,
	type NewRun,
	type Run,
	runs,
} from "@ai-lab-tycoon/db";
import { z } from "zod";

import { authedProcedure } from "../authed-procedure";

const activeRunInput = z.object({
	seed: z.number().int().nonnegative(),
	state: z.string().min(1),
	currentWeek: z.number().int().nonnegative(),
	status: z.enum(["active", "terminal"]).default("active"),
	schemaVersion: z.number().int().positive().default(1),
	/** Expected current revision for optimistic concurrency; omit on create. */
	revision: z.number().int().nonnegative().optional(),
});

/**
 * Authenticated game-save procedures. Every handler keys data by
 * session.user.id — a client-supplied owner id is never accepted. The
 * anonymous Better Auth plugin guarantees a stable userId per browser.
 */
export const gameSaveRouter = {
	/** Load the current user's active run, or null when none exists. */
	getActiveRun: authedProcedure
		.input(z.undefined())
		.handler(async ({ context }): Promise<Run | null> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new Error("Unauthorized");
			}
			const rows = await db
				.select()
				.from(runs)
				.where(eq(runs.userId, userId))
				.limit(1);
			return rows[0] ?? null;
		}),

	/**
	 * Insert-or-update the current user's single active run. Enforces one
	 * run per user via the unique index on runs.userId and optimistic
	 * concurrency: a stale write (mismatched revision) returns a conflict.
	 */
	upsertActiveRun: authedProcedure
		.input(activeRunInput)
		.handler(async ({ context, input }): Promise<Run> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new Error("Unauthorized");
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
					throw new Error("Failed to create run");
				}
				return created;
			}

			// Optimistic concurrency: the client must send the revision it last
			// read; otherwise a newer save exists and we must not overwrite it.
			const expectedRevision = input.revision ?? 0;
			if (row.revision !== expectedRevision) {
				const conflict = new Error("Save conflict: state changed elsewhere");
				(conflict as { code?: number }).code = 409;
				throw conflict;
			}

			const updated = await db
				.update(runs)
				.set({
					seed: input.seed,
					state: input.state,
					currentWeek: input.currentWeek,
					status: input.status,
					schemaVersion: input.schemaVersion,
					revision: row.revision + 1,
					updatedAt: now,
				})
				.where(and(eq(runs.id, row.id), eq(runs.userId, userId)))
				.returning();
			const updatedRow = updated[0];
			if (updatedRow === undefined) {
				throw new Error("Failed to update run");
			}
			return updatedRow;
		}),

	/** Delete the current user's run. Returns true when a row was removed. */
	deleteActiveRun: authedProcedure
		.input(z.undefined())
		.handler(async ({ context }): Promise<boolean> => {
			const db = context.db as AppDatabase;
			const userId = context.user?.id;
			if (userId === undefined) {
				throw new Error("Unauthorized");
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
