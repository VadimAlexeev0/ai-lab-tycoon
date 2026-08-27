import {
	ASSISTANT_MODELS_KEYSTONE_ID,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.convergence;

/** Endgame: capability and efficiency converge into durable autonomy. */
export const CONVERGENCE_NODES = [
	{
		id: "multimodal_models_fusion",
		label: "Agentic frontier",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "convergence",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"computer_use",
			"inference_price_war",
		],
		description:
			"Capability meets efficiency: an agent can act in the world without burning the lab down to pay for each step.",
	},
	{
		id: "persistent_memory",
		label: "Persistent memory",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "convergence",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"rag_memory",
			"mcp_protocols",
			"verification",
		],
		description:
			"The system remembers a relationship, a promise, and a failure across sessions without making the user start again.",
	},
	{
		id: "long_horizon_autonomy",
		label: "Long-horizon autonomy",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "convergence",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"multimodal_models_fusion",
			"persistent_memory",
			"verification",
		],
		description:
			"Plans survive the afternoon: the agent can carry a goal through many tools, checks, and changed circumstances.",
	},
] as const satisfies readonly ResearchDefinition[];
