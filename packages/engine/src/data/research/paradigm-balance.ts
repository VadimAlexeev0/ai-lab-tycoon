export type ResearchParadigmBalance = Readonly<{
	modelScoreCeilingBonus: number;
	modelScoreCeilingPenalty: number;
	trainingComputeSurcharge: number;
	dataQualityImpactBonus: number;
	trainingVarianceBonus: number;
}>;

export const RESEARCH_PARADIGM_BALANCE = {
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
} as const satisfies Readonly<
	Record<
		"scale_maximalism" | "data_curation_doctrine" | "architecture_tinkering",
		ResearchParadigmBalance
	>
>;
