import type { Fact } from "../components/reports.js";
import { assertGameState } from "../invariants.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Resolve sandbox loss after the weekly operational phases. */
export const terminalSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: true });
	if (state.terminal.status === "lost") {
		return { state, facts: [], pending: [] };
	}
	const reason =
		state.company.cash < 0
			? "cash_depleted"
			: state.company.trust <= 0
				? "trust_collapsed"
				: undefined;
	if (reason === undefined) {
		return { state, facts: [], pending: [] };
	}
	const nextState: GameState = {
		...state,
		terminal: {
			...state.terminal,
			status: "lost",
			reason,
		},
	};
	const facts: Fact[] = [
		{
			kind: "terminal",
			reason,
			week: context.week,
		},
	];
	assertGameState(nextState);
	return { state: nextState, facts, pending: [] };
};
