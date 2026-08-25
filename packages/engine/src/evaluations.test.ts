import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { runEvaluation } from "./evaluations.js";
import { startRun } from "./index.js";
import type { GameState } from "./state.js";

function scoredState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.insight = 10;
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 1, reliability: 3, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 80,
				coding: 70,
				reliability: 30,
				safety: 20,
				efficiency: 60,
				multimodal: 10,
			},
			estimates: {
				capability: { estimate: 40, lower: 20, upper: 60 },
				coding: { estimate: 60, lower: 40, upper: 80 },
				reliability: { estimate: 70, lower: 50, upper: 90 },
				safety: { estimate: 50, lower: 30, upper: 70 },
				efficiency: { estimate: 55, lower: 35, upper: 75 },
				multimodal: { estimate: 20, lower: 0, upper: 40 },
			},
		},
	];
	return state;
}

describe("evaluations", () => {
	it("pulls capability and coding estimates toward truth without touching safety estimates", () => {
		const state = scoredState();
		const before = state.models.items[0];
		if (before?.estimates === undefined || before.trueScores === undefined) {
			throw new Error("Expected scored model fixture");
		}

		const result = runEvaluation(state, "model_001", "capability");
		const after = result.state.models.items[0];
		if (after?.estimates === undefined) {
			throw new Error("Expected evaluated model fixture");
		}
		const coverage = BALANCE.evaluations.capability.coveragePercent;
		const expectedCapability =
			before.estimates.capability.estimate +
			Math.trunc(
				((before.trueScores.capability - before.estimates.capability.estimate) *
					coverage) /
					100,
			);

		expect(after.estimates.capability.estimate).toBe(expectedCapability);
		expect(after.estimates.coding.estimate).not.toBe(
			before.estimates.coding.estimate,
		);
		expect(after.estimates.safety).toEqual(before.estimates.safety);
		expect(result.state.company.insight).toBe(
			state.company.insight - BALANCE.evaluations.capability.insightCost,
		);
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "evaluation_completed",
				modelId: "model_001",
				evaluation: "capability",
			}),
		);
	});

	it("never moves an estimate past the hidden score and safety emphasis improves safety evaluation coverage", () => {
		const state = scoredState();
		const result = runEvaluation(state, {
			modelId: "model_001",
			evaluation: "safety_reliability",
		});
		const model = result.state.models.items[0];
		if (model?.estimates === undefined || model.trueScores === undefined) {
			throw new Error("Expected evaluated model fixture");
		}

		expect(model.estimates.reliability.estimate).toBeLessThan(70);
		expect(model.estimates.reliability.estimate).toBeGreaterThanOrEqual(30);
		expect(model.estimates.safety.estimate).toBeGreaterThanOrEqual(20);
		expect(model.estimates.capability).toEqual(
			scoredState().models.items[0]?.estimates?.capability,
		);
	});
});

void BALANCE;
