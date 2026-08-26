import type { Fact } from "../components/reports.js";
import { BALANCE } from "../data/balance.js";
import { RIVAL_MILESTONES } from "../data/rivals.js";
import { assertGameState } from "../invariants.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Advance visible rival clocks and emit each threshold actually crossed. */
export const rivalsSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	const facts: Fact[] = [];
	const nextRivals = state.rivals.items.map((rival) => {
		const active = state.meta.era === "text" ? rival.active : true;
		if (!active) return { ...rival, active: false };
		const clock = BALANCE.rivalClocks[rival.archetype].progressPerWeek;
		const nextProgress = Math.min(100, rival.progress + clock);
		const progressedBy = nextProgress - rival.progress;
		if (progressedBy > 0) {
			facts.push({
				kind: "rival_progressed",
				rivalId: rival.id,
				amount: progressedBy,
				week: context.week,
			});
		}
		for (const milestone of RIVAL_MILESTONES) {
			if (
				rival.progress < milestone.threshold &&
				nextProgress >= milestone.threshold
			) {
				facts.push({
					kind: "rival_milestone",
					rivalId: rival.id,
					milestone: milestone.id,
					week: context.week,
				});
			}
		}
		return { ...rival, active: true, progress: nextProgress };
	});

	const nextState: GameState = {
		...state,
		rivals: { items: nextRivals },
	};
	assertGameState(nextState, { allowNegativeCash: nextState.company.cash < 0 });
	return { state: nextState, facts, pending: [] };
};
