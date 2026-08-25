import type {
	ResearchBranch,
	ResearchEra,
	ResearchNode,
	ResearchNodeStatus,
} from "../components/research.js";
import {
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertPositiveInteger,
} from "../validation.js";

export type ResearchDefinition = Readonly<{
	id: string;
	era: ResearchEra;
	branch: ResearchBranch;
	status: ResearchNodeStatus;
	insightCost: number;
	prerequisites: readonly string[];
}>;

export const TEXT_ERA = "text" as const;
export const ASSISTANT_ERA = "assistant" as const;
export const MULTIMODAL_ERA = "multimodal" as const;
export const MODELS_BRANCH = "models" as const;
export const INFRASTRUCTURE_BRANCH = "infrastructure" as const;
export const PRODUCTS_SAFETY_BRANCH = "products_safety" as const;
export const RESEARCH_ERAS = [TEXT_ERA, ASSISTANT_ERA, MULTIMODAL_ERA] as const;
export const RESEARCH_BRANCHES = [
	MODELS_BRANCH,
	INFRASTRUCTURE_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
] as const;
export const RESEARCH_NODE_STATUSES = [
	"locked",
	"available",
	"completed",
] as const;

/** The Text-era Models keystone gates entry into the Assistant era. */
export const TEXT_MODELS_KEYSTONE_ID = "text_models_keystone";
/** The Assistant-era Models keystone gates entry into the Multimodal era. */
export const ASSISTANT_MODELS_KEYSTONE_ID = "assistant_models_keystone";
/** The first Multimodal-era model research node gates the model family. */
export const MULTIMODAL_MODELS_FUSION_ID = "multimodal_models_fusion";

/**
 * Compact V1 research tree. The content is intentionally data-only; systems
 * decide when a node becomes available and create projects for newly
 * available nodes.
 */
export const RESEARCH_NODES = [
	{
		id: "text_models_principles",
		era: TEXT_ERA,
		branch: MODELS_BRANCH,
		status: "available",
		insightCost: 1,
		prerequisites: [],
	},
	{
		id: TEXT_MODELS_KEYSTONE_ID,
		era: TEXT_ERA,
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: ["text_models_principles"],
	},
	{
		id: "text_infrastructure_compute",
		era: TEXT_ERA,
		branch: INFRASTRUCTURE_BRANCH,
		status: "available",
		insightCost: 1,
		prerequisites: [],
	},
	{
		id: "text_infrastructure_scaling",
		era: TEXT_ERA,
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: ["text_infrastructure_compute"],
	},
	{
		id: "text_products_safety_basics",
		era: TEXT_ERA,
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "available",
		insightCost: 1,
		prerequisites: [],
	},
	{
		id: "text_products_evaluation",
		era: TEXT_ERA,
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: ["text_products_safety_basics"],
	},
	{
		id: "assistant_models_reasoning",
		era: ASSISTANT_ERA,
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 3,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID],
	},
	{
		id: "assistant_models_tool_use",
		era: ASSISTANT_ERA,
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 4,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "assistant_models_reasoning"],
	},
	{
		id: ASSISTANT_MODELS_KEYSTONE_ID,
		era: ASSISTANT_ERA,
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 5,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"assistant_models_reasoning",
			"assistant_models_tool_use",
		],
	},
	{
		id: "assistant_infrastructure_orchestration",
		era: ASSISTANT_ERA,
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 3,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "text_infrastructure_scaling"],
	},
	{
		id: "assistant_infrastructure_serving",
		era: ASSISTANT_ERA,
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 4,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"assistant_infrastructure_orchestration",
		],
	},
	{
		id: "assistant_products_safety",
		era: ASSISTANT_ERA,
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 3,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "text_products_evaluation"],
	},
	{
		id: "assistant_products_enterprise",
		era: ASSISTANT_ERA,
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 4,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "assistant_products_safety"],
	},
	{
		id: MULTIMODAL_MODELS_FUSION_ID,
		era: MULTIMODAL_ERA,
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 5,
		prerequisites: [ASSISTANT_MODELS_KEYSTONE_ID],
	},
] as const satisfies readonly ResearchDefinition[];

assertResearchDefinitions(RESEARCH_NODES);

/** Fail fast if the research DAG contains malformed or dangling content. */
export function assertResearchDefinitions(
	definitions: readonly ResearchDefinition[],
): void {
	const ids = new Set<string>();
	for (const definition of definitions) {
		assertExactObject(
			definition,
			["id", "era", "branch", "status", "insightCost", "prerequisites"],
			"research definition",
		);
		assertIdentifier(definition.id, "Research definition id");
		if (ids.has(definition.id)) {
			throw new Error(`Duplicate research definition id: ${definition.id}`);
		}
		ids.add(definition.id);
		assertEnum(definition.era, RESEARCH_ERAS, "Research definition era");
		assertEnum(
			definition.branch,
			RESEARCH_BRANCHES,
			"Research definition branch",
		);
		assertEnum(
			definition.status,
			RESEARCH_NODE_STATUSES,
			"Research definition status",
		);
		assertPositiveInteger(
			definition.insightCost,
			`Research definition ${definition.id} insight cost`,
		);
		if (!Array.isArray(definition.prerequisites)) {
			throw new Error("Research definition prerequisites must be an array");
		}
		const prerequisites = new Set<string>();
		for (const prerequisite of definition.prerequisites) {
			assertIdentifier(prerequisite, "Research definition prerequisite id");
			if (prerequisites.has(prerequisite)) {
				throw new Error(
					`Research definition ${definition.id} repeats a prerequisite`,
				);
			}
			if (prerequisite === definition.id) {
				throw new Error(
					`Research definition ${definition.id} cannot require itself`,
				);
			}
			prerequisites.add(prerequisite);
		}
	}

	for (const definition of definitions) {
		for (const prerequisite of definition.prerequisites) {
			if (!ids.has(prerequisite)) {
				throw new Error(
					`Research definition ${definition.id} references an unknown prerequisite`,
				);
			}
		}
		if (
			definition.era === ASSISTANT_ERA &&
			!definition.prerequisites.includes(TEXT_MODELS_KEYSTONE_ID)
		) {
			throw new Error(
				`Assistant research definition ${definition.id} must require the Text Models keystone`,
			);
		}
		if (
			definition.era === MULTIMODAL_ERA &&
			!definition.prerequisites.includes(ASSISTANT_MODELS_KEYSTONE_ID)
		) {
			throw new Error(
				`Multimodal research definition ${definition.id} must require the Assistant Models keystone`,
			);
		}
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) {
			throw new Error(
				`Research definitions contain a prerequisite cycle at ${id}`,
			);
		}
		if (visited.has(id)) {
			return;
		}
		const definition = definitions.find((item) => item.id === id);
		if (definition === undefined) {
			return;
		}
		visiting.add(id);
		for (const prerequisite of definition.prerequisites) {
			visit(prerequisite);
		}
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of ids) {
		visit(id);
	}
}

/** A mutable state copy of the immutable content definitions. */
export function cloneResearchNodes(
	nodes: readonly ResearchDefinition[] = RESEARCH_NODES,
): ResearchNode[] {
	return nodes.map((node) => ({
		...node,
		prerequisites: [...node.prerequisites],
	}));
}
