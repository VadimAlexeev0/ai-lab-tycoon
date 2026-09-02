import type { ResearchEra } from "../components/research.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertNonNegativeInteger,
	assertPositiveInteger,
	assertString,
} from "../validation.js";
import {
	getResearchDefinition,
	LOCAL_EDGE_INFERENCE_ID,
	MULTIMODAL_MODELS_FUSION_ID,
	RESEARCH_ERAS,
	VIDEO_WORLD_MODELS_ID,
} from "./research.js";

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

export const MODEL_FAMILY_IDS = [
	"text",
	"assistant",
	"multimodal",
	"local_edge",
	"video",
] as const;
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
	/** Percentage of the channel's central serving compute used per user. */
	servingComputePerUserPercent: number;
	/** Signed adjustment applied to the selected compute tier's score ceiling. */
	scoreCeilingAdjustment: number;
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
		servingComputePerUserPercent: 100,
		scoreCeilingAdjustment: 0,
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
		servingComputePerUserPercent: 100,
		scoreCeilingAdjustment: 0,
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
		servingComputePerUserPercent: 100,
		scoreCeilingAdjustment: 0,
		unlockedByResearchNodeId: MULTIMODAL_MODELS_FUSION_ID,
	},
	// ponytail: Local/edge delivery intentionally reuses the broad chat,
	// developer API, and enterprise channels in this bounded slice. Upgrade
	// path: add a device/OEM channel with its own launch and pricing contract
	// when that market is in scope.
	{
		id: "local_edge",
		displayName: "Local / Edge Model",
		allowedEras: ["assistant"],
		baseScoreProfile: {
			capability: 2,
			coding: 2,
			reliability: 2,
			safety: 1,
			efficiency: 5,
			multimodal: 0,
		},
		dataMixRequirements: { general: 30, code: 10, multimodal: 0 },
		servingComputePerUserPercent: 50,
		scoreCeilingAdjustment: -12,
		unlockedByResearchNodeId: LOCAL_EDGE_INFERENCE_ID,
	},
	// ponytail: Video reuses the broad chat, developer API, and enterprise
	// channels in this bounded slice. Upgrade path: add a dedicated video
	// studio channel with its own launch, pricing, and capacity contract.
	{
		id: "video",
		displayName: "Video Model",
		allowedEras: ["multimodal"],
		baseScoreProfile: {
			capability: 4,
			coding: 1,
			reliability: 1,
			safety: 1,
			efficiency: 1,
			multimodal: 8,
		},
		dataMixRequirements: { general: 15, code: 5, multimodal: 40 },
		servingComputePerUserPercent: 250,
		scoreCeilingAdjustment: -8,
		unlockedByResearchNodeId: VIDEO_WORLD_MODELS_ID,
	},
] as const satisfies readonly ModelFamilyDefinition[];

const MODEL_FAMILY_DEFINITION_KEYS = [
	"id",
	"displayName",
	"allowedEras",
	"baseScoreProfile",
	"dataMixRequirements",
	"servingComputePerUserPercent",
	"scoreCeilingAdjustment",
	"unlockedByResearchNodeId",
] as const;

/** Fail fast when authored model-family content drifts from runtime contracts. */
export function assertModelFamilyDefinitions(
	value: readonly ModelFamilyDefinition[],
): void {
	assertArray(value, "Model family definitions");
	const ids = new Set<string>();
	for (const family of value) {
		assertExactObject(family, MODEL_FAMILY_DEFINITION_KEYS, "model family");
		assertEnum(family.id, MODEL_FAMILY_IDS, "Model family id");
		if (ids.has(family.id)) {
			throw new Error(`Duplicate model family id: ${family.id}`);
		}
		ids.add(family.id);
		assertString(family.displayName, `Model family ${family.id} display name`);
		if (family.displayName.trim().length === 0) {
			throw new Error(
				`Model family ${family.id} display name must not be empty`,
			);
		}
		assertArray(family.allowedEras, `Model family ${family.id} allowed eras`);
		if (family.allowedEras.length === 0) {
			throw new Error(`Model family ${family.id} needs an allowed era`);
		}
		const eras = new Set<string>();
		for (const era of family.allowedEras) {
			assertEnum(era, RESEARCH_ERAS, `Model family ${family.id} era`);
			if (eras.has(era)) {
				throw new Error(`Model family ${family.id} repeats an allowed era`);
			}
			eras.add(era);
		}
		assertExactObject(
			family.baseScoreProfile,
			MODEL_DIMENSIONS,
			`Model family ${family.id} score profile`,
		);
		for (const dimension of MODEL_DIMENSIONS) {
			assertNonNegativeInteger(
				family.baseScoreProfile[dimension],
				`Model family ${family.id} ${dimension} profile`,
			);
			if (family.baseScoreProfile[dimension] > 100) {
				throw new Error(
					`Model family ${family.id} ${dimension} profile must be at most 100`,
				);
			}
		}
		assertExactObject(
			family.dataMixRequirements,
			DATA_MIX_DIMENSIONS,
			`Model family ${family.id} data mix requirements`,
		);
		let requirementTotal = 0;
		for (const dimension of DATA_MIX_DIMENSIONS) {
			assertNonNegativeInteger(
				family.dataMixRequirements[dimension],
				`Model family ${family.id} ${dimension} data requirement`,
			);
			if (family.dataMixRequirements[dimension] > 100) {
				throw new Error(
					`Model family ${family.id} ${dimension} data requirement must be at most 100`,
				);
			}
			requirementTotal += family.dataMixRequirements[dimension];
		}
		if (requirementTotal > 100) {
			throw new Error(
				`Model family ${family.id} data mix requirements cannot exceed 100`,
			);
		}
		assertPositiveInteger(
			family.servingComputePerUserPercent,
			`Model family ${family.id} serving compute multiplier`,
		);
		assertInteger(
			family.scoreCeilingAdjustment,
			`Model family ${family.id} score ceiling adjustment`,
		);
		assertIdentifier(
			family.unlockedByResearchNodeId,
			`Model family ${family.id} research unlock id`,
		);
		const unlock = getResearchDefinition(family.unlockedByResearchNodeId);
		if (unlock === undefined) {
			throw new Error(
				`Model family ${family.id} references an unknown research unlock node`,
			);
		}
		if (!family.allowedEras.includes(unlock.era)) {
			throw new Error(
				`Model family ${family.id} research unlock era must be one of its allowed eras`,
			);
		}
	}
}

assertModelFamilyDefinitions(MODEL_FAMILIES);

/** Compatibility alias for callers that prefer the longer content name. */
export const MODEL_FAMILY_DEFINITIONS = MODEL_FAMILIES;
