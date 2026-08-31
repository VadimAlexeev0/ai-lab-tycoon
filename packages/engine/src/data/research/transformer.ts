import {
	ATTENTION_MECHANISM_ID,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PARALLEL_TRAINING_ID,
	RESEARCH_CATEGORY_LABELS,
	RESEARCH_EFFECT_BALANCE,
	type ResearchDefinition,
	TEXT_ERA,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.transformer;

/** Era II: the Transformer stack that turns sequence work into a parallel engine. */
export const TRANSFORMER_NODES = [
	{
		id: "self_attention",
		label: "Self-attention",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "transformer",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [ATTENTION_MECHANISM_ID],
		description:
			"Every token can look across the sentence; context becomes a conversation instead of a queue.",
	},
	{
		id: "multi_head_attention",
		label: "Multi-head attention",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "transformer",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: ["self_attention"],
		description:
			"Several attention heads learn different relationships at once, from grammar to distant agreement.",
	},
	{
		id: "positional_encoding",
		label: "Positional encoding",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "transformer",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: ["self_attention"],
		description:
			"Order returns to the parallel machine: the model knows whether a word arrived first, last, or somewhere strange.",
	},
	{
		id: PARALLEL_TRAINING_ID,
		label: "Parallel training",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "transformer",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: ["multi_head_attention", "positional_encoding"],
		description:
			"The cluster stops waiting for one token at a time; each later training run uses one less Compute.",
		effects: [
			{
				kind: "training_compute_reduction",
				amount: RESEARCH_EFFECT_BALANCE.parallelTrainingComputeReduction,
			},
		],
	},
	{
		id: TEXT_MODELS_KEYSTONE_ID,
		label: "Transformer architecture",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "transformer",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ATTENTION_MECHANISM_ID,
			"self_attention",
			"multi_head_attention",
			"positional_encoding",
			PARALLEL_TRAINING_ID,
		],
		description:
			"The architecture clicks into place: attention, order, and parallel hardware become one new language engine.",
	},
] as const satisfies readonly ResearchDefinition[];
