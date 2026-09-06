import { describe, expect, it } from "vitest";
import type { Model } from "./components/models.js";
import { BALANCE } from "./data/balance.js";
import { RIVAL_MILESTONES } from "./data/rivals.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import { launchProduct, rivalLaunchPressure } from "./products.js";
import { rivalsSystem } from "./systems/rivals.js";

function launchedTextAssistantState(): ReturnType<typeof startRun> {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	for (const node of state.research.nodes) {
		if (node.era === "text") node.status = "completed";
	}
	const model: Model = {
		id: "model_001",
		name: "Aurora-1",
		foundation: "fresh",
		status: "ready",
		projectId: null,
		family: "text",
		tier: "standard",
		scoreCeiling: 88,
		dataMix: { general: 70, code: 20, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		trueScores: {
			capability: 100,
			coding: 100,
			reliability: 100,
			safety: 100,
			efficiency: 100,
			multimodal: 0,
		},
		estimates: {
			capability: { estimate: 100, lower: 80, upper: 100 },
			coding: { estimate: 100, lower: 80, upper: 100 },
			reliability: { estimate: 100, lower: 80, upper: 100 },
			safety: { estimate: 100, lower: 80, upper: 100 },
			efficiency: { estimate: 100, lower: 80, upper: 100 },
			multimodal: { estimate: 0, lower: 0, upper: 20 },
		},
	};
	state.models.items = [model];
	state.counters.model = 2;
	state.company.hype = 100;
	const launched = launchProduct(state, "model_001", "chat").state;
	launched.meta.era = "assistant";
	launched.research.currentEra = "assistant";
	return launched;
}

function appendDirectRivalsAdvanceCommand(
	state: ReturnType<typeof startRun>,
): string {
	const commandNumber = state.counters.command;
	const commandId = `command_${String(commandNumber).padStart(3, "0")}`;
	state.commandLog.push({
		id: commandId,
		kind: "advance_week",
		week: state.meta.week,
	});
	state.counters.command = commandNumber + 1;
	return commandId;
}

describe("rival progress clocks", () => {
	it("advances each active archetype by its balance clock and emits deterministic milestone facts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected an opening rival");
		const milestone = RIVAL_MILESTONES[0];
		if (milestone === undefined) throw new Error("Expected a rival milestone");
		rival.progress = milestone.threshold - 1;
		const commandId = appendDirectRivalsAdvanceCommand(state);

		const first = rivalsSystem(state, {
			phase: "rivals",
			week: 1,
			commandId,
		});
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

		const second = rivalsSystem(state, {
			phase: "rivals",
			week: 1,
			commandId,
		});
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});

	it("does not expose the dormant third rival until the assistant era", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const textResult = rivalsSystem(state, { phase: "rivals", week: 1 });
		expect(
			textResult.state.rivals.items.filter((rival) => rival.active),
		).toHaveLength(2);

		const assistantResult = rivalsSystem(launchedTextAssistantState(), {
			phase: "rivals",
			week: 2,
		});
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
			const commandId = appendDirectRivalsAdvanceCommand(state);
			const result = rivalsSystem(state, {
				phase: "rivals",
				week: 1,
				commandId,
			});
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
