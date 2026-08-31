import type {
	ResearchBranch,
	ResearchEra,
	ResearchNodeStatus,
} from "../../components/research.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertObject,
	assertPositiveInteger,
} from "../../validation.js";
import type { ModelDimension } from "../model-families.js";

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

export type ResearchEvaluationKind = "capability" | "safety_reliability";

/**
 * Typed mechanics attached to research content. The active values are derived
 * from completed node ids; no mutable effect cache is persisted in a save.
 */
export type ResearchEffect =
	| Readonly<{
			kind: "training_compute_reduction";
			amount: number;
	  }>
	| Readonly<{
			kind: "model_score_bonus";
			dimension: ModelDimension;
			amount: number;
	  }>
	| Readonly<{
			kind: "evaluation_coverage_bonus";
			evaluation: ResearchEvaluationKind;
			amount: number;
	  }>;

const RESEARCH_EFFECT_KINDS = [
	"training_compute_reduction",
	"model_score_bonus",
	"evaluation_coverage_bonus",
] as const;
const RESEARCH_EFFECT_DIMENSIONS = [
	"capability",
	"coding",
	"reliability",
	"safety",
	"efficiency",
	"multimodal",
] as const satisfies readonly ModelDimension[];
const RESEARCH_EVALUATION_KINDS = [
	"capability",
	"safety_reliability",
] as const satisfies readonly ResearchEvaluationKind[];

/**
 * First typed research-effects slice. These values are deliberately small and
 * named so later balance passes can tune the mechanics without changing the
 * effect contract.
 */
export const RESEARCH_EFFECT_BALANCE = {
	recurrentReliabilityScoreBonus: 4,
	parallelTrainingComputeReduction: 1,
	attentionCapabilityEvaluationCoverageBonus: 15,
} as const;

export function assertResearchEffect(
	value: unknown,
	path = "research effect",
): asserts value is ResearchEffect {
	assertObject(value, path);
	assertEnum(value.kind, RESEARCH_EFFECT_KINDS, `${path} kind`);
	switch (value.kind) {
		case "training_compute_reduction":
			assertExactObject(value, ["kind", "amount"], path);
			assertPositiveInteger(value.amount, `${path} amount`);
			return;
		case "model_score_bonus":
			assertExactObject(value, ["kind", "dimension", "amount"], path);
			assertEnum(
				value.dimension,
				RESEARCH_EFFECT_DIMENSIONS,
				`${path} dimension`,
			);
			assertPositiveInteger(value.amount, `${path} amount`);
			if (value.amount > 100) {
				throw new Error(`${path} amount must be at most 100`);
			}
			return;
		case "evaluation_coverage_bonus":
			assertExactObject(value, ["kind", "evaluation", "amount"], path);
			assertEnum(
				value.evaluation,
				RESEARCH_EVALUATION_KINDS,
				`${path} evaluation`,
			);
			assertPositiveInteger(value.amount, `${path} amount`);
			if (value.amount > 100) {
				throw new Error(`${path} amount must be at most 100`);
			}
			return;
	}
}

export function assertResearchEffects(
	value: unknown,
	path = "research effects",
): asserts value is readonly ResearchEffect[] {
	assertArray(value, path);
	const signatures = new Set<string>();
	for (const [index, effect] of value.entries()) {
		assertResearchEffect(effect, `${path}[${index}]`);
		const signature =
			effect.kind === "model_score_bonus"
				? `${effect.kind}:${effect.dimension}`
				: effect.kind === "evaluation_coverage_bonus"
					? `${effect.kind}:${effect.evaluation}`
					: effect.kind;
		if (signatures.has(signature)) {
			throw new Error(`${path} repeats effect ${signature}`);
		}
		signatures.add(signature);
	}
}

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
	effects?: readonly ResearchEffect[];
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
