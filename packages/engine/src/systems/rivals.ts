import type { Fact } from "../components/reports.js";
import { BALANCE } from "../data/balance.js";
import { RIVAL_MILESTONES } from "../data/rivals.js";
import { assertGameState } from "../invariants.js";
import { nextInt } from "../rng.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Advance visible rival clocks and roll deterministic public milestones. */
export const rivalsSystem: GameSystem = (state, context) => {
	assertGameState(state);
	let nextRng = state.rng;
	const facts: Fact[] = [];
	const nextRivals = state.rivals.items.map((rival) => {
		const active = state.meta.era === "text" ? rival.active : true;
		if (!active) return { ...rival, active: false };
		const clock = BALANCE.rivalClocks[rival.archetype].progressPerWeek;
		const nextProgress = Math.min(100, rival.progress + clock);
		for (const milestone of RIVAL_MILESTONES) {
			if (
				rival.progress >= milestone.threshold ||
				nextProgress < milestone.threshold
			) {
				continue;
			}
			const draw = nextInt(nextRng, "rivals", 0, RIVAL_MILESTONES.length - 1);
			nextRng = draw.rng;
			const selected = RIVAL_MILESTONES[draw.value];
			if (selected === undefined) {
				throw new Error("Rival milestone RNG selected an unknown milestone");
			}
			facts.push({
				kind: "rival_milestone",
				rivalId: rival.id,
				milestone: selected.id,
				week: context.week,
			});
		}
		return { ...rival, active: true, progress: nextProgress };
	});

	const nextState: GameState = {
		...state,
		rng: nextRng,
		rivals: { items: nextRivals },
	};
	assertGameState(nextState);
	return { state: nextState, facts, pending: [] };
};
