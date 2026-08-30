import { describe, expect, it } from "vitest";

import {
	assertCommandLogLimit,
	assertCurrentWeekMatchesState,
	assertExistingRunUpdateAllowed,
	assertJsonNestingDepth,
	assertWeekWithinLimit,
	isUniqueConstraintError,
	MAX_COMMAND_LOG_ENTRIES,
	MAX_JSON_NESTING_DEPTH,
	MAX_PUBLIC_SAVE_ERROR_LENGTH,
	MAX_RUN_WEEK,
	sanitizePublicSaveError,
} from "./game-save-validation";

describe("game save request bounds", () => {
	it("accepts a command log at the configured maximum", () => {
		expect(() =>
			assertCommandLogLimit({ length: MAX_COMMAND_LOG_ENTRIES }),
		).not.toThrow();
	});

	it("rejects a command log above the configured maximum", () => {
		expect(() =>
			assertCommandLogLimit({ length: MAX_COMMAND_LOG_ENTRIES + 1 }),
		).toThrow(/5000/);
	});

	it("accepts JSON at the configured nesting depth", () => {
		const json = `${"[".repeat(MAX_JSON_NESTING_DEPTH)}0${"]".repeat(MAX_JSON_NESTING_DEPTH)}`;
		expect(() => assertJsonNestingDepth(json)).not.toThrow();
	});

	it("rejects JSON deeper than the configured nesting depth", () => {
		const depth = MAX_JSON_NESTING_DEPTH + 1;
		const json = `${"[".repeat(depth)}0${"]".repeat(depth)}`;
		expect(() => assertJsonNestingDepth(json)).toThrow(/depth.*64/i);
	});

	it("does not count bracket characters inside JSON strings", () => {
		expect(() =>
			assertJsonNestingDepth(JSON.stringify("[[[[[[")),
		).not.toThrow();
	});
});

describe("save metadata guards", () => {
	it("requires the envelope week to match the state week", () => {
		expect(() => assertCurrentWeekMatchesState(4, 3)).toThrow(/match/i);
		expect(() => assertCurrentWeekMatchesState(3, 3)).not.toThrow();
	});

	it("rejects weeks above the practical persistence cap", () => {
		expect(() => assertWeekWithinLimit(MAX_RUN_WEEK + 1)).toThrow(/10000/);
		expect(() => assertWeekWithinLimit(MAX_RUN_WEEK)).not.toThrow();
	});

	it("does not reopen terminal rows or roll their week backwards", () => {
		expect(() =>
			assertExistingRunUpdateAllowed(
				{ status: "terminal", currentWeek: 10 },
				{ status: "active", currentWeek: 10 },
			),
		).toThrow(/terminal/i);
		expect(() =>
			assertExistingRunUpdateAllowed(
				{ status: "terminal", currentWeek: 10 },
				{ status: "terminal", currentWeek: 11 },
			),
		).toThrow(/immutable/i);
		expect(() =>
			assertExistingRunUpdateAllowed(
				{ status: "active", currentWeek: 10 },
				{ status: "active", currentWeek: 9 },
			),
		).toThrow("Save week cannot go backwards");
	});

	it("sanitizes and bounds public save error messages", () => {
		const message = sanitizePublicSaveError(
			new Error(`bad\nvalue\u0000${"x".repeat(MAX_PUBLIC_SAVE_ERROR_LENGTH)}`),
			"fallback",
		);
		expect(
			[...message].some((character) => {
				const codePoint = character.codePointAt(0) ?? 0;
				return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
			}),
		).toBe(false);
		expect(message.length).toBeLessThanOrEqual(MAX_PUBLIC_SAVE_ERROR_LENGTH);
		expect(message.endsWith("…")).toBe(true);
		expect(sanitizePublicSaveError(undefined, "fallback")).toBe("fallback");
	});

	it("recognizes D1 unique-user races without exposing the raw database error", () => {
		expect(
			isUniqueConstraintError(
				new Error("UNIQUE constraint failed: runs.user_id"),
			),
		).toBe(true);
		expect(isUniqueConstraintError({ message: "duplicate key" })).toBe(false);
	});
});
