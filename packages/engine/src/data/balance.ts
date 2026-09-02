/**
 * V1 opening and weekly economy values.
 *
 * All values are integer simulation units. Salaries and upkeep are weekly
 * costs; project progress and research insight are also weekly rates.
 */
import type { EvaluationKind } from "../components/decisions.js";
import type { ModelFoundation } from "../components/models.js";
import type { ProductChannel } from "../components/products.js";
import type { ProjectKind } from "../components/projects.js";
import type { ResearchEra } from "../components/research.js";
import type { RivalArchetype } from "../components/rivals.js";
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
import type { ResearchParadigmBalance } from "./research/paradigm-balance.js";
import { RESEARCH_PARADIGM_BALANCE } from "./research/paradigm-balance.js";
import type { ResearchParadigmId } from "./research/paradigms.js";

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

export type DataInventoryBalance = Readonly<{
	/** One model recipe's summarized mix is exactly this many units. */
	trainingUnits: number;
	/** Freshness below this percentage produces a deterministic warning. */
	stalenessThreshold: number;
	/** Synthetic share above this percentage creates quality/debt pressure. */
	syntheticOveruseThreshold: number;
	syntheticQualityPenaltyPerUnit: number;
	syntheticDebtPerUnit: number;
}>;

export type KnowledgeCutoffBalance = Readonly<{
	/** Inclusive age in weeks that remains fresh. */
	freshThroughWeeks: number;
	/** Age at which the stronger stale pressure begins. */
	staleAfterWeeks: number;
	/** Bounded demand multiplier for aging models. */
	agingDemandFactor: number;
	/** Bounded quality multiplier for aging models. */
	agingQualityFactor: number;
	/** Bounded demand multiplier for stale models. */
	staleDemandFactor: number;
	/** Bounded quality multiplier for stale models. */
	staleQualityFactor: number;
	/** Weeks of shared-compute work for one explicit refresh. */
	refreshDuration: number;
	/** Shared compute reserved by one active refresh project. */
	refreshCompute: number;
	/** Minimum source freshness accepted by an explicit refresh. */
	refreshMinimumFreshness: number;
}>;

export type ProductChannelBalance = Readonly<{
	minEra: ResearchEra;
	minimumTrust: number;
	minimumHype: number;
	minimumCapability: number;
	minimumCoding: number;
	minimumReliability: number;
	minimumSafety: number;
	launchCost: number;
	baseUsers: number;
	usersPerWeek: number;
	servingComputePerUser: number;
	weeklyRevenue: number;
	qualityDimensions: readonly ModelDimension[];
	hypePerWeek: number;
	trustPerWeek: number;
}>;

export type RivalClockBalance = Readonly<{
	progressPerWeek: number;
}>;

export type FundingRoundBalance = Readonly<{
	minimumHype: number;
	minimumTrust: number;
	minimumModelScore: number;
	minimumProducts: number;
	minimumRevenue: number;
	grant: number;
}>;

export type EvaluationBalance = Readonly<{
	insightCost: number;
	computeCost: number;
	coveragePercent: number;
	safetyEmphasisBonus: number;
}>;

export type BalanceConstants = Readonly<{
	startingCash: number;
	startingComputeCapacity: number;
	infrastructureCapacityGain: number;
	computePurchaseCost: number;
	computePurchaseUnits: number;
	hireTeamCost: number;
	startingInsight: number;
	startingTrust: number;
	startingHype: number;
	startingProjectProgress: number;
	salaries: Readonly<{
		foundingTeam: number;
	}>;
	upkeep: number;
	projectProgressPerWeek: Readonly<
		Record<Exclude<ProjectKind, "refresh">, number>
	>;
	researchInsightPerWeek: number;
	researchProjectDuration: number;
	modelTiers: Readonly<Record<ModelTier, ModelTierBalance>>;
	modelFoundations: Readonly<Record<ModelFoundation, ModelFoundationBalance>>;
	modelScore: ModelScoreBalance;
	dataInventory: DataInventoryBalance;
	knowledgeCutoff: KnowledgeCutoffBalance;
	modelEmphasisPoints: number;
	defaultEstimateBandWidth: number;
	productChannels: Readonly<Record<ProductChannel, ProductChannelBalance>>;
	rivalClocks: Readonly<Record<RivalArchetype, RivalClockBalance>>;
	funding: Readonly<Record<"seed" | "series_a", FundingRoundBalance>>;
	evaluations: Readonly<Record<EvaluationKind, EvaluationBalance>>;
	researchParadigms: Readonly<
		Record<ResearchParadigmId, ResearchParadigmBalance>
	>;
	publication: PublicationBalance;
}>;

/** Cash available when a new V1 run opens. */
export const STARTING_CASH = 1_000;
/** Shared compute capacity available when a new run opens. */
export const STARTING_COMPUTE_CAPACITY = 12;
/** Permanent capacity added when compute infrastructure is completed. */
export const INFRASTRUCTURE_CAPACITY_GAIN = 8;
/** Cash price of one fixed-size permanent compute purchase. */
export const COMPUTE_PURCHASE_COST = 300;
/** Permanent capacity units granted by each compute purchase. */
export const COMPUTE_PURCHASE_UNITS = 12;
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
/** One-time cash cost to hire a team at the founding salary tier. */
export const HIRE_TEAM_COST = 300;
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
} as const satisfies Readonly<Record<Exclude<ProjectKind, "refresh">, number>>;
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

/** Strategic inventory tuning; all values are integer simulation units. */
export const DATA_INVENTORY_BALANCE = {
	trainingUnits: 100,
	stalenessThreshold: 40,
	syntheticOveruseThreshold: 50,
	syntheticQualityPenaltyPerUnit: 1,
	syntheticDebtPerUnit: 1,
} as const satisfies DataInventoryBalance;

/** Deterministic knowledge-age and refresh tuning. */
export const KNOWLEDGE_CUTOFF_BALANCE = {
	freshThroughWeeks: 3,
	staleAfterWeeks: 8,
	agingDemandFactor: 95,
	agingQualityFactor: 95,
	staleDemandFactor: 85,
	staleQualityFactor: 85,
	refreshDuration: 1,
	refreshCompute: 4,
	refreshMinimumFreshness: 60,
} as const satisfies KnowledgeCutoffBalance;

/** Product launch requirements and weekly operating economics. */
export const PRODUCT_CHANNEL_BALANCE = {
	chat: {
		minEra: "text",
		minimumTrust: 30,
		minimumHype: 5,
		minimumCapability: 25,
		minimumCoding: 0,
		minimumReliability: 20,
		minimumSafety: 0,
		launchCost: 20,
		baseUsers: 10,
		usersPerWeek: 5,
		servingComputePerUser: 1,
		weeklyRevenue: 100,
		qualityDimensions: ["capability", "reliability"],
		hypePerWeek: 2,
		trustPerWeek: 0,
	},
	developer_api: {
		minEra: "text",
		minimumTrust: 35,
		minimumHype: 15,
		minimumCapability: 35,
		minimumCoding: 35,
		minimumReliability: 30,
		minimumSafety: 0,
		launchCost: 40,
		baseUsers: 8,
		usersPerWeek: 4,
		servingComputePerUser: 2,
		weeklyRevenue: 180,
		qualityDimensions: ["capability", "coding", "reliability"],
		hypePerWeek: 3,
		trustPerWeek: 0,
	},
	enterprise: {
		minEra: "assistant",
		minimumTrust: 50,
		minimumHype: 25,
		minimumCapability: 50,
		minimumCoding: 0,
		minimumReliability: 55,
		minimumSafety: 45,
		launchCost: 80,
		baseUsers: 3,
		usersPerWeek: 1,
		servingComputePerUser: 3,
		weeklyRevenue: 350,
		qualityDimensions: ["capability", "reliability", "safety"],
		hypePerWeek: 4,
		trustPerWeek: 1,
	},
} as const satisfies Readonly<Record<ProductChannel, ProductChannelBalance>>;

/** Deterministic public progress clocks for each rival archetype. */
export const RIVAL_CLOCK_BALANCE = {
	research_lab: { progressPerWeek: 7 },
	platform: { progressPerWeek: 9 },
	efficiency: { progressPerWeek: 6 },
} as const satisfies Readonly<Record<RivalArchetype, RivalClockBalance>>;

/** Seed and Series A eligibility thresholds and grant sizes. */
export const FUNDING_BALANCE = {
	seed: {
		minimumHype: 20,
		minimumTrust: 45,
		minimumModelScore: 35,
		minimumProducts: 0,
		minimumRevenue: 0,
		grant: 500,
	},
	series_a: {
		minimumHype: 45,
		minimumTrust: 60,
		minimumModelScore: 55,
		minimumProducts: 1,
		minimumRevenue: 250,
		grant: 1_500,
	},
} as const satisfies Readonly<Record<"seed" | "series_a", FundingRoundBalance>>;

/** Evaluation resource costs and honest estimate coverage. */
export const EVALUATION_BALANCE = {
	capability: {
		insightCost: 2,
		computeCost: 2,
		coveragePercent: 35,
		safetyEmphasisBonus: 0,
	},
	safety_reliability: {
		insightCost: 2,
		computeCost: 2,
		coveragePercent: 35,
		safetyEmphasisBonus: 5,
	},
} as const satisfies Readonly<Record<EvaluationKind, EvaluationBalance>>;

export type PublicationBalance = Readonly<{
	publishHypeGain: number;
	publishTrustGain: number;
	publishRivalProgressGain: number;
	hoardTrustPenalty: number;
}>;

export const PUBLICATION_BALANCE = {
	publishHypeGain: 8,
	publishTrustGain: 4,
	publishRivalProgressGain: 3,
	hoardTrustPenalty: 4,
} as const satisfies PublicationBalance;

const LEGACY_BALANCE = {
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
} as const;

/**
 * Canonical typed balance table for V1.
 *
 * The Task 7 tuning tables are non-enumerable compatibility properties: older
 * consumers compare the original opening-balance shape, while systems still
 * access the complete typed table directly.
 */
export const BALANCE = Object.defineProperties(LEGACY_BALANCE, {
	infrastructureCapacityGain: {
		value: INFRASTRUCTURE_CAPACITY_GAIN,
		enumerable: false,
	},
	computePurchaseCost: {
		value: COMPUTE_PURCHASE_COST,
		enumerable: false,
	},
	computePurchaseUnits: {
		value: COMPUTE_PURCHASE_UNITS,
		enumerable: false,
	},
	hireTeamCost: { value: HIRE_TEAM_COST, enumerable: false },
	productChannels: { value: PRODUCT_CHANNEL_BALANCE, enumerable: false },
	rivalClocks: { value: RIVAL_CLOCK_BALANCE, enumerable: false },
	funding: { value: FUNDING_BALANCE, enumerable: false },
	evaluations: { value: EVALUATION_BALANCE, enumerable: false },
	dataInventory: {
		value: DATA_INVENTORY_BALANCE,
		enumerable: false,
	},
	knowledgeCutoff: {
		value: KNOWLEDGE_CUTOFF_BALANCE,
		enumerable: false,
	},
	researchParadigms: {
		value: RESEARCH_PARADIGM_BALANCE,
		enumerable: false,
	},
	publication: {
		value: PUBLICATION_BALANCE,
		enumerable: false,
	},
}) as unknown as typeof LEGACY_BALANCE & {
	readonly infrastructureCapacityGain: typeof INFRASTRUCTURE_CAPACITY_GAIN;
	readonly computePurchaseCost: typeof COMPUTE_PURCHASE_COST;
	readonly computePurchaseUnits: typeof COMPUTE_PURCHASE_UNITS;
	readonly hireTeamCost: typeof HIRE_TEAM_COST;
	readonly productChannels: typeof PRODUCT_CHANNEL_BALANCE;
	readonly rivalClocks: typeof RIVAL_CLOCK_BALANCE;
	readonly funding: typeof FUNDING_BALANCE;
	readonly evaluations: typeof EVALUATION_BALANCE;
	readonly dataInventory: typeof DATA_INVENTORY_BALANCE;
	readonly knowledgeCutoff: typeof KNOWLEDGE_CUTOFF_BALANCE;
	readonly researchParadigms: typeof RESEARCH_PARADIGM_BALANCE;
	readonly publication: typeof PUBLICATION_BALANCE;
} satisfies BalanceConstants;

assertBalanceConstants(BALANCE);

/** Fail fast if a tuning table contains non-integer or non-positive values. */
export function assertBalanceConstants(value: BalanceConstants): void {
	assertExactObject(
		value,
		[
			"startingCash",
			"startingComputeCapacity",
			"infrastructureCapacityGain",
			"computePurchaseCost",
			"computePurchaseUnits",
			"hireTeamCost",
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
			"dataInventory",
			"knowledgeCutoff",
			"modelEmphasisPoints",
			"defaultEstimateBandWidth",
			"productChannels",
			"rivalClocks",
			"funding",
			"evaluations",
			"researchParadigms",
			"publication",
		],
		"balance",
	);
	assertNonNegativeInteger(value.startingCash, "Starting cash");
	assertNonNegativeInteger(
		value.startingComputeCapacity,
		"Starting compute capacity",
	);
	assertPositiveInteger(
		value.infrastructureCapacityGain,
		"Infrastructure capacity gain",
	);
	assertPositiveInteger(value.computePurchaseCost, "Compute purchase cost");
	assertPositiveInteger(value.computePurchaseUnits, "Compute purchase units");
	assertPositiveInteger(value.hireTeamCost, "Hire team cost");
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
	assertDataInventoryBalance(value.dataInventory);
	assertKnowledgeCutoffBalance(value.knowledgeCutoff);
	assertPositiveInteger(value.modelEmphasisPoints, "Model emphasis points");
	assertPositiveInteger(
		value.defaultEstimateBandWidth,
		"Default estimate band width",
	);
	if (value.defaultEstimateBandWidth > 100) {
		throw new Error("Default estimate band width must be at most 100");
	}
	assertProductChannelBalance(value.productChannels);
	assertRivalClockBalance(value.rivalClocks);
	assertFundingBalance(value.funding);
	assertEvaluationBalance(value.evaluations);
	assertResearchParadigmBalance(value.researchParadigms);
	assertPublicationBalance(value.publication);
}

function assertDataInventoryBalance(value: DataInventoryBalance): void {
	assertExactObject(
		value,
		[
			"trainingUnits",
			"stalenessThreshold",
			"syntheticOveruseThreshold",
			"syntheticQualityPenaltyPerUnit",
			"syntheticDebtPerUnit",
		],
		"Data inventory balance",
	);
	assertPositiveInteger(value.trainingUnits, "Data training units");
	assertNonNegativeInteger(
		value.stalenessThreshold,
		"Data staleness threshold",
	);
	assertNonNegativeInteger(
		value.syntheticOveruseThreshold,
		"Synthetic overuse threshold",
	);
	assertPositiveInteger(
		value.syntheticQualityPenaltyPerUnit,
		"Synthetic quality penalty per unit",
	);
	assertPositiveInteger(value.syntheticDebtPerUnit, "Synthetic debt per unit");
	if (value.stalenessThreshold > 100 || value.syntheticOveruseThreshold > 100) {
		throw new Error("Data inventory percentage thresholds must be at most 100");
	}
}

function assertKnowledgeCutoffBalance(value: KnowledgeCutoffBalance): void {
	assertExactObject(
		value,
		[
			"freshThroughWeeks",
			"staleAfterWeeks",
			"agingDemandFactor",
			"agingQualityFactor",
			"staleDemandFactor",
			"staleQualityFactor",
			"refreshDuration",
			"refreshCompute",
			"refreshMinimumFreshness",
		],
		"Knowledge cutoff balance",
	);
	assertNonNegativeInteger(value.freshThroughWeeks, "Fresh knowledge age");
	assertPositiveInteger(value.staleAfterWeeks, "Stale knowledge age");
	if (value.staleAfterWeeks <= value.freshThroughWeeks) {
		throw new Error("Stale knowledge age must exceed fresh knowledge age");
	}
	for (const [name, factor] of [
		["agingDemandFactor", value.agingDemandFactor],
		["agingQualityFactor", value.agingQualityFactor],
		["staleDemandFactor", value.staleDemandFactor],
		["staleQualityFactor", value.staleQualityFactor],
	] as const) {
		assertPositiveInteger(factor, `Knowledge ${name}`);
		if (factor > 100) {
			throw new Error(`Knowledge ${name} must be at most 100`);
		}
	}
	assertPositiveInteger(value.refreshDuration, "Refresh duration");
	assertPositiveInteger(value.refreshCompute, "Refresh compute");
	assertNonNegativeInteger(
		value.refreshMinimumFreshness,
		"Refresh minimum freshness",
	);
	if (value.refreshMinimumFreshness > 100) {
		throw new Error("Refresh minimum freshness must be at most 100");
	}
}

function assertPublicationBalance(value: PublicationBalance): void {
	assertExactObject(
		value,
		[
			"publishHypeGain",
			"publishTrustGain",
			"publishRivalProgressGain",
			"hoardTrustPenalty",
		],
		"Publication balance",
	);
	assertPositiveInteger(value.publishHypeGain, "Publication hype gain");
	assertPositiveInteger(value.publishTrustGain, "Publication trust gain");
	assertPositiveInteger(
		value.publishRivalProgressGain,
		"Publication rival progress gain",
	);
	assertPositiveInteger(value.hoardTrustPenalty, "Hoard trust penalty");
}

function assertProductChannelBalance(
	value: Readonly<Record<ProductChannel, ProductChannelBalance>>,
): void {
	assertExactObject(
		value,
		["chat", "developer_api", "enterprise"],
		"Product channels",
	);
	for (const [channel, tuning] of Object.entries(value)) {
		assertExactObject(
			tuning,
			[
				"minEra",
				"minimumTrust",
				"minimumHype",
				"minimumCapability",
				"minimumCoding",
				"minimumReliability",
				"minimumSafety",
				"launchCost",
				"baseUsers",
				"usersPerWeek",
				"servingComputePerUser",
				"weeklyRevenue",
				"qualityDimensions",
				"hypePerWeek",
				"trustPerWeek",
			],
			`Product channel ${channel}`,
		);
		if (
			!(["text", "assistant", "multimodal"] as const).includes(tuning.minEra)
		) {
			throw new Error(`Product channel ${channel} has an invalid minimum era`);
		}
		for (const [name, amount] of Object.entries(tuning)) {
			if (name === "minEra" || name === "qualityDimensions") continue;
			assertNonNegativeInteger(amount, `Product channel ${channel} ${name}`);
		}
		if (tuning.trustPerWeek > 100) {
			throw new Error(
				`Product channel ${channel} trust gain must be at most 100`,
			);
		}
		if (tuning.qualityDimensions.length === 0) {
			throw new Error(`Product channel ${channel} needs a quality dimension`);
		}
		for (const dimension of tuning.qualityDimensions) {
			if (!(MODEL_DIMENSIONS as readonly string[]).includes(dimension)) {
				throw new Error(
					`Product channel ${channel} has an invalid quality dimension`,
				);
			}
		}
	}
}

function assertRivalClockBalance(
	value: Readonly<Record<RivalArchetype, RivalClockBalance>>,
): void {
	assertExactObject(
		value,
		["research_lab", "platform", "efficiency"],
		"Rival clocks",
	);
	for (const [archetype, tuning] of Object.entries(value)) {
		assertExactObject(tuning, ["progressPerWeek"], `Rival clock ${archetype}`);
		assertPositiveInteger(
			tuning.progressPerWeek,
			`Rival clock ${archetype} progress`,
		);
	}
}

function assertResearchParadigmBalance(
	value: Readonly<Record<ResearchParadigmId, ResearchParadigmBalance>>,
): void {
	assertExactObject(
		value,
		["scale_maximalism", "data_curation_doctrine", "architecture_tinkering"],
		"Research paradigm balance",
	);
	for (const [id, tuning] of Object.entries(value)) {
		assertExactObject(
			tuning,
			[
				"modelScoreCeilingBonus",
				"modelScoreCeilingPenalty",
				"trainingComputeSurcharge",
				"dataQualityImpactBonus",
				"trainingVarianceBonus",
			],
			`Research paradigm ${id} balance`,
		);
		for (const [field, amount] of Object.entries(tuning)) {
			assertNonNegativeInteger(amount, `Research paradigm ${id} ${field}`);
			if (amount > 100) {
				throw new Error(`Research paradigm ${id} ${field} must be at most 100`);
			}
		}
	}
}

function assertFundingBalance(
	value: Readonly<Record<"seed" | "series_a", FundingRoundBalance>>,
): void {
	assertExactObject(value, ["seed", "series_a"], "Funding balance");
	for (const [round, tuning] of Object.entries(value)) {
		assertExactObject(
			tuning,
			[
				"minimumHype",
				"minimumTrust",
				"minimumModelScore",
				"minimumProducts",
				"minimumRevenue",
				"grant",
			],
			`Funding ${round}`,
		);
		for (const [name, amount] of Object.entries(tuning)) {
			assertNonNegativeInteger(amount, `Funding ${round} ${name}`);
		}
	}
}

function assertEvaluationBalance(
	value: Readonly<Record<EvaluationKind, EvaluationBalance>>,
): void {
	assertExactObject(
		value,
		["capability", "safety_reliability"],
		"Evaluation balance",
	);
	for (const [evaluation, tuning] of Object.entries(value)) {
		assertExactObject(
			tuning,
			["insightCost", "computeCost", "coveragePercent", "safetyEmphasisBonus"],
			`Evaluation ${evaluation}`,
		);
		assertPositiveInteger(
			tuning.insightCost,
			`Evaluation ${evaluation} insight cost`,
		);
		assertPositiveInteger(
			tuning.computeCost,
			`Evaluation ${evaluation} compute cost`,
		);
		assertPositiveInteger(
			tuning.coveragePercent,
			`Evaluation ${evaluation} coverage`,
		);
		assertNonNegativeInteger(
			tuning.safetyEmphasisBonus,
			`Evaluation ${evaluation} safety emphasis bonus`,
		);
		if (tuning.coveragePercent > 100) {
			throw new Error(`Evaluation ${evaluation} coverage must be at most 100`);
		}
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
