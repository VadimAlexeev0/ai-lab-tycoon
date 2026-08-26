import { assertGameState } from "../invariants.js";
import type { GameSystem } from "./types.js";

/**
 * Owns the pending decision component and its queue after all producer phases.
 * Reads: decisions. Writes: decisions, queue.decisionIds.
 */
export const decisionsSystem: GameSystem = (state) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	const pending = state.decisions.pending.map((decision) => ({ ...decision }));
	const nextState = {
		...state,
		decisions: { pending },
		queue: {
			...state.queue,
			decisionIds: pending.map((decision) => decision.id),
		},
	};
	assertGameState(nextState, { allowNegativeCash: nextState.company.cash < 0 });
	return { state: nextState, facts: [], pending };
};
