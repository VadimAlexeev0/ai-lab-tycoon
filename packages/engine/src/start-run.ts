import { createCompanyState } from "./components/company.js";
import { createComputeState } from "./components/compute.js";
import { createResearchState } from "./components/research.js";
import { createRivalsState } from "./components/rivals.js";
import { createTeamsState } from "./components/teams.js";
import { BALANCE } from "./data/balance.js";
import {
	cloneResearchNodes,
	RESEARCH_NODES,
	TEXT_ERA,
} from "./data/research.js";
import { OPENING_RIVALS } from "./data/rivals.js";
import { FOUNDING_TEAM } from "./data/teams.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import {
	assertRunSetup,
	createInitialGameState,
	type GameState,
	type RunSetup,
} from "./state.js";
import { assertUnsignedInteger } from "./validation.js";

const OPENING_PROJECT_NODE_IDS = RESEARCH_NODES.filter(
	(node) => node.era === TEXT_ERA && node.status === "available",
).map((node) => node.id);

/** Create the complete deterministic V1 opening world. */
export function startRun(setup: RunSetup, seed: number): GameState {
	assertRunSetup(setup);
	assertUnsignedInteger(seed, "Seed");

	let state: GameState = {
		...createInitialGameState(setup, seed),
		company: createCompanyState(setup.companyName, {
			cash: BALANCE.startingCash,
			insight: BALANCE.startingInsight,
			trust: BALANCE.startingTrust,
			hype: BALANCE.startingHype,
		}),
		compute: createComputeState(BALANCE.startingComputeCapacity),
		research: createResearchState(TEXT_ERA, cloneResearchNodes()),
		rivals: createRivalsState(),
	};

	const teamAllocation = allocateId(state, "team");
	state = {
		...teamAllocation.state,
		teams: createTeamsState([
			{
				id: teamAllocation.id,
				name: FOUNDING_TEAM.name,
				activeProjectId: null,
			},
		]),
	};

	for (const nodeId of OPENING_PROJECT_NODE_IDS) {
		const projectAllocation = allocateId(state, "project");
		state = {
			...projectAllocation.state,
			projects: {
				items: [
					...projectAllocation.state.projects.items,
					{
						kind: "research",
						id: projectAllocation.id,
						teamId: null,
						status: "available",
						progress: BALANCE.startingProjectProgress,
						duration: BALANCE.researchProjectDuration,
						nodeId,
					},
				],
			},
		};
	}

	for (const rival of OPENING_RIVALS) {
		const rivalAllocation = allocateId(state, "rival");
		state = {
			...rivalAllocation.state,
			rivals: {
				items: [
					...rivalAllocation.state.rivals.items,
					{ id: rivalAllocation.id, ...rival },
				],
			},
		};
	}

	assertGameState(state);
	return state;
}
