import { describe, expect, it } from "vitest";

import {
	assertCommandLogLimit,
	assertJsonNestingDepth,
	MAX_COMMAND_LOG_ENTRIES,
	MAX_JSON_NESTING_DEPTH,
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
		expect(() => assertJsonNestingDepth(JSON.stringify("[[[[[["))).not.toThrow();
	});
});
