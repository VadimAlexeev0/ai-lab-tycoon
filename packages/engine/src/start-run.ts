import { createCompanyState } from "./components/company.js";
import { createComputeState } from "./components/compute.js";
import {
	createResearchState,
	type ResearchNode,
} from "./components/research.js";
import { createRivalsState, type Rival } from "./components/rivals.js";
import { createTeamsState } from "./components/teams.js";
import { BALANCE } from "./data/balance.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import {
	assertRunSetup,
	createInitialGameState,
	type GameState,
	type RunSetup,
} from "./state.js";
import { assertUnsignedInteger } from "./validation.js";

const OPENING_PROJECT_DURATION = 1;
const OPENING_PROJECT_PROGRESS = 0;
const OPENING_RIVAL_PROGRESS = 0;

/**
 * Placeholder era-one nodes used until Task 5 supplies the research data
 * package. Project nodeId values intentionally come from this list.
 */
const OPENING_RESEARCH_NODES = [
	{
		id: "node_text_basic_research",
		era: "text",
		branch: "models",
		status: "available",
		prerequisites: [],
	},
	{
		id: "node_text_infrastructure_setup",
		era: "text",
		branch: "infrastructure",
		status: "available",
		prerequisites: [],
	},
	{
		id: "node_text_first_model_concept",
		era: "text",
		branch: "models",
		status: "available",
		prerequisites: [],
	},
] as const satisfies readonly ResearchNode[];

const OPENING_PROJECT_NODE_IDS = OPENING_RESEARCH_NODES.map((node) => node.id);

type OpeningRival = Omit<Rival, "id">;

const OPENING_RIVALS = [
	{
		name: "Northstar Labs",
		archetype: "research_lab",
		focus: "capability",
		progress: OPENING_RIVAL_PROGRESS,
		active: true,
	},
	{
		name: "MarketSpring",
		archetype: "platform",
		focus: "distribution",
		progress: OPENING_RIVAL_PROGRESS,
		active: true,
	},
	{
		name: "LeanForge",
		archetype: "efficiency",
		focus: "reliability",
		progress: OPENING_RIVAL_PROGRESS,
		active: false,
	},
] as const satisfies readonly OpeningRival[];

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
		research: createResearchState(
			"text",
			OPENING_RESEARCH_NODES.map((node) => ({
				...node,
				prerequisites: [...node.prerequisites],
			})),
		),
		rivals: createRivalsState(),
	};

	const teamAllocation = allocateId(state, "team");
	state = {
		...teamAllocation.state,
		teams: createTeamsState([
			{
				id: teamAllocation.id,
				name: "Founding Team",
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
						progress: OPENING_PROJECT_PROGRESS,
						duration: OPENING_PROJECT_DURATION,
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
