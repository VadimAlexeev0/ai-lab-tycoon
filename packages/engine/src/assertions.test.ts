import { afterEach, describe, expect, it } from "vitest";

import { advanceWeek } from "./advance-week.js";
import { startRun } from "./index.js";
import { assertGameState, setAssertionsEnabled } from "./invariants.js";

describe("assertion modes", () => {
	afterEach(() => {
		setAssertionsEnabled(true);
	});

	it("keeps the final advance assertion active when intermediate checks are disabled", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.name = "";
		setAssertionsEnabled(false);

		expect(() => assertGameState(state)).not.toThrow();
		expect(() => advanceWeek(state)).toThrow(/company name/i);
	});
});
