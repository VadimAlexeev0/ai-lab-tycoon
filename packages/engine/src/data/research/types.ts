import type {
	ResearchBranch,
	ResearchEra,
	ResearchNodeStatus,
} from "../../components/research.js";

export type ResearchCategory =
	| "foundations"
	| "transformer"
	| "pretraining_era"
	| "scaling_era"
	| "giants_era"
	| "tree_split"
	| "efficiency_school"
	| "reasoning_era"
	| "multimodal_agents"
	| "convergence";

export type ResearchDefinition = Readonly<{
	id: string;
	label: string;
	era: ResearchEra;
	eraLabel: string;
	category: ResearchCategory;
	branch: ResearchBranch;
	status: ResearchNodeStatus;
	insightCost: number;
	prerequisites: readonly string[];
	description: string;
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
export const RESEARCH_CATEGORIES = [
	"foundations",
	"transformer",
	"pretraining_era",
	"scaling_era",
	"giants_era",
	"tree_split",
	"efficiency_school",
	"reasoning_era",
	"multimodal_agents",
	"convergence",
] as const satisfies readonly ResearchCategory[];

export const RESEARCH_CATEGORY_LABELS: Readonly<
	Record<ResearchCategory, string>
> = {
	foundations: "Foundations · 2014–2017",
	transformer: "Transformer · 2017–2020",
	pretraining_era: "Pretraining era · 2018–2020",
	scaling_era: "Scaling era · 2020–2022",
	giants_era: "Giants era · 2022–2023",
	tree_split: "Tree split · 2022–2024",
	efficiency_school: "Efficiency school · parallel branch",
	reasoning_era: "Reasoning era · 2024–2026",
	multimodal_agents: "Multimodal agents · 2023–2026",
	convergence: "Convergence · endgame",
};

/** The Text-era Models keystone gates entry into the Assistant era. */
export const TEXT_MODELS_KEYSTONE_ID = "text_models_keystone";
/** The Assistant-era Models keystone gates entry into the Multimodal era. */
export const ASSISTANT_MODELS_KEYSTONE_ID = "assistant_models_keystone";
/** The first Multimodal-era model research node gates the model family. */
export const MULTIMODAL_MODELS_FUSION_ID = "multimodal_models_fusion";

/** Stable ids retain save and model-family references while gaining historical labels. */
export const WORD_VECTORS_ID = "text_models_principles";
export const RNN_LSTM_ID = "text_infrastructure_compute";
export const SEQ2SEQ_ID = "text_products_safety_basics";
export const ATTENTION_MECHANISM_ID = "text_products_evaluation";
export const PARALLEL_TRAINING_ID = "text_infrastructure_scaling";
export const IN_CONTEXT_LEARNING_ID = "assistant_models_reasoning";
export const PROMPT_ENGINEERING_ID = "assistant_models_tool_use";
export const PROPRIETARY_FRONTIER_ID = ASSISTANT_MODELS_KEYSTONE_ID;
export const AGENTIC_FRONTIER_ID = MULTIMODAL_MODELS_FUSION_ID;

export const ERA_LABELS: Readonly<Record<ResearchCategory, string>> =
	RESEARCH_CATEGORY_LABELS;
