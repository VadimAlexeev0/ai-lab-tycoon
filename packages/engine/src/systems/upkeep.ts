import type { Fact } from "../components/reports.js";
import { BALANCE } from "../data/balance.js";
import { assertGameState } from "../invariants.js";
import type { GameSystem } from "./types.js";

/** Deduct the weekly base operating cost and one salary per team. */
export const upkeepSystem: GameSystem = (state, context) => {
	assertGameState(state);

	const weeklyCost =
		BALANCE.upkeep + state.teams.items.length * BALANCE.salaries.foundingTeam;
	if (state.company.cash < weeklyCost) {
		throw new Error("Insufficient cash to pay weekly upkeep");
	}

	const nextState = {
		...state,
		company: {
			...state.company,
			cash: state.company.cash - weeklyCost,
		},
	};
	const facts: Fact[] = [
		{
			kind: "resource_changed",
			resource: "cash",
			amount: -weeklyCost,
			week: context.week,
		},
	];

	assertGameState(nextState);
	return { state: nextState, facts, pending: [] };
};
