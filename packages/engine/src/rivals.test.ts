import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { RIVAL_MILESTONES } from "./data/rivals.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import { rivalLaunchPressure } from "./products.js";
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
				kind: "rival_progressed",
				rivalId: rival.id,
				amount: BALANCE.rivalClocks[rival.archetype].progressPerWeek,
			}),
		);
		expect(first.facts).toContainEqual(
			expect.objectContaining({
				kind: "rival_milestone",
				rivalId: rival.id,
				milestone: "prototype",
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
		for (const node of state.research.nodes) {
			if (node.era === "text") node.status = "completed";
		}
		const assistantResult = rivalsSystem(state, { phase: "rivals", week: 2 });
		expect(
			assistantResult.state.rivals.items.filter((rival) => rival.active),
		).toHaveLength(3);
	});

	it("labels exactly the threshold crossed and rejects progress above 100", () => {
		for (const [from, expected] of [
			[24, "prototype"],
			[49, "launch"],
			[74, "scale"],
			[99, "category_lead"],
		] as const) {
			const state = startRun({ companyName: "Acme Labs" }, 42);
			const rival = state.rivals.items[0];
			if (rival === undefined) throw new Error("Expected rival");
			rival.progress = from;
			const result = rivalsSystem(state, { phase: "rivals", week: 1 });
			expect(result.facts).toContainEqual(
				expect.objectContaining({
					kind: "rival_milestone",
					rivalId: rival.id,
					milestone: expected,
				}),
			);
		}

		const invalid = startRun({ companyName: "Acme Labs" }, 42);
		const invalidRival = invalid.rivals.items[0];
		if (invalidRival === undefined) throw new Error("Expected rival");
		invalidRival.progress = 101;
		expect(() => assertGameState(invalid)).toThrow(/progress/i);
	});

	it("adds launch pressure from active rival progress only", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(rivalLaunchPressure(state, 5)).toBe(5);
		const firstRival = state.rivals.items[0];
		const secondRival = state.rivals.items[1];
		if (firstRival === undefined || secondRival === undefined) {
			throw new Error("Expected two active rivals");
		}
		firstRival.progress = 50;
		expect(rivalLaunchPressure(state, 5)).toBe(7);
		secondRival.progress = 100;
		expect(rivalLaunchPressure(state, 5)).toBe(9);
		firstRival.active = false;
		secondRival.active = false;
		expect(rivalLaunchPressure(state, 5)).toBe(5);
	});
});
