/**
 * V1 opening and weekly economy values.
 *
 * All values are integer simulation units. Salaries and upkeep are weekly
 * costs; project progress and research insight are also weekly rates.
 */
import type { ModelFoundation } from "../components/models.js";
import type { ProjectKind } from "../components/projects.js";
import {
	assertExactObject,
	assertInteger,
	assertNonNegativeInteger,
	assertPositiveInteger,
} from "../validation.js";
import {
	DATA_MIX_DIMENSIONS,
	type DataMixDimension,
	MODEL_DIMENSIONS,
	MODEL_EMPHASIS_DIMENSIONS,
	type ModelDimension,
	type ModelEmphasisDimension,
	type ModelTier,
} from "./model-families.js";

export type ModelTierBalance = Readonly<{
	duration: number;
	cost: number;
	trainingCompute: number;
	scoreCeiling: number;
}>;

export type ModelFoundationBalance = Readonly<{
	duration: number;
	cost: number;
	floorPercent: number;
}>;

type ModelScoreDataMixWeights = Readonly<Record<DataMixDimension, number>>;
type ModelScoreEmphasisWeights = Readonly<
	Record<ModelEmphasisDimension, number>
>;

export type ModelScoreBalance = Readonly<{
	base: number;
	profileWeight: number;
	dataContributionDivisor: number;
	emphasisWeight: number;
	tierBaseline: number;
	tierDivisor: number;
	trainingJitterMin: number;
	trainingJitterMax: number;
	estimateNoiseMin: number;
	estimateNoiseMax: number;
	estimateBias: number;
	estimateBandWidthReductionPerCoverage: number;
	minimumEstimateBandWidth: number;
	dataMixWeights: Readonly<Record<ModelDimension, ModelScoreDataMixWeights>>;
	emphasisWeights: Readonly<Record<ModelDimension, ModelScoreEmphasisWeights>>;
}>;

export type BalanceConstants = Readonly<{
	startingCash: number;
	startingComputeCapacity: number;
	startingInsight: number;
	startingTrust: number;
	startingHype: number;
	startingProjectProgress: number;
	salaries: Readonly<{
		foundingTeam: number;
	}>;
	upkeep: number;
	projectProgressPerWeek: Readonly<Record<ProjectKind, number>>;
	researchInsightPerWeek: number;
	researchProjectDuration: number;
	modelTiers: Readonly<Record<ModelTier, ModelTierBalance>>;
	modelFoundations: Readonly<Record<ModelFoundation, ModelFoundationBalance>>;
	modelScore: ModelScoreBalance;
	modelEmphasisPoints: number;
	defaultEstimateBandWidth: number;
}>;

/** Cash available when a new V1 run opens. */
export const STARTING_CASH = 1_000;
/** Shared compute capacity available when a new V1 run opens. */
export const STARTING_COMPUTE_CAPACITY = 12;
/** Insight available before the first week of research. */
export const STARTING_INSIGHT = 0;
/** Trust available when a new V1 run opens. */
export const STARTING_TRUST = 60;
/** Hype available when a new V1 run opens. */
export const STARTING_HYPE = 10;
/** Progress before a project has received its first weekly work tick. */
export const STARTING_PROJECT_PROGRESS = 0;
/** Weekly salary for each team in the initial V1 staffing tier. */
export const FOUNDING_TEAM_SALARY = 50;
/** Weekly base operating cost before team salaries and other systems. */
export const BASE_UPKEEP = 25;
/** Progress units produced by one team in one week for each project kind. */
export const PROJECT_PROGRESS_PER_WEEK = {
	research: 1,
	infrastructure: 1,
	model: 1,
	training: 1,
	evaluation: 1,
	product: 1,
} as const satisfies Readonly<Record<ProjectKind, number>>;
/** Insight units produced by each idle or researching team per week. */
export const RESEARCH_INSIGHT_PER_WEEK = 1;
/** Duration of each initial research project in weeks. */
export const RESEARCH_PROJECT_DURATION = 1;
/** Compute-tier tuning for model design and training. */
export const MODEL_TIER_BALANCE = {
	lean: {
		duration: 2,
		cost: 80,
		trainingCompute: 3,
		scoreCeiling: 72,
	},
	standard: {
		duration: 3,
		cost: 160,
		trainingCompute: 5,
		scoreCeiling: 88,
	},
	aggressive: {
		duration: 4,
		cost: 280,
		trainingCompute: 8,
		scoreCeiling: 100,
	},
} as const satisfies Readonly<Record<ModelTier, ModelTierBalance>>;
/** Foundation-specific time, cash, and inheritance tuning. */
export const MODEL_FOUNDATION_BALANCE = {
	fresh: {
		duration: 0,
		cost: 0,
		floorPercent: 0,
	},
	continued: {
		duration: 1,
		cost: 120,
		floorPercent: 60,
	},
	distilled: {
		duration: 2,
		cost: 180,
		floorPercent: 30,
	},
} as const satisfies Readonly<Record<ModelFoundation, ModelFoundationBalance>>;
/** Score-generation tuning. Keep formula constants in data, not systems. */
export const MODEL_SCORE_BALANCE = {
	base: 20,
	profileWeight: 3,
	dataContributionDivisor: 10,
	emphasisWeight: 4,
	tierBaseline: 60,
	tierDivisor: 2,
	trainingJitterMin: -8,
	trainingJitterMax: 8,
	estimateNoiseMin: -8,
	estimateNoiseMax: 8,
	estimateBias: -2,
	estimateBandWidthReductionPerCoverage: 4,
	minimumEstimateBandWidth: 1,
	dataMixWeights: {
		capability: { general: 1, code: 1, multimodal: 0 },
		coding: { general: 0, code: 2, multimodal: 0 },
		reliability: { general: 1, code: 0, multimodal: 1 },
		safety: { general: 1, code: 0, multimodal: 2 },
		efficiency: { general: 1, code: 1, multimodal: 0 },
		multimodal: { general: 0, code: 0, multimodal: 3 },
	},
	emphasisWeights: {
		capability: { capability: 1, reliability: 0, safety: 0, efficiency: 0 },
		coding: { capability: 0, reliability: 0, safety: 0, efficiency: 0 },
		reliability: { capability: 0, reliability: 1, safety: 0, efficiency: 0 },
		safety: { capability: 0, reliability: 0, safety: 1, efficiency: 0 },
		efficiency: { capability: 0, reliability: 0, safety: 0, efficiency: 1 },
		multimodal: { capability: 0, reliability: 0, safety: 0, efficiency: 0 },
	},
} as const satisfies ModelScoreBalance;
/** The number of designer emphasis points available in V1. */
export const MODEL_EMPHASIS_POINTS = 6;
/** Initial uncertainty on a newly trained model, before evaluation. */
export const DEFAULT_ESTIMATE_BAND_WIDTH = 20;

/**
 * Canonical typed balance table for V1.
 *
 * Keep opening-state and future weekly-system values here rather than
 * repeating economy numbers in systems or surfaces.
 */
export const BALANCE = {
	startingCash: STARTING_CASH,
	startingComputeCapacity: STARTING_COMPUTE_CAPACITY,
	startingInsight: STARTING_INSIGHT,
	startingTrust: STARTING_TRUST,
	startingHype: STARTING_HYPE,
	startingProjectProgress: STARTING_PROJECT_PROGRESS,
	salaries: {
		foundingTeam: FOUNDING_TEAM_SALARY,
	},
	upkeep: BASE_UPKEEP,
	projectProgressPerWeek: PROJECT_PROGRESS_PER_WEEK,
	researchInsightPerWeek: RESEARCH_INSIGHT_PER_WEEK,
	researchProjectDuration: RESEARCH_PROJECT_DURATION,
	modelTiers: MODEL_TIER_BALANCE,
	modelFoundations: MODEL_FOUNDATION_BALANCE,
	modelScore: MODEL_SCORE_BALANCE,
	modelEmphasisPoints: MODEL_EMPHASIS_POINTS,
	defaultEstimateBandWidth: DEFAULT_ESTIMATE_BAND_WIDTH,
} as const satisfies BalanceConstants;

assertBalanceConstants(BALANCE);

/** Fail fast if a tuning table contains non-integer or non-positive values. */
export function assertBalanceConstants(value: BalanceConstants): void {
	assertExactObject(
		value,
		[
			"startingCash",
			"startingComputeCapacity",
			"startingInsight",
			"startingTrust",
			"startingHype",
			"startingProjectProgress",
			"salaries",
			"upkeep",
			"projectProgressPerWeek",
			"researchInsightPerWeek",
			"researchProjectDuration",
			"modelTiers",
			"modelFoundations",
			"modelScore",
			"modelEmphasisPoints",
			"defaultEstimateBandWidth",
		],
		"balance",
	);
	assertNonNegativeInteger(value.startingCash, "Starting cash");
	assertNonNegativeInteger(
		value.startingComputeCapacity,
		"Starting compute capacity",
	);
	assertNonNegativeInteger(value.startingInsight, "Starting insight");
	assertNonNegativeInteger(value.startingTrust, "Starting trust");
	assertNonNegativeInteger(value.startingHype, "Starting hype");
	assertNonNegativeInteger(
		value.startingProjectProgress,
		"Starting project progress",
	);
	assertExactObject(value.salaries, ["foundingTeam"], "Balance salaries");
	assertPositiveInteger(value.salaries.foundingTeam, "Founding team salary");
	assertPositiveInteger(value.upkeep, "Base upkeep");
	assertExactObject(
		value.projectProgressPerWeek,
		[
			"research",
			"infrastructure",
			"model",
			"training",
			"evaluation",
			"product",
		],
		"Project progress balance",
	);
	for (const [kind, progress] of Object.entries(value.projectProgressPerWeek)) {
		assertPositiveInteger(progress, `Progress for ${kind}`);
	}
	assertPositiveInteger(
		value.researchInsightPerWeek,
		"Research insight per week",
	);
	assertPositiveInteger(
		value.researchProjectDuration,
		"Research project duration",
	);
	assertExactObject(
		value.modelTiers,
		["lean", "standard", "aggressive"],
		"Model tiers",
	);
	for (const [tier, tuning] of Object.entries(value.modelTiers)) {
		assertExactObject(
			tuning,
			["duration", "cost", "trainingCompute", "scoreCeiling"],
			`Model tier ${tier}`,
		);
		assertPositiveInteger(tuning.duration, `Model tier ${tier} duration`);
		assertPositiveInteger(tuning.cost, `Model tier ${tier} cost`);
		assertPositiveInteger(
			tuning.trainingCompute,
			`Model tier ${tier} training compute`,
		);
		assertPositiveInteger(
			tuning.scoreCeiling,
			`Model tier ${tier} score ceiling`,
		);
		if (tuning.scoreCeiling > 100) {
			throw new Error(`Model tier ${tier} score ceiling must be at most 100`);
		}
	}
	assertExactObject(
		value.modelFoundations,
		["fresh", "continued", "distilled"],
		"Model foundations",
	);
	for (const [foundation, tuning] of Object.entries(value.modelFoundations)) {
		assertExactObject(
			tuning,
			["duration", "cost", "floorPercent"],
			`Model foundation ${foundation}`,
		);
		assertNonNegativeInteger(
			tuning.duration,
			`Model foundation ${foundation} duration`,
		);
		assertNonNegativeInteger(
			tuning.cost,
			`Model foundation ${foundation} cost`,
		);
		assertNonNegativeInteger(
			tuning.floorPercent,
			`Model foundation ${foundation} floor percent`,
		);
		if (tuning.floorPercent > 100) {
			throw new Error(
				`Model foundation ${foundation} floor percent must be at most 100`,
			);
		}
	}
	assertModelScoreBalance(value.modelScore);
	assertPositiveInteger(value.modelEmphasisPoints, "Model emphasis points");
	assertPositiveInteger(
		value.defaultEstimateBandWidth,
		"Default estimate band width",
	);
	if (value.defaultEstimateBandWidth > 100) {
		throw new Error("Default estimate band width must be at most 100");
	}
}

function assertModelScoreBalance(value: ModelScoreBalance): void {
	assertExactObject(
		value,
		[
			"base",
			"profileWeight",
			"dataContributionDivisor",
			"emphasisWeight",
			"tierBaseline",
			"tierDivisor",
			"trainingJitterMin",
			"trainingJitterMax",
			"estimateNoiseMin",
			"estimateNoiseMax",
			"estimateBias",
			"estimateBandWidthReductionPerCoverage",
			"minimumEstimateBandWidth",
			"dataMixWeights",
			"emphasisWeights",
		],
		"Model score balance",
	);
	assertNonNegativeInteger(value.base, "Model score base");
	assertNonNegativeInteger(value.profileWeight, "Model score profile weight");
	assertPositiveInteger(
		value.dataContributionDivisor,
		"Model score data contribution divisor",
	);
	assertNonNegativeInteger(value.emphasisWeight, "Model score emphasis weight");
	assertNonNegativeInteger(value.tierBaseline, "Model score tier baseline");
	assertPositiveInteger(value.tierDivisor, "Model score tier divisor");
	assertInteger(value.trainingJitterMin, "Model score training jitter minimum");
	assertInteger(value.trainingJitterMax, "Model score training jitter maximum");
	assertInteger(value.estimateNoiseMin, "Model score estimate noise minimum");
	assertInteger(value.estimateNoiseMax, "Model score estimate noise maximum");
	assertInteger(value.estimateBias, "Model score estimate bias");
	assertNonNegativeInteger(
		value.estimateBandWidthReductionPerCoverage,
		"Model score estimate band width reduction",
	);
	assertPositiveInteger(
		value.minimumEstimateBandWidth,
		"Model score minimum estimate band width",
	);
	if (value.trainingJitterMin > value.trainingJitterMax) {
		throw new Error("Model score training jitter range is reversed");
	}
	if (value.estimateNoiseMin > value.estimateNoiseMax) {
		throw new Error("Model score estimate noise range is reversed");
	}
	if (value.minimumEstimateBandWidth > 100) {
		throw new Error(
			"Model score minimum estimate band width must be at most 100",
		);
	}

	assertExactObject(
		value.dataMixWeights,
		MODEL_DIMENSIONS,
		"Model score data mix weights",
	);
	for (const dimension of MODEL_DIMENSIONS) {
		const weights = value.dataMixWeights[dimension];
		assertExactObject(
			weights,
			DATA_MIX_DIMENSIONS,
			`Model score ${dimension} data mix weights`,
		);
		for (const dataDimension of DATA_MIX_DIMENSIONS) {
			assertNonNegativeInteger(
				weights[dataDimension],
				`Model score ${dimension} ${dataDimension} weight`,
			);
		}
	}

	assertExactObject(
		value.emphasisWeights,
		MODEL_DIMENSIONS,
		"Model score emphasis weights",
	);
	for (const dimension of MODEL_DIMENSIONS) {
		const weights = value.emphasisWeights[dimension];
		assertExactObject(
			weights,
			MODEL_EMPHASIS_DIMENSIONS,
			`Model score ${dimension} emphasis weights`,
		);
		for (const emphasisDimension of MODEL_EMPHASIS_DIMENSIONS) {
			assertNonNegativeInteger(
				weights[emphasisDimension],
				`Model score ${dimension} ${emphasisDimension} weight`,
			);
		}
	}
}

export type V1Balance = typeof BALANCE;
