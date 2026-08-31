import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { applyDecision, startRun } from "./index.js";
import type { GameState } from "./state.js";
import {
	applyFunding,
	fundingFactors,
	fundingSystem,
	meetsFundingGate,
} from "./systems/funding.js";

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

function seriesAFundableState(): GameState {
	const state = fundableState();
	state.company.hype = BALANCE.funding.series_a.minimumHype;
	state.company.trust = BALANCE.funding.series_a.minimumTrust;
	state.funding.seed.status = "declined";
	state.funding.seriesA.status = "available";
	state.products.items = [
		{
			id: "product_001",
			channel: "chat",
			modelId: "model_001",
			status: "operating",
			users: 10,
			lastRevenue: 0,
			cumulativeRevenue: BALANCE.funding.series_a.minimumRevenue,
			servingDemand: 10,
			effectiveQuality: 60,
		},
	];
	// Keep the derived compute fields consistent with the fixture product.
	state.compute.servingDemand = 10;
	state.compute.allocated = 10;
	const model = state.models.items[0];
	if (model !== undefined) model.status = "launched";
	return state;
}

function seriesAPathState(): GameState {
	const state = seriesAFundableState();
	state.funding.seed.status = "available";
	state.funding.seriesA.status = "locked";
	return state;
}

describe("funding gates", () => {
	it("requires every seed threshold, including exact boundary values", () => {
		const thresholds = [
			["hype", "minimumHype"],
			["trust", "minimumTrust"],
			["modelScore", "minimumModelScore"],
		] as const;
		for (const [factor, thresholdName] of thresholds) {
			const below = fundableState();
			if (factor === "modelScore") {
				const model = below.models.items[0];
				if (model?.estimates === undefined)
					throw new Error("Expected estimates");
				model.estimates.capability = {
					estimate: BALANCE.funding.seed.minimumModelScore - 1,
					lower: 0,
					upper: 80,
				};
			} else {
				below.company[factor] = BALANCE.funding.seed[thresholdName] - 1;
			}
			expect(
				fundingSystem(below, { phase: "funding", week: 1 }).pending,
			).toEqual([]);

			const exact = fundableState();
			expect(meetsFundingGate(exact, "seed")).toBe(true);
			expect(
				fundingSystem(exact, { phase: "funding", week: 1 }).pending,
			).toEqual([expect.objectContaining({ kind: "funding", round: "seed" })]);
		}
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

	it("keeps offer and resolution as separate lifecycle steps and reports gate factors", () => {
		const initial = fundableState();
		const offered = fundingSystem(initial, {
			phase: "funding",
			week: 1,
		});
		const decision = offered.pending[0];
		if (decision === undefined || decision.kind !== "funding") {
			throw new Error("Expected a seed funding offer");
		}
		expect(offered.state.company.cash).toBe(initial.company.cash);
		expect(fundingFactors(initial)).toMatchObject({
			hype: BALANCE.funding.seed.minimumHype,
			trust: BALANCE.funding.seed.minimumTrust,
		});

		const resolved = applyDecision(persistPending(offered.state, [decision]), {
			kind: "funding",
			decisionId: decision.id,
			round: "seed",
			accept: true,
		});
		const fact = resolved.facts.find(
			(item) => item.kind === "funding_resolved",
		);
		if (fact?.kind !== "funding_resolved" || fact.factors === undefined) {
			throw new Error("Expected funding gate factors in the resolution fact");
		}
		expect(fact.factors).toEqual(fundingFactors(initial));
	});

	it("allows an independent Series A offer after Seed is declined", () => {
		const offered = fundingSystem(seriesAPathState(), {
			phase: "funding",
			week: 1,
		});
		const seed = offered.pending.find(
			(decision) => decision.kind === "funding" && decision.round === "seed",
		);
		if (seed === undefined || seed.kind !== "funding") {
			throw new Error("Expected the seed offer");
		}

		const declined = applyDecision(persistPending(offered.state, [seed]), {
			kind: "funding",
			decisionId: seed.id,
			round: "seed",
			accept: false,
		});
		expect(declined.state.company.cash).toBe(offered.state.company.cash);
		expect(declined.state.funding.seed.status).toBe("declined");
		expect(declined.state.funding.seriesA.status).toBe("available");
		expect(meetsFundingGate(declined.state, "series_a")).toBe(true);

		const seriesA = fundingSystem(declined.state, {
			phase: "funding",
			week: 1,
		});
		expect(seriesA.pending).toEqual([
			expect.objectContaining({ kind: "funding", round: "series_a" }),
		]);
	});

	it("enforces every Series A boundary and rejects later rounds", () => {
		const thresholds = [
			["hype", "minimumHype"],
			["trust", "minimumTrust"],
			["modelScore", "minimumModelScore"],
			["operatingProducts", "minimumProducts"],
			["cumulativeRevenue", "minimumRevenue"],
		] as const;
		for (const [factor, thresholdName] of thresholds) {
			const below = seriesAFundableState();
			if (factor === "operatingProducts") {
				below.products.items = [];
				below.compute.servingDemand = 0;
				below.compute.allocated = 0;
				const model = below.models.items[0];
				if (model !== undefined) model.status = "shelved";
			}
			if (factor === "modelScore") {
				const model = below.models.items[0];
				if (model?.estimates === undefined)
					throw new Error("Expected estimates");
				model.estimates.capability.estimate =
					BALANCE.funding.series_a.minimumModelScore - 1;
			} else if (factor === "operatingProducts") {
				below.products.items = [];
			} else if (factor === "cumulativeRevenue") {
				const product = below.products.items[0];
				if (product === undefined) throw new Error("Expected product");
				product.cumulativeRevenue = BALANCE.funding.series_a.minimumRevenue - 1;
			} else {
				below.company[factor] = BALANCE.funding.series_a[thresholdName] - 1;
			}
			expect(
				fundingSystem(below, { phase: "funding", week: 1 }).pending,
			).toEqual([]);

			const exact = seriesAFundableState();
			expect(meetsFundingGate(exact, "series_a")).toBe(true);
			expect(
				fundingSystem(exact, { phase: "funding", week: 1 }).pending,
			).toEqual([
				expect.objectContaining({ kind: "funding", round: "series_a" }),
			]);
		}

		expect(() =>
			applyFunding(seriesAFundableState(), "series_b" as never, true),
		).toThrow(/round/i);
	});

	it("declining Seed grants no cash", () => {
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
			accept: false,
		});
		expect(result.state.company.cash).toBe(offered.state.company.cash);
		expect(result.state.funding.seed.status).toBe("declined");
	});

	it("pins the exact seed grant amount", () => {
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
		expect(result.state.company.cash - offered.state.company.cash).toBe(500);
	});

	it("rejects resolving a round that is not available", () => {
		const locked = fundableState();
		expect(() => applyFunding(locked, "series_a", true)).toThrow(
			/not available/i,
		);

		const declined = seriesAFundableState();
		declined.funding.seed.status = "declined";
		expect(() => applyFunding(declined, "seed", true)).toThrow(
			/not available/i,
		);
	});

	it("rejects accepting an offer whose gate is no longer met", () => {
		const offered = fundingSystem(fundableState(), {
			phase: "funding",
			week: 1,
		});
		const decision = offered.pending[0];
		if (decision === undefined || decision.kind !== "funding") {
			throw new Error("Expected a seed funding offer");
		}
		const stale = persistPending(offered.state, [decision]);
		stale.company.hype = BALANCE.funding.seed.minimumHype - 1;
		expect(meetsFundingGate(stale, "seed")).toBe(false);
		expect(() =>
			applyDecision(stale, {
				kind: "funding",
				decisionId: decision.id,
				round: "seed",
				accept: true,
			}),
		).toThrow(/no longer met/i);
	});

	it("does not re-offer a round while its offer is still pending", () => {
		const offered = fundingSystem(fundableState(), {
			phase: "funding",
			week: 1,
		});
		const decision = offered.pending[0];
		if (decision === undefined || decision.kind !== "funding") {
			throw new Error("Expected a seed funding offer");
		}
		const persisted = persistPending(offered.state, [decision]);

		const second = fundingSystem(persisted, { phase: "funding", week: 2 });
		const fundingDecisions = second.pending.filter(
			(item) => item.kind === "funding",
		);
		expect(fundingDecisions).toEqual([decision]);
		expect(second.state.counters.decision).toBe(persisted.counters.decision);
	});
});
