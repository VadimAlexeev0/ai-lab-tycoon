import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertPositiveInteger,
} from "../validation.js";

export type ResearchEra = "text" | "assistant" | "multimodal";
export type ResearchBranch = "models" | "infrastructure" | "products_safety";
export type ResearchNodeStatus = "locked" | "available" | "completed";

const RESEARCH_ERAS = ["text", "assistant", "multimodal"] as const;
const RESEARCH_BRANCHES = [
	"models",
	"infrastructure",
	"products_safety",
] as const;
const RESEARCH_NODE_STATUSES = ["locked", "available", "completed"] as const;

export type ResearchNode = {
	id: string;
	era: ResearchEra;
	branch: ResearchBranch;
	status: ResearchNodeStatus;
	insightCost: number;
	prerequisites: string[];
};

export type ResearchState = {
	currentEra: ResearchEra;
	nodes: ResearchNode[];
};

export function createResearchState(
	currentEra: ResearchEra = "text",
	nodes: ResearchNode[] = [],
): ResearchState {
	return {
		currentEra,
		nodes: nodes.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})),
	};
}

export function assertResearchState(
	value: unknown,
): asserts value is ResearchState {
	assertExactObject(value, ["currentEra", "nodes"], "research");
	assertEnum(value.currentEra, RESEARCH_ERAS, "Research current era");
	assertArray(value.nodes, "Research nodes");

	const ids: string[] = [];
	for (const item of value.nodes) {
		assertExactObject(
			item,
			["id", "era", "branch", "status", "insightCost", "prerequisites"],
			"research node",
		);
		assertIdentifier(item.id, "Research node id");
		if (ids.includes(item.id)) {
			throw new Error(`Duplicate research node id: ${item.id}`);
		}
		ids.push(item.id);
		assertEnum(item.era, RESEARCH_ERAS, "Research node era");
		assertEnum(item.branch, RESEARCH_BRANCHES, "Research node branch");
		assertEnum(item.status, RESEARCH_NODE_STATUSES, "Research node status");
		assertPositiveInteger(
			item.insightCost,
			`Research node ${item.id} insight cost`,
		);
		assertArray(item.prerequisites, "Research node prerequisites");
		const prerequisites = new Set<string>();
		for (const prerequisite of item.prerequisites) {
			assertIdentifier(prerequisite, "Research prerequisite id");
			if (prerequisites.has(prerequisite)) {
				throw new Error(
					`Research node ${item.id} repeats a prerequisite: ${prerequisite}`,
				);
			}
			prerequisites.add(prerequisite);
			if (prerequisite === item.id) {
				throw new Error(`Research node ${item.id} cannot require itself`);
			}
		}
	}

	for (const item of value.nodes) {
		assertExactObject(
			item,
			["id", "era", "branch", "status", "insightCost", "prerequisites"],
			"research node",
		);
		assertArray(item.prerequisites, "Research node prerequisites");
		for (const prerequisite of item.prerequisites) {
			assertIdentifier(prerequisite, "Research prerequisite id");
			if (!ids.includes(prerequisite)) {
				throw new Error(
					`Research node ${item.id} references an unknown prerequisite`,
				);
			}
		}
	}
}
