import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { RIVAL_MILESTONES } from "./data/rivals.js";
import { startRun } from "./index.js";
import { rivalsSystem } from "./systems/rivals.js";

describe("rival progress clocks", () => {
	it("advances each active archetype by its balance clock and emits deterministic milestone facts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected an opening rival");
		const milestone = RIVAL_MILESTONES[0];
		if (milestone === undefined) throw new Error("Expected a rival milestone");
		rival.progress = milestone.threshold - 1;

		const first = rivalsSystem(state, { phase: "rivals", week: 1 });
		const firstRival = first.state.rivals.items[0];
		if (firstRival === undefined)
			throw new Error("Expected rival after progress");
		expect(firstRival.progress).toBe(
			milestone.threshold -
				1 +
				BALANCE.rivalClocks[firstRival.archetype].progressPerWeek,
		);
		expect(first.facts).toContainEqual(
			expect.objectContaining({
				kind: "rival_milestone",
				rivalId: rival.id,
			}),
		);

		const second = rivalsSystem(state, { phase: "rivals", week: 1 });
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});

	it("does not expose the dormant third rival until the assistant era", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const textResult = rivalsSystem(state, { phase: "rivals", week: 1 });
		expect(
			textResult.state.rivals.items.filter((rival) => rival.active),
		).toHaveLength(2);

		state.meta.era = "assistant";
		state.research.currentEra = "assistant";
		const assistantResult = rivalsSystem(state, { phase: "rivals", week: 2 });
		expect(
			assistantResult.state.rivals.items.filter((rival) => rival.active),
		).toHaveLength(3);
	});
});
