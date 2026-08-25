import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { applyDecision, startRun } from "./index.js";
import type { GameState } from "./state.js";
import { fundingSystem } from "./systems/funding.js";

function fundableState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.hype = BALANCE.funding.seed.minimumHype;
	state.company.trust = BALANCE.funding.seed.minimumTrust;
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
	return state;
}

function persistPending(
	state: GameState,
	pending: GameState["decisions"]["pending"],
): GameState {
	return {
		...state,
		decisions: { pending },
		queue: {
			...state.queue,
			decisionIds: pending.map((decision) => decision.id),
		},
	};
}

describe("funding gates", () => {
	it("requires every seed threshold, including exact boundary values", () => {
		const below = fundableState();
		below.company.hype -= 1;
		const rejected = fundingSystem(below, { phase: "funding", week: 1 });
		expect(rejected.pending).toEqual([]);

		const eligible = fundableState();
		const offered = fundingSystem(eligible, { phase: "funding", week: 1 });
		expect(offered.pending).toEqual([
			expect.objectContaining({
				kind: "funding",
				round: "seed",
				blocking: false,
			}),
		]);
	});

	it("adds the data-defined grant and unlocks Series A after acceptance", () => {
		const offered = fundingSystem(fundableState(), {
			phase: "funding",
			week: 1,
		});
		const decision = offered.pending[0];
		if (decision === undefined || decision.kind !== "funding") {
			throw new Error("Expected a seed funding offer");
		}
		const result = applyDecision(persistPending(offered.state, [decision]), {
			kind: "funding",
			decisionId: decision.id,
			round: "seed",
			accept: true,
		});

		expect(result.state.company.cash).toBe(
			offered.state.company.cash + BALANCE.funding.seed.grant,
		);
		expect(result.state.funding.seed.status).toBe("accepted");
		expect(result.state.funding.seriesA.status).toBe("available");
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "funding_resolved",
				outcome: "accepted",
			}),
		);
	});
});
