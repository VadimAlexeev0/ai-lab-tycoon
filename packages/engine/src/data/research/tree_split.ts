import {
	ASSISTANT_ERA,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.tree_split;

/** Era VI: the research tree splits between compute-optimal scale and alignment. */
export const TREE_SPLIT_NODES = [
	{
		id: "chinchilla_compute_optimal",
		label: "Chinchilla compute-optimal training",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "tree_split",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"scaling_laws_keystone",
			"training_stability",
		],
		description:
			"The lab spends compute on the right ratio of data to parameters and gets a smaller giant with a longer memory.",
	},
	{
		id: "rlhf_alignment",
		label: "RLHF alignment",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "tree_split",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"task_finetuning",
			"text_products_evaluation",
		],
		description:
			"Human preferences become a training signal, teaching the assistant which helpful paths are worth taking.",
	},
	{
		id: "constitutional_ai",
		label: "Constitutional AI",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "tree_split",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"rlhf_alignment",
			"zero_shot_transfer",
		],
		description:
			"A written charter lets the model critique its own answers before a human has to catch every sharp edge.",
	},
	{
		id: "chain_of_thought",
		label: "Chain-of-thought reasoning",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "tree_split",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"text_products_evaluation",
			"rlhf_alignment",
			"assistant_models_reasoning",
		],
		description:
			"The model learns to leave a trail of intermediate steps, making difficult answers slower but inspectable.",
	},
	{
		id: "export_control_politics",
		label: "Export-control politics",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "tree_split",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"hyperscale_compute_infrastructure",
			"open_weights_movement",
		],
		description:
			"Accelerators become geopolitics: the next run depends on permits, supply chains, and who gets to scale.",
	},
] as const satisfies readonly ResearchDefinition[];
