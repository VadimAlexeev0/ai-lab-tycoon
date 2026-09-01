import type { ResearchNode } from "../../components/research.js";
import {
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertPositiveInteger,
	assertString,
} from "../../validation.js";
import { CONVERGENCE_NODES } from "./convergence.js";
import { EFFICIENCY_SCHOOL_NODES } from "./efficiency_school.js";
import { FOUNDATIONS_NODES } from "./foundations.js";
import { GIANTS_ERA_NODES } from "./giants_era.js";
import { MULTIMODAL_AGENTS_NODES } from "./multimodal_agents.js";
import { PRETRAINING_ERA_NODES } from "./pretraining_era.js";
import { REASONING_ERA_NODES } from "./reasoning_era.js";
import { SCALING_ERA_NODES } from "./scaling_era.js";
import { TRANSFORMER_NODES } from "./transformer.js";
import { TREE_SPLIT_NODES } from "./tree_split.js";
import {
	ASSISTANT_ERA,
	ASSISTANT_MODELS_KEYSTONE_ID,
	assertResearchEffects,
	assertResearchSpark,
	MULTIMODAL_ERA,
	RESEARCH_BRANCHES,
	RESEARCH_CATEGORIES,
	RESEARCH_CATEGORY_LABELS,
	RESEARCH_ERAS,
	RESEARCH_NODE_STATUSES,
	type ResearchDefinition,
	TEXT_ERA,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const RESEARCH_DEFINITION_KEYS = [
	"id",
	"label",
	"era",
	"eraLabel",
	"category",
	"branch",
	"status",
	"insightCost",
	"prerequisites",
	"description",
] as const;
const RESEARCH_DEFINITION_KEYS_WITH_EFFECTS = [
	...RESEARCH_DEFINITION_KEYS,
	"effects",
] as const;
const RESEARCH_DEFINITION_KEYS_WITH_SPARK = [
	...RESEARCH_DEFINITION_KEYS,
	"spark",
] as const;
const RESEARCH_DEFINITION_KEYS_WITH_EFFECTS_AND_SPARK = [
	...RESEARCH_DEFINITION_KEYS,
	"effects",
	"spark",
] as const;

export * from "./types.js";

/** Ordered content groups keep the public tree deterministic and reviewable. */
// ponytail: Only the typed serving_throttled Spark trigger is implemented;
// future trigger types belong in the ResearchSpark typed data contract.
export const RESEARCH_NODES = [
	...FOUNDATIONS_NODES,
	...TRANSFORMER_NODES,
	...PRETRAINING_ERA_NODES,
	...SCALING_ERA_NODES,
	...GIANTS_ERA_NODES,
	...TREE_SPLIT_NODES,
	...EFFICIENCY_SCHOOL_NODES,
	...REASONING_ERA_NODES,
	...MULTIMODAL_AGENTS_NODES,
	...CONVERGENCE_NODES,
] as const satisfies readonly ResearchDefinition[];

export const RESEARCH_NODE_DEFINITIONS = RESEARCH_NODES;
export const RESEARCH_TOTAL_INSIGHT_COST = RESEARCH_NODES.reduce(
	(total, node) => total + node.insightCost,
	0,
);

const RESEARCH_NODE_BY_ID = new Map<string, ResearchDefinition>(
	RESEARCH_NODES.map((definition) => [definition.id, definition]),
);

assertResearchDefinitions(RESEARCH_NODES);

export function getResearchDefinition(
	id: string,
): ResearchDefinition | undefined {
	return RESEARCH_NODE_BY_ID.get(id);
}

export function getResearchSparkDefinition(sparkId: string):
	| Readonly<{
			node: ResearchDefinition;
			spark: NonNullable<ResearchDefinition["spark"]>;
	  }>
	| undefined {
	for (const node of RESEARCH_NODES) {
		const spark = "spark" in node ? node.spark : undefined;
		if (spark?.id === sparkId) {
			return { node, spark };
		}
	}
	return undefined;
}

/** Fail fast if the research DAG contains malformed or dangling content. */
export function assertResearchDefinitions(
	definitions: readonly ResearchDefinition[],
): void {
	const ids = new Set<string>();
	const sparkIds = new Set<string>();
	for (const definition of definitions) {
		const hasEffects = Object.hasOwn(definition, "effects");
		const hasSpark = Object.hasOwn(definition, "spark");
		assertExactObject(
			definition,
			hasEffects && hasSpark
				? RESEARCH_DEFINITION_KEYS_WITH_EFFECTS_AND_SPARK
				: hasEffects
					? RESEARCH_DEFINITION_KEYS_WITH_EFFECTS
					: hasSpark
						? RESEARCH_DEFINITION_KEYS_WITH_SPARK
						: RESEARCH_DEFINITION_KEYS,
			"research definition",
		);
		assertIdentifier(definition.id, "Research definition id");
		if (ids.has(definition.id)) {
			throw new Error(`Duplicate research definition id: ${definition.id}`);
		}
		ids.add(definition.id);
		assertString(definition.label, "Research definition label");
		if (definition.label.trim().length === 0) {
			throw new Error(
				`Research definition ${definition.id} has an empty label`,
			);
		}
		assertEnum(definition.era, RESEARCH_ERAS, "Research definition era");
		assertString(definition.eraLabel, "Research definition era label");
		assertEnum(
			definition.category,
			RESEARCH_CATEGORIES,
			"Research definition category",
		);
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
		assertString(definition.description, "Research definition description");
		if (definition.description.trim().length === 0) {
			throw new Error(
				`Research definition ${definition.id} has an empty description`,
			);
		}
		if (definition.description.length >= 160) {
			throw new Error(
				`Research definition ${definition.id} description must be under 160 characters`,
			);
		}
		if (Object.hasOwn(definition, "effects")) {
			assertResearchEffects(
				definition.effects,
				`Research definition ${definition.id} effects`,
			);
		}
		if (Object.hasOwn(definition, "spark")) {
			assertResearchSpark(
				definition.spark,
				`Research definition ${definition.id} spark`,
			);
			if (sparkIds.has(definition.spark.id)) {
				throw new Error(`Duplicate research Spark id: ${definition.spark.id}`);
			}
			sparkIds.add(definition.spark.id);
			if (definition.spark.discount > definition.insightCost) {
				throw new Error(
					`Research definition ${definition.id} Spark discount cannot exceed its base Insight cost`,
				);
			}
		}
		if (RESEARCH_CATEGORY_LABELS[definition.category] !== definition.eraLabel) {
			throw new Error(
				`Research definition ${definition.id} has a category/era label mismatch`,
			);
		}
		if (
			definition.category === "foundations" ||
			definition.category === "transformer"
		) {
			if (definition.era !== TEXT_ERA) {
				throw new Error(
					`Text-era research definition ${definition.id} must use the Text tier`,
				);
			}
		} else if (
			definition.category === "pretraining_era" ||
			definition.category === "scaling_era" ||
			definition.category === "giants_era" ||
			definition.category === "tree_split" ||
			definition.category === "efficiency_school"
		) {
			if (definition.era !== ASSISTANT_ERA) {
				throw new Error(
					`Assistant-tier research definition ${definition.id} must use the Assistant era`,
				);
			}
		} else if (definition.era !== MULTIMODAL_ERA) {
			throw new Error(
				`Multimodal-tier research definition ${definition.id} must use the Multimodal era`,
			);
		}
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

/** A mutable save-safe copy of gameplay fields; prose stays in the catalog. */
export function cloneResearchNodes(
	nodes: readonly ResearchDefinition[] = RESEARCH_NODES,
): ResearchNode[] {
	return nodes.map((node) => ({
		id: node.id,
		era: node.era,
		branch: node.branch,
		status: node.status,
		insightCost: node.insightCost,
		prerequisites: [...node.prerequisites],
	}));
}
