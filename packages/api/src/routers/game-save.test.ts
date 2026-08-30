import { vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { runEvents, runs } from "@ai-lab-tycoon/db";
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

const startInput = (requestId: string, expectedRevision = 0) => ({
	requestId,
	expectedRevision,
	command: {
		kind: "start_run" as const,
		setup: { companyName: "Test Lab" },
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
