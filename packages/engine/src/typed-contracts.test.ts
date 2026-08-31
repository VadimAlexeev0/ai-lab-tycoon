import { describe, expect, it } from "vitest";

import { assertFact } from "./components/reports.js";
import { assertTerminalState } from "./components/terminal.js";
import { startRun } from "./index.js";
import { applyProductResume } from "./products.js";
import type { GameState } from "./state.js";

function pausedProductState(): GameState {
	const state = startRun({ companyName: "Contract Labs" }, 42);
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "launched",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 70,
				coding: 60,
				reliability: 60,
				safety: 60,
				efficiency: 60,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 60, lower: 40, upper: 80 },
				coding: { estimate: 60, lower: 40, upper: 80 },
				reliability: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 60, lower: 40, upper: 80 },
				efficiency: { estimate: 60, lower: 40, upper: 80 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	state.products.items = [
		{
			id: "product_001",
			channel: "chat",
			modelId: "model_001",
			status: "paused",
			users: 17,
			lastRevenue: 0,
			cumulativeRevenue: 123,
			servingDemand: 0,
			effectiveQuality: 60,
		},
	];
	return state;
}

describe("typed Fact contracts", () => {
	it("validates every player-visible product resume outcome", () => {
		const result = applyProductResume(pausedProductState(), "product_001");
		const fact = result.facts[0];

		expect(fact).toEqual({
			kind: "product_resumed",
			productId: "product_001",
			channel: "chat",
			week: 1,
		});
		expect(() => assertFact(fact)).not.toThrow();
	});

	it("accepts every Fact kind as a terminal contributor", () => {
		expect(() =>
			assertTerminalState({
				status: "lost",
				reason: "cash_depleted",
				frontierReached: false,
				contributors: [
					{
						kind: "serving_throttled",
						impact: -3,
						week: 1,
						index: 0,
					},
					{
						kind: "training_starved",
						impact: -2,
						week: 1,
						index: 1,
					},
					{
						kind: "product_resumed",
						impact: -1,
						week: 1,
						index: 2,
					},
				],
			}),
		).not.toThrow();
	});
});
