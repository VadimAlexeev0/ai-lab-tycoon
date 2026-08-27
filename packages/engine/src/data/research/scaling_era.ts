import {
	ASSISTANT_ERA,
	IN_CONTEXT_LEARNING_ID,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PARALLEL_TRAINING_ID,
	PRODUCTS_SAFETY_BRANCH,
	PROMPT_ENGINEERING_ID,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.scaling_era;

/** Era IV: scale turns a language model into a general-purpose interface. */
export const SCALING_ERA_NODES = [
	{
		id: "scaling_laws_keystone",
		label: "Scaling laws",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "scaling_era",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, PARALLEL_TRAINING_ID],
		description:
			"The curve starts speaking: data, parameters, and compute reveal how tomorrow's capability will be bought.",
	},
	{
		id: "gpt3_scale_params",
		label: "GPT-3-scale parameters",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "scaling_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"scaling_laws_keystone",
			"gpt_decoder",
		],
		description:
			"The parameter count becomes a headline, and the training bill becomes a strategic decision instead of a footnote.",
	},
	{
		id: IN_CONTEXT_LEARNING_ID,
		label: "In-context learning",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "scaling_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"gpt3_scale_params",
			"zero_shot_transfer",
		],
		description:
			"A handful of examples in the prompt can steer a capable model without another expensive training run.",
	},
	{
		id: PROMPT_ENGINEERING_ID,
		label: "Prompt engineering",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "scaling_era",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			IN_CONTEXT_LEARNING_ID,
			"task_finetuning",
		],
		description:
			"The instruction becomes an interface: careful wording makes the same frozen model useful in more rooms.",
	},
] as const satisfies readonly ResearchDefinition[];
