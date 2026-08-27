import {
	ASSISTANT_ERA,
	INFRASTRUCTURE_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	TEXT_MODELS_KEYSTONE_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.efficiency_school;

/** A parallel branch: make frontier capability affordable enough to operate. */
export const EFFICIENCY_SCHOOL_NODES = [
	{
		id: "sparse_moe",
		label: "Sparse mixture-of-experts",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "efficiency_school",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"scaling_laws_keystone",
			"training_stability",
		],
		description:
			"Only the right experts wake up for each token, so the model grows wider without making every answer expensive.",
	},
	{
		id: "mla_kv_compression",
		label: "MLA / KV compression",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "efficiency_school",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"sparse_moe",
			"assistant_models_reasoning",
		],
		description:
			"The serving cache learns to keep less and remember enough, opening longer conversations on the same hardware.",
	},
	{
		id: "int4_quantization",
		label: "INT4 quantization",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "efficiency_school",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [TEXT_MODELS_KEYSTONE_ID, "mla_kv_compression"],
		description:
			"The weights shrink to four-bit numbers, trading a little precision for a lot more room on the serving bill.",
	},
	{
		id: "distillation_lines",
		label: "Distillation lines",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "efficiency_school",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"gpt_decoder",
			"int4_quantization",
		],
		description:
			"A large teacher passes on its useful habits, giving a smaller student a chance to reach the same customers.",
	},
	{
		id: "inference_price_war",
		label: "Inference price war",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "efficiency_school",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"int4_quantization",
			"distillation_lines",
		],
		description:
			"Every rival cuts the token price; efficiency stops being a research brag and becomes the company's runway.",
	},
	{
		id: "open_weight_ecosystem",
		label: "Open-weight ecosystem",
		era: ASSISTANT_ERA,
		eraLabel: ERA_LABEL,
		category: "efficiency_school",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			TEXT_MODELS_KEYSTONE_ID,
			"open_weights_movement",
			"distillation_lines",
			"export_control_politics",
		],
		description:
			"Tools, fine-tunes, and local deployments multiply around public weights, making capability a shared substrate.",
	},
] as const satisfies readonly ResearchDefinition[];
