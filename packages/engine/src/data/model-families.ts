import type { ResearchEra } from "../components/research.js";
import { MULTIMODAL_MODELS_FUSION_ID } from "./research.js";

export const MODEL_DIMENSIONS = [
	"capability",
	"coding",
	"reliability",
	"safety",
	"efficiency",
	"multimodal",
] as const;
export type ModelDimension = (typeof MODEL_DIMENSIONS)[number];

export const DATA_MIX_DIMENSIONS = ["general", "code", "multimodal"] as const;
export type DataMixDimension = (typeof DATA_MIX_DIMENSIONS)[number];

export const MODEL_EMPHASIS_DIMENSIONS = [
	"capability",
	"reliability",
	"safety",
	"efficiency",
] as const;
export type ModelEmphasisDimension = (typeof MODEL_EMPHASIS_DIMENSIONS)[number];

export const MODEL_FAMILY_IDS = ["text", "assistant", "multimodal"] as const;
export type ModelFamilyId = (typeof MODEL_FAMILY_IDS)[number];

export const MODEL_TIERS = ["lean", "standard", "aggressive"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export type DataMix = Readonly<Record<DataMixDimension, number>>;
export type ModelEmphasis = Readonly<Record<ModelEmphasisDimension, number>>;

export type ModelFamilyDefinition = Readonly<{
	id: ModelFamilyId;
	displayName: string;
	allowedEras: readonly ResearchEra[];
	/** Relative weights used by the training score generator. */
	baseScoreProfile: Readonly<Record<ModelDimension, number>>;
	/** Minimum percentages for general, code, and multimodal training data. */
	dataMixRequirements: DataMix;
	unlockedByResearchNodeId: string;
}>;

/** V1 model families. This module intentionally contains content only. */
export const MODEL_FAMILIES = [
	{
		id: "text",
		displayName: "Text Model",
		allowedEras: ["text"],
		baseScoreProfile: {
			capability: 4,
			coding: 2,
			reliability: 2,
			safety: 1,
			efficiency: 3,
			multimodal: 0,
		},
		dataMixRequirements: { general: 50, code: 0, multimodal: 0 },
		unlockedByResearchNodeId: "text_models_principles",
	},
	{
		id: "assistant",
		displayName: "General Assistant",
		allowedEras: ["assistant"],
		baseScoreProfile: {
			capability: 3,
			coding: 3,
			reliability: 3,
			safety: 2,
			efficiency: 1,
			multimodal: 1,
		},
		dataMixRequirements: { general: 30, code: 10, multimodal: 0 },
		unlockedByResearchNodeId: "assistant_models_reasoning",
	},
	{
		id: "multimodal",
		displayName: "Multimodal Model",
		allowedEras: ["multimodal"],
		baseScoreProfile: {
			capability: 3,
			coding: 2,
			reliability: 2,
			safety: 2,
			efficiency: 1,
			multimodal: 5,
		},
		dataMixRequirements: { general: 20, code: 5, multimodal: 20 },
		unlockedByResearchNodeId: MULTIMODAL_MODELS_FUSION_ID,
	},
] as const satisfies readonly ModelFamilyDefinition[];

/** Compatibility alias for callers that prefer the longer content name. */
export const MODEL_FAMILY_DEFINITIONS = MODEL_FAMILIES;
