import {
	isResearchParadigmId,
	type ResearchParadigmId,
} from "../data/research/paradigms.js";
import {
	getResearchDefinition,
	getResearchSparkDefinition,
} from "../data/research.js";
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
export type ResearchSparkTrigger = "serving_throttled";

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
	discoveredSparkIds: string[];
	paradigmId: ResearchParadigmId | null;
};

export type ResearchStateValidationOptions = Readonly<{
	allowMissingDiscoveredSparkIds?: boolean;
	allowMissingParadigmId?: boolean;
}>;

export function createResearchState(
	currentEra: ResearchEra = "text",
	nodes: ResearchNode[] = [],
	discoveredSparkIds: string[] = [],
	paradigmId: ResearchParadigmId | null = null,
): ResearchState {
	return {
		currentEra,
		nodes: nodes.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})),
		discoveredSparkIds: [...discoveredSparkIds],
		paradigmId,
	};
}

export function assertResearchState(
	value: unknown,
	options: ResearchStateValidationOptions = {},
): asserts value is ResearchState {
	const missingParadigmId =
		options.allowMissingParadigmId === true &&
		value !== null &&
		typeof value === "object" &&
		!Object.hasOwn(value, "paradigmId");
	const missingDiscoveredSparkIds =
		options.allowMissingDiscoveredSparkIds === true &&
		value !== null &&
		typeof value === "object" &&
		!Object.hasOwn(value, "discoveredSparkIds");
	const requiredKeys = ["currentEra", "nodes"];
	if (!missingDiscoveredSparkIds) requiredKeys.push("discoveredSparkIds");
	if (!missingParadigmId) requiredKeys.push("paradigmId");
	assertExactObject(value, requiredKeys, "research");
	assertEnum(value.currentEra, RESEARCH_ERAS, "Research current era");
	assertArray(value.nodes, "Research nodes");
	const nodeIds = new Set<string>();
	for (const node of value.nodes as unknown[]) {
		if (
			node !== null &&
			typeof node === "object" &&
			"id" in node &&
			typeof node.id === "string"
		) {
			nodeIds.add(node.id);
		}
	}
	const rawDiscoveredSparkIds = missingDiscoveredSparkIds
		? []
		: value.discoveredSparkIds;
	assertArray(rawDiscoveredSparkIds, "Discovered research Spark ids");
	const discoveredSparkIds = new Set<string>();
	for (const sparkId of rawDiscoveredSparkIds) {
		assertIdentifier(sparkId, "Discovered research Spark id");
		if (discoveredSparkIds.has(sparkId)) {
			throw new Error(`Duplicate discovered research Spark id: ${sparkId}`);
		}
		discoveredSparkIds.add(sparkId);
		const sparkDefinition = getResearchSparkDefinition(sparkId);
		if (sparkDefinition === undefined) {
			throw new Error(`Unknown discovered research Spark id: ${sparkId}`);
		}
		if (!nodeIds.has(sparkDefinition.node.id)) {
			throw new Error(
				`Discovered research Spark ${sparkId} references a missing node`,
			);
		}
	}

	const rawParadigmId = missingParadigmId ? null : value.paradigmId;
	if (rawParadigmId !== null && !isResearchParadigmId(rawParadigmId)) {
		throw new Error(`Unknown research paradigm id: ${String(rawParadigmId)}`);
	}

	const ids = new Set<string>();
	for (const item of value.nodes) {
		assertExactObject(
			item,
			["id", "era", "branch", "status", "insightCost", "prerequisites"],
			"research node",
		);
		assertIdentifier(item.id, "Research node id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate research node id: ${item.id}`);
		}
		ids.add(item.id);
		assertEnum(item.era, RESEARCH_ERAS, "Research node era");
		assertEnum(item.branch, RESEARCH_BRANCHES, "Research node branch");
		assertEnum(item.status, RESEARCH_NODE_STATUSES, "Research node status");
		assertPositiveInteger(
			item.insightCost,
			`Research node ${item.id} insight cost`,
		);
		const definition = getResearchDefinition(item.id);
		if (definition === undefined) {
			throw new Error(`Unknown research node id: ${item.id}`);
		}
		const spark = definition.spark;
		const expectedCost =
			spark !== undefined && discoveredSparkIds.has(spark.id)
				? Math.max(1, definition.insightCost - spark.discount)
				: definition.insightCost;
		if (item.insightCost !== expectedCost) {
			throw new Error(
				`Research node ${item.id} insight cost does not match its catalog base cost and discovered Spark discount`,
			);
		}
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
			if (!ids.has(prerequisite)) {
				throw new Error(
					`Research node ${item.id} references an unknown prerequisite`,
				);
			}
		}
	}
}
