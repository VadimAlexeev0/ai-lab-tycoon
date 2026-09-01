import { advanceWeek, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { createBot } from "./bots.js";

describe("deterministic bot decisions", () => {
	it("resolves the blocking Era-1 paradigm offer", () => {
		const offered = advanceWeek(startRun({ companyName: "Bot Labs" }, 42));
		const decision = offered.state.decisions.pending.find(
			(candidate) => candidate.kind === "paradigm",
		);
		if (decision === undefined || decision.kind !== "paradigm") {
			throw new Error("Expected a blocking paradigm decision");
		}

		expect(
			createBot("capability-rusher", 42).chooseDecision(offered.state),
		).toEqual({
			kind: "paradigm",
			decisionId: decision.id,
			paradigmId: decision.choices[0],
		});
	});
});
