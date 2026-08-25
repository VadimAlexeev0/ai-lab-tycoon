import type { PendingDecision } from "./components/decisions.js";
import type { Fact } from "./components/reports.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { EngineResult, GameState } from "./state.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";
import type { GameSystem, SystemPhase } from "./systems/types.js";
import { upkeepSystem } from "./systems/upkeep.js";

const WEEKLY_SYSTEMS: readonly {
	phase: SystemPhase;
	system: GameSystem;
}[] = [
	{ phase: "upkeep", system: upkeepSystem },
	{ phase: "projects", system: projectsSystem },
	{ phase: "research", system: researchSystem },
];

/** Advance one player-controlled week through the implemented V1 phases. */
export function advanceWeek(state: GameState): EngineResult {
	assertGameState(state);
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		throw new Error("Cannot advance week while a blocking decision is pending");
	}

	const week = state.meta.week;
	let nextState = state;
	const facts: Fact[] = [];
	const pending: PendingDecision[] = [];

	for (const { phase, system } of WEEKLY_SYSTEMS) {
		const result = system(nextState, { phase, week });
		nextState = result.state;
		facts.push(...result.facts);
		pending.push(...result.pending);
	}

	const commandAllocation = allocateId(nextState, "command");
	nextState = {
		...commandAllocation.state,
		meta: {
			...commandAllocation.state.meta,
			week: week + 1,
		},
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "advance_week",
				week,
			},
		],
	};

	assertGameState(nextState);
	return { state: nextState, facts, pending };
}
