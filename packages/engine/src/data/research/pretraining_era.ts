import {
	ASSISTANT_ERA,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.pretraining_era;

/** Era III: the three pretraining families that made one model many tasks. */
export const PRETRAINING_ERA_NODES = [
	{
		id: "bert_encoder",
		label: "BERT-style encoder",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "pretraining_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID],
		description:
			"The encoder reads both directions at once, turning a masked sentence into a map of meaning.",
	},
	{
		id: "gpt_decoder",
		label: "GPT-style decoder",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "pretraining_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID],
		description:
			"The decoder keeps predicting the next token until a simple text engine starts to feel like a partner.",
	},
	{
		id: "t5_encoder_decoder",
		label: "T5 encoder–decoder",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "pretraining_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "bert_encoder", "gpt_decoder"],
		description:
			"The lab frames every task as text-to-text and gives one system a common language for many jobs.",
	},
	{
		id: "task_finetuning",
		label: "Task fine-tuning",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "pretraining_era",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "bert_encoder", "gpt_decoder"],
		description:
			"A broad pretraining run learns a task's manners, turning raw language ability into a useful product behavior.",
	},
	{
		id: "zero_shot_transfer",
		label: "Zero-shot transfer",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "pretraining_era",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"t5_encoder_decoder",
			"task_finetuning",
		],
		description:
			"The model follows a new task from its wording alone; the lab discovers that examples are not always required.",
	},
] as const satisfies readonly ResearchDefinition[];
