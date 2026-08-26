import type { PendingDecision } from "../components/decisions.js";
import type {
	FundingGateFactors,
	FundingRound,
} from "../components/funding.js";
import type { Fact } from "../components/reports.js";
import { BALANCE } from "../data/balance.js";
import { assertRunActive } from "../guards.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import type { EngineResult, GameState } from "../state.js";
import { assertEnum } from "../validation.js";
import type { GameSystem } from "./types.js";

const FUNDING_ROUNDS: readonly FundingRound[] = ["seed", "series_a"];

/** Return whether hype, trust, model progress, and traction meet a round gate. */
export function meetsFundingGate(
	state: GameState,
	round: FundingRound,
): boolean {
	assertFundingRound(round);
	const tuning = BALANCE.funding[round];
	const factors = fundingFactors(state);
	return (
		factors.hype >= tuning.minimumHype &&
		factors.trust >= tuning.minimumTrust &&
		factors.modelScore >= tuning.minimumModelScore &&
		factors.operatingProducts >= tuning.minimumProducts &&
		factors.cumulativeRevenue >= tuning.minimumRevenue
	);
}

/** Capture the live measurements used by every funding gate decision. */
export function fundingFactors(state: GameState): FundingGateFactors {
	return {
		hype: state.company.hype,
		trust: state.company.trust,
		modelScore: bestVisibleModelScore(state),
		operatingProducts: state.products.items.filter(
			(product) => product.status === "operating",
		).length,
		cumulativeRevenue: state.products.items.reduce(
			(total, product) => total + (product.cumulativeRevenue ?? 0),
			0,
		),
	};
}

/** Create non-blocking funding offers once their data-defined gates are met. */
export const fundingSystem: GameSystem = (state) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	assertRunActive(state);
	let nextState = state;
	const pending: PendingDecision[] = state.decisions.pending.map(
		(decision) => ({
			...decision,
		}),
	);
	for (const round of FUNDING_ROUNDS) {
		let roundState =
			nextState.funding[round === "series_a" ? "seriesA" : "seed"];
		if (
			round === "series_a" &&
			roundState.status === "locked" &&
			nextState.funding.seed.status === "declined" &&
			meetsFundingGate(nextState, round)
		) {
			nextState = {
				...nextState,
				funding: {
					...nextState.funding,
					seriesA: { ...roundState, status: "available" },
				},
			};
			roundState = nextState.funding.seriesA;
		}
		if (
			roundState.status !== "available" ||
			pending.some(
				(decision) => decision.kind === "funding" && decision.round === round,
			) ||
			!meetsFundingGate(nextState, round)
		) {
			continue;
		}
		// ID allocation is part of the returned state even though the weekly
		// orchestrator installs the pending decision after all systems finish.
		const allocation = allocateFundingDecision(nextState);
		nextState = allocation.state;
		pending.push({
			kind: "funding",
			id: allocation.id,
			round,
			blocking: false,
		});
	}
	assertGameState(nextState, { allowNegativeCash: nextState.company.cash < 0 });
	return { state: nextState, facts: [], pending };
};

/** Resolve a funding offer from applyDecision. */
export function applyFunding(
	state: GameState,
	round: FundingRound,
	accept: boolean,
): EngineResult {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	assertRunActive(state);
	assertFundingRound(round);
	const key = round === "series_a" ? "seriesA" : "seed";
	const roundState = state.funding[key];
	if (roundState.status !== "available") {
		throw new Error(`${round} funding is not available`);
	}
	if (accept && !meetsFundingGate(state, round)) {
		throw new Error(`${round} funding requirements are no longer met`);
	}
	const tuning = BALANCE.funding[round];
	const factors = fundingFactors(state);
	const nextSeriesAStatus =
		// A Seed decline does not permanently lock Series A. Its own gate is
		// evaluated independently and can unlock the later round on a future
		// funding phase.
		round === "seed"
			? accept || meetsFundingGate(state, "series_a")
				? "available"
				: "locked"
			: state.funding.seriesA.status;
	const nextState: GameState = {
		...state,
		company: {
			...state.company,
			cash: accept ? state.company.cash + tuning.grant : state.company.cash,
		},
		funding: {
			...state.funding,
			seed:
				round === "seed"
					? { ...state.funding.seed, status: accept ? "accepted" : "declined" }
					: { ...state.funding.seed },
			seriesA:
				round === "seed"
					? { ...state.funding.seriesA, status: nextSeriesAStatus }
					: round === "series_a"
						? {
								...state.funding.seriesA,
								status: accept ? "accepted" : "declined",
							}
						: { ...state.funding.seriesA },
		},
	};
	const facts: Fact[] = [
		{
			kind: "funding_resolved",
			round,
			outcome: accept ? "accepted" : "declined",
			factors,
			week: state.meta.week,
		},
	];
	if (accept) {
		facts.push({
			kind: "resource_changed",
			resource: "cash",
			amount: tuning.grant,
			week: state.meta.week,
		});
	}
	assertGameState(nextState, { allowNegativeCash: nextState.company.cash < 0 });
	return { state: nextState, facts, pending: [] };
}

function assertFundingRound(value: unknown): asserts value is FundingRound {
	assertEnum(value, FUNDING_ROUNDS, "Funding round");
}

function bestVisibleModelScore(state: GameState): number {
	let best = 0;
	for (const model of state.models.items) {
		if (model.status !== "ready" && model.status !== "launched") continue;
		const capability = model.estimates?.capability?.estimate;
		if (capability !== undefined) best = Math.max(best, capability);
	}
	return best;
}

function allocateFundingDecision(state: GameState): {
	state: GameState;
	id: string;
} {
	return allocateId(state, "decision");
}
