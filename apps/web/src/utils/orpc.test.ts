import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { toUpsertActiveRunInput } from "./orpc";

describe("active run save input", () => {
	it("defaults replacement off and can explicitly request replacement", () => {
		const state = startRun({ companyName: "Test Lab" }, 42);
		expect(toUpsertActiveRunInput(state).replace).toBe(false);
		expect(toUpsertActiveRunInput(state, undefined, true).replace).toBe(true);
	});
});
