import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A single playthrough of the game. The deterministic engine state blob is
 * persisted here so runs can be resumed and replayed (replay-from-fork).
 */
export const runs = sqliteTable("runs", {
	id: text("id").primaryKey(),
	seed: integer("seed").notNull(),
	/** Engine schema version for save migration gating. */
	schemaVersion: integer("schema_version").notNull().default(1),
	/** Full serialized engine state (JSON). */
	state: text("state").notNull(),
	currentWeek: integer("current_week").notNull().default(0),
	status: text("status", { enum: ["active", "won", "lost"] })
		.notNull()
		.default("active"),
	endingId: text("ending_id"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

/**
 * Append-only log of engine facts per run — the source material for the
 * Company Chronicle and reports (facts-as-the-only-narrative-output).
 */
export const runEvents = sqliteTable("run_events", {
	id: text("id").primaryKey(),
	runId: text("run_id")
		.notNull()
		.references(() => runs.id, { onDelete: "cascade" }),
	week: integer("week").notNull(),
	type: text("type").notNull(),
	payload: text("payload").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunEvent = typeof runEvents.$inferSelect;
