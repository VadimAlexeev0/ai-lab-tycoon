import type { Fact } from "../components/reports.js";
import type { ResearchEra, ResearchState } from "../components/research.js";
import { BALANCE } from "../data/balance.js";
import {
	ASSISTANT_ERA,
	RESEARCH_ERAS,
	TEXT_ERA,
	TEXT_MODELS_KEYSTONE_ID,
} from "../data/research.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

const RESEARCH_ERA_ORDER: readonly ResearchEra[] = RESEARCH_ERAS;
const ERA_ENTRY_KEYSTONE_IDS: Readonly<Partial<Record<ResearchEra, string>>> = {
	[ASSISTANT_ERA]: TEXT_MODELS_KEYSTONE_ID,
};

/**
 * Return whether a research project can be assigned in the current state.
 * This is shared by the command and the weekly completion system so the
 * Assistant gate cannot be bypassed by a malformed available project.
 */
export function isResearchNodeAvailableForAssignment(
	state: Pick<GameState, "meta" | "research">,
	nodeId: string,
): boolean {
	const node = state.research.nodes.find((item) => item.id === nodeId);
	if (node === undefined || node.status !== "available") {
		return false;
	}
	if (!isResearchNodeEraUnlocked(state.research, node)) {
		return false;
	}
	return node.prerequisites.every((prerequisiteId) =>
		hasCompletedNode(state.research, prerequisiteId),
	);
}

/** Gain Insight and materialize projects for newly available nodes. */
export const researchSystem: GameSystem = (state, context) => {
	assertGameState(state);

	const facts: Fact[] = [];
	const eligibleTeamCount = state.teams.items.filter((team) => {
		if (team.activeProjectId === null) {
			return true;
		}
		const project = state.projects.items.find(
			(item) => item.id === team.activeProjectId,
		);
		return project?.kind === "research";
	}).length;
	const insightGain = eligibleTeamCount * BALANCE.researchInsightPerWeek;
	if (insightGain > 0) {
		facts.push({
			kind: "resource_changed",
			resource: "insight",
			amount: insightGain,
			week: context.week,
		});
	}

	const completedNodeIds = new Set(
		state.research.nodes
			.filter((node) => node.status === "completed")
			.map((node) => node.id),
	);
	const nextNodes = state.research.nodes.map((node) => ({
		...node,
		prerequisites: [...node.prerequisites],
	}));

	for (const project of state.projects.items) {
		if (project.kind !== "research" || project.status !== "completed") {
			continue;
		}
		const node = nextNodes.find((item) => item.id === project.nodeId);
		if (
			node === undefined ||
			node.status !== "available" ||
			completedNodeIds.has(node.id) ||
			!isResearchNodeEraUnlocked(state.research, node) ||
			!node.prerequisites.every((prerequisiteId) =>
				completedNodeIds.has(prerequisiteId),
			)
		) {
			continue;
		}
		node.status = "completed";
		completedNodeIds.add(node.id);
		facts.push({
			kind: "research_completed",
			nodeId: node.id,
			week: context.week,
		});
	}

	const currentEra = advanceEraIfUnlocked(
		state.research.currentEra,
		completedNodeIds,
	);
	for (const node of nextNodes) {
		if (
			node.status === "locked" &&
			isEraAtLeast(currentEra, node.era) &&
			node.prerequisites.every((prerequisiteId) =>
				completedNodeIds.has(prerequisiteId),
			)
		) {
			node.status = "available";
		}
	}

	let nextState: GameState = {
		...state,
		meta: { ...state.meta, era: currentEra },
		company: {
			...state.company,
			insight: state.company.insight + insightGain,
		},
		research: {
			currentEra,
			nodes: nextNodes,
		},
	};

	for (const node of nextNodes) {
		if (
			node.status !== "available" ||
			!isResearchNodeAvailableForAssignment(nextState, node.id) ||
			hasResearchProject(nextState, node.id)
		) {
			continue;
		}

		const allocation = allocateId(nextState, "project");
		nextState = {
			...allocation.state,
			projects: {
				items: [
					...allocation.state.projects.items,
					{
						kind: "research",
						id: allocation.id,
						teamId: null,
						status: "available",
						progress: BALANCE.startingProjectProgress,
						duration: BALANCE.researchProjectDuration,
						nodeId: node.id,
					},
				],
			},
		};
	}

	assertGameState(nextState);
	return { state: nextState, facts, pending: [] };
};

function isResearchNodeEraUnlocked(
	research: ResearchState,
	node: { era: ResearchEra },
): boolean {
	const currentIndex = RESEARCH_ERA_ORDER.indexOf(research.currentEra);
	const nodeIndex = RESEARCH_ERA_ORDER.indexOf(node.era);
	if (currentIndex < nodeIndex) {
		return false;
	}

	for (let index = 1; index <= nodeIndex; index += 1) {
		const era = RESEARCH_ERA_ORDER[index];
		if (era === undefined) {
			return false;
		}
		const keystoneId = ERA_ENTRY_KEYSTONE_IDS[era];
		if (keystoneId !== undefined && !hasCompletedNode(research, keystoneId)) {
			return false;
		}
	}
	return true;
}

function hasResearchProject(state: GameState, nodeId: string): boolean {
	return state.projects.items.some(
		(project) =>
			project.kind === "research" &&
			project.nodeId === nodeId &&
			project.status !== "cancelled",
	);
}

function hasCompletedNode(research: ResearchState, nodeId: string): boolean {
	return research.nodes.some(
		(node) => node.id === nodeId && node.status === "completed",
	);
}

function advanceEraIfUnlocked(
	currentEra: ResearchEra,
	completedNodeIds: ReadonlySet<string>,
): ResearchEra {
	// Task 5 intentionally gates only on the Text node keystone; model proof
	// is deferred to Task 6.
	if (
		currentEra === TEXT_ERA &&
		completedNodeIds.has(TEXT_MODELS_KEYSTONE_ID)
	) {
		return ASSISTANT_ERA;
	}
	return currentEra;
}

function isEraAtLeast(
	currentEra: ResearchEra,
	requiredEra: ResearchEra,
): boolean {
	const currentIndex = RESEARCH_ERA_ORDER.indexOf(currentEra);
	const requiredIndex = RESEARCH_ERA_ORDER.indexOf(requiredEra);
	return currentIndex >= requiredIndex;
}
