import {
	ASSISTANT_MODELS_KEYSTONE_ID,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.reasoning_era;

/** Era VII: reasoning becomes a deliberate, metered product capability. */
export const REASONING_ERA_NODES = [
	{
		id: "test_time_compute",
		label: "Test-time compute",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "reasoning_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [ASSISTANT_MODELS_KEYSTONE_ID, "chain_of_thought"],
		description:
			"The model spends extra tokens thinking before it answers, turning inference time into a new frontier budget.",
	},
	{
		id: "reasoning_tokens_economy",
		label: "Reasoning-token economy",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "reasoning_era",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"test_time_compute",
			"inference_price_war",
		],
		description:
			"Long answers now have a meter: every hidden thought competes with serving margins and the rival's cheaper offer.",
	},
	{
		id: "hybrid_thinking_dial",
		label: "Hybrid thinking dial",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "reasoning_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"test_time_compute",
			"mla_kv_compression",
		],
		description:
			"A single product learns when to answer quickly and when to open a deeper loop; latency becomes a user choice.",
	},
	{
		id: "verification",
		label: "Verification",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "reasoning_era",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"constitutional_ai",
			"test_time_compute",
		],
		description:
			"The lab gives every impressive answer a second pass, asking a checker to catch the confident wrong turn.",
	},
] as const satisfies readonly ResearchDefinition[];
