import { describe, expect, it } from "vitest";
import {
	assertBalanceConstants,
	BALANCE,
	type BalanceConstants,
} from "./data/balance.js";

/**
 * Locks the complete V1 economy tables. These literals intentionally
 * duplicate the tuning tables: a test that recomputes expectations from the
 * same constants would silently pass after an accidental economy change. Any
 * retune must update both the table and this golden contract.
 */
const EXPECTED_ECONOMY: BalanceConstants = {
	startingCash: 1_000,
	startingComputeCapacity: 12,
	infrastructureCapacityGain: 8,
	computePurchaseCost: 300,
	computePurchaseUnits: 12,
	hireTeamCost: 300,
	startingInsight: 0,
	startingTrust: 60,
	startingHype: 10,
	startingProjectProgress: 0,
	salaries: { foundingTeam: 50 },
	upkeep: 25,
	projectProgressPerWeek: {
		research: 1,
		infrastructure: 1,
		model: 1,
		training: 1,
		evaluation: 1,
		product: 1,
	},
	researchInsightPerWeek: 1,
	researchProjectDuration: 1,
	modelTiers: {
		lean: { duration: 2, cost: 80, trainingCompute: 3, scoreCeiling: 72 },
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
	},
	modelFoundations: {
		fresh: {
			duration: 0,
			cost: 0,
			floorPercent: 0,
			debtRetentionPercent: 0,
			dataDebtRetentionPercent: 0,
			riskRetentionPercent: 0,
		},
		continued: {
			duration: 1,
			cost: 120,
			floorPercent: 60,
			debtRetentionPercent: 100,
			dataDebtRetentionPercent: 100,
			riskRetentionPercent: 100,
		},
		distilled: {
			duration: 2,
			cost: 180,
			floorPercent: 30,
			debtRetentionPercent: 50,
			dataDebtRetentionPercent: 50,
			riskRetentionPercent: 50,
		},
	},
	modelScore: {
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
	},
	dataInventory: {
		trainingUnits: 100,
		stalenessThreshold: 40,
		syntheticOveruseThreshold: 50,
		syntheticQualityPenaltyPerUnit: 1,
		syntheticDebtPerUnit: 1,
	},
	knowledgeCutoff: {
		freshThroughWeeks: 3,
		staleAfterWeeks: 8,
		agingDemandFactor: 95,
		agingQualityFactor: 95,
		staleDemandFactor: 85,
		staleQualityFactor: 85,
		refreshDuration: 1,
		refreshCompute: 4,
		refreshMinimumFreshness: 60,
	},
	modelEmphasisPoints: 6,
	defaultEstimateBandWidth: 20,
	productChannels: {
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
	},
	rivalClocks: {
		research_lab: { progressPerWeek: 7 },
		platform: { progressPerWeek: 9 },
		efficiency: { progressPerWeek: 6 },
	},
	rivalStrategy: {
		publicationPressure: 1,
		launchPressure: 1,
	},
	funding: {
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
	},
	evaluations: {
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
	},
	researchParadigms: {
		scale_maximalism: {
			modelScoreCeilingBonus: 8,
			modelScoreCeilingPenalty: 0,
			trainingComputeSurcharge: 2,
			dataQualityImpactBonus: 0,
			trainingVarianceBonus: 0,
		},
		data_curation_doctrine: {
			modelScoreCeilingBonus: 0,
			modelScoreCeilingPenalty: 4,
			trainingComputeSurcharge: 0,
			dataQualityImpactBonus: 20,
			trainingVarianceBonus: 0,
		},
		architecture_tinkering: {
			modelScoreCeilingBonus: 4,
			modelScoreCeilingPenalty: 0,
			trainingComputeSurcharge: 0,
			dataQualityImpactBonus: 0,
			trainingVarianceBonus: 3,
		},
	},
	publication: {
		publishHypeGain: 8,
		publishTrustGain: 4,
		publishRivalProgressGain: 3,
		hoardTrustPenalty: 4,
	},
	riskMemory: {
		recurrenceProbabilityBonus: 10,
		recurrenceSeverityIncreasePercent: 25,
		crisisRecurrenceThreshold: 2,
		responses: {
			repair: { unresolved: true, severityReductionPercent: 10 },
			reduce_scope: { unresolved: false, severityReductionPercent: 60 },
			disclose: { unresolved: false, severityReductionPercent: 100 },
		},
		crisisChoices: {
			investigate: {
				cashCost: 100,
				trustChange: 3,
				severityReductionPercent: 100,
			},
			contain: {
				cashCost: 35,
				trustChange: 0,
				severityReductionPercent: 60,
			},
			disclose: {
				cashCost: 20,
				trustChange: 2,
				severityReductionPercent: 75,
			},
		},
	},
};

describe("V1 economy constants", () => {
	it("locks the exact Channel and Rival tuning tables", () => {
		expect(BALANCE.productChannels).toEqual(EXPECTED_ECONOMY.productChannels);
		expect(BALANCE.rivalClocks).toEqual(EXPECTED_ECONOMY.rivalClocks);
	});

	it("locks the exact funding and evaluation tables", () => {
		expect(BALANCE.funding).toEqual(EXPECTED_ECONOMY.funding);
		expect(BALANCE.evaluations).toEqual(EXPECTED_ECONOMY.evaluations);
	});

	it("locks the publication decision balance", () => {
		expect(BALANCE.publication).toEqual(EXPECTED_ECONOMY.publication);
	});

	it("pins capacity progression and two-purchase lean-training headroom", () => {
		expect(BALANCE.infrastructureCapacityGain).toBe(8);
		expect(BALANCE.computePurchaseCost).toBe(300);
		expect(BALANCE.computePurchaseUnits).toBe(12);
		expect(BALANCE.hireTeamCost).toBe(300);

		const afterFirstInfrastructure =
			BALANCE.startingComputeCapacity + BALANCE.infrastructureCapacityGain;
		const afterSecondInfrastructure =
			afterFirstInfrastructure + BALANCE.infrastructureCapacityGain;
		const afterTwoPurchases =
			afterFirstInfrastructure + 2 * BALANCE.computePurchaseUnits;

		expect(afterFirstInfrastructure).toBe(20);
		expect(afterSecondInfrastructure).toBe(28);
		expect(afterTwoPurchases).toBe(44);
		expect(afterTwoPurchases).toBeGreaterThanOrEqual(
			40 + BALANCE.modelTiers.lean.trainingCompute,
		);
	});

	it("locks the exact score-generation and tier tables", () => {
		expect(BALANCE.modelScore).toEqual(EXPECTED_ECONOMY.modelScore);
		expect(BALANCE.modelTiers).toEqual(EXPECTED_ECONOMY.modelTiers);
		expect(BALANCE.modelFoundations).toEqual(EXPECTED_ECONOMY.modelFoundations);
	});

	it("keeps the legacy opening shape enumerable and complete", () => {
		expect({ ...BALANCE }).toEqual({
			startingCash: 1_000,
			startingComputeCapacity: 12,
			startingInsight: 0,
			startingTrust: 60,
			startingHype: 10,
			startingProjectProgress: 0,
			salaries: { foundingTeam: 50 },
			upkeep: 25,
			projectProgressPerWeek: {
				research: 1,
				infrastructure: 1,
				model: 1,
				training: 1,
				evaluation: 1,
				product: 1,
			},
			researchInsightPerWeek: 1,
			researchProjectDuration: 1,
			modelTiers: EXPECTED_ECONOMY.modelTiers,
			modelFoundations: EXPECTED_ECONOMY.modelFoundations,
			modelScore: EXPECTED_ECONOMY.modelScore,
			modelEmphasisPoints: 6,
			defaultEstimateBandWidth: 20,
		});
	});

	it("passes the fail-fast balance validation on the canonical table", () => {
		expect(() => assertBalanceConstants(BALANCE)).not.toThrow();
	});

	it("rejects fractional or out-of-range tuning values at validation time", () => {
		type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
		const clone = (): Mutable<BalanceConstants> =>
			structuredClone(EXPECTED_ECONOMY) as unknown as Mutable<BalanceConstants>;

		const fractional = clone();
		fractional.upkeep = 25.5;
		expect(() => assertBalanceConstants(fractional)).toThrow(/integer/i);

		const zeroSalary = clone();
		zeroSalary.salaries = { foundingTeam: 0 };
		expect(() => assertBalanceConstants(zeroSalary)).toThrow(
			/positive|salary/i,
		);

		const ceilingTooHigh = clone();
		ceilingTooHigh.modelTiers = {
			...ceilingTooHigh.modelTiers,
			aggressive: {
				...ceilingTooHigh.modelTiers.aggressive,
				scoreCeiling: 101,
			},
		};
		expect(() => assertBalanceConstants(ceilingTooHigh)).toThrow(/ceiling/i);

		const floorTooHigh = clone();
		floorTooHigh.modelFoundations = {
			...floorTooHigh.modelFoundations,
			continued: {
				...floorTooHigh.modelFoundations.continued,
				floorPercent: 101,
			},
		};
		expect(() => assertBalanceConstants(floorTooHigh)).toThrow(
			/floor percent/i,
		);

		const negativeCost = clone();
		negativeCost.modelFoundations = {
			...negativeCost.modelFoundations,
			fresh: { ...negativeCost.modelFoundations.fresh, cost: -1 },
		};
		expect(() => assertBalanceConstants(negativeCost)).toThrow(
			/non-negative|integer/i,
		);
	});
});
