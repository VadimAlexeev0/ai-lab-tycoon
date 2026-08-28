import {
	ASSISTANT_ERA,
	ASSISTANT_MODELS_KEYSTONE_ID,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.giants_era;

/** Era V: giant-model operations, from clean corpora to public checkpoints. */
export const GIANTS_ERA_NODES = [
	{
		id: ASSISTANT_MODELS_KEYSTONE_ID,
		label: "Proprietary frontier",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "giants_era",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"gpt3_scale_params",
			"training_stability",
			"rlhf_alignment",
		],
		description:
			"The lab builds a guarded frontier model behind closed doors, trading openness for a durable lead.",
	},
	{
		id: "multilingual_corpora",
		label: "Multilingual corpora",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "giants_era",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "zero_shot_transfer"],
		description:
			"The dataset stops speaking with one accent, widening the model's world while widening the diligence bill.",
	},
	{
		id: "training_stability",
		label: "Training stability",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "giants_era",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "scaling_laws_keystone"],
		description:
			"The cluster learns to survive long runs: fewer silent failures, fewer heroic recoveries, more predictable bets.",
	},
	{
		id: "hyperscale_compute_infrastructure",
		label: "Hyperscale compute infrastructure",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "giants_era",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"training_stability",
			"scaling_laws_keystone",
		],
		description:
			"A research cluster becomes infrastructure: thousands of accelerators, one schedule, and no cheap way back.",
	},
	{
		id: "open_weights_movement",
		label: "Open-weights movement",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "giants_era",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"gpt3_scale_params",
			"multilingual_corpora",
		],
		description:
			"Someone publishes the weights, and the frontier escapes the cathedral into a thousand independent workshops.",
	},
] as const satisfies readonly ResearchDefinition[];
