import { GAME_STATE_SCHEMA_VERSION, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { createRequestId, normalizeActiveRun } from "./orpc";

describe("server command request ids", () => {
	it("creates a bounded opaque id for each user action", () => {
		const first = createRequestId();
		const second = createRequestId();

		expect(first).not.toBe(second);
		expect(first.length).toBeGreaterThan(0);
		expect(first.length).toBeLessThanOrEqual(128);
	});
});

describe("active run schema normalization", () => {
	it("returns the current schema metadata for a current v1 run", () => {
		const state = startRun({ companyName: "Web Migration Labs" }, 23);

		const normalized = normalizeActiveRun({
			id: "run-id",
			seed: state.rng.seed,
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			state: JSON.stringify(state),
			currentWeek: state.meta.week,
			status: "active",
			revision: 1,
		});

		expect(normalized).toMatchObject({
			id: "run-id",
			seed: state.rng.seed,
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			state,
		});
	});

	it("rejects envelope and raw-state schema version mismatches", () => {
		const state = startRun({ companyName: "Web Migration Labs" }, 23);

		expect(() =>
			normalizeActiveRun({
				state: JSON.stringify(state),
				schemaVersion: GAME_STATE_SCHEMA_VERSION + 1,
			}),
		).toThrow(/schema version/i);
	});

	it("rejects future state versions", () => {
		const state = startRun({ companyName: "Web Migration Labs" }, 23);
		const futureState = JSON.parse(JSON.stringify(state)) as {
			meta: { schemaVersion: number };
		};
		futureState.meta.schemaVersion = GAME_STATE_SCHEMA_VERSION + 1;

		expect(() =>
			normalizeActiveRun({
				state: JSON.stringify(futureState),
				schemaVersion: GAME_STATE_SCHEMA_VERSION + 1,
			}),
		).toThrow(/newer|unsupported.*version/i);
	});

	it("rejects malformed raw state JSON", () => {
		expect(() =>
			normalizeActiveRun({
				state: "{not-json",
				schemaVersion: GAME_STATE_SCHEMA_VERSION,
			}),
		).toThrow(/json/i);
	});

	it("preserves zero seed and revision metadata with a positive week", () => {
		const state = startRun({ companyName: "Web Migration Labs" }, 0);

		const normalized = normalizeActiveRun({
			id: "run-id",
			seed: 0,
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			state: JSON.stringify(state),
			currentWeek: 1,
			status: "active",
			revision: 0,
		});

		expect(normalized).toMatchObject({
			seed: 0,
			currentWeek: 1,
			revision: 0,
		});
	});

	it.each([
		["seed", -1, "Saved run seed"],
		["currentWeek", -1, "Saved run week"],
		["revision", -1, "Saved run revision"],
	] as const)("rejects negative %s metadata", (key, value, label) => {
		const state = startRun({ companyName: "Web Migration Labs" }, 23);
		const record: Record<string, unknown> = {
			id: "run-id",
			seed: state.rng.seed,
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			state: JSON.stringify(state),
			currentWeek: state.meta.week,
			status: "active",
			revision: 0,
		};
		record[key] = value;

		expect(() => normalizeActiveRun(record)).toThrow(
			`${label} must be a non-negative safe integer`,
		);
	});

	it.each([
		["seed", -0, "Saved run seed"],
		["currentWeek", -0, "Saved run week"],
		["revision", -0, "Saved run revision"],
	] as const)("rejects negative-zero %s metadata", (key, value, label) => {
		const state = startRun({ companyName: "Web Migration Labs" }, 23);
		const record: Record<string, unknown> = {
			id: "run-id",
			seed: state.rng.seed,
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			state: JSON.stringify(state),
			currentWeek: state.meta.week,
			status: "active",
			revision: 0,
		};
		record[key] = value;

		expect(() => normalizeActiveRun(record)).toThrow(
			`${label} must be a non-negative safe integer`,
		);
	});
});
