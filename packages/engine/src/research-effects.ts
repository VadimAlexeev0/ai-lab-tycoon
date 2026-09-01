import type { ResearchState } from "./components/research.js";
import type { ModelDimension } from "./data/model-families.js";
import {
	assertResearchEffects,
	getResearchDefinition,
	getResearchParadigm,
	type ResearchEffect,
	type ResearchEvaluationKind,
} from "./data/research.js";

export type { ResearchEffect } from "./data/research.js";

export type ActiveResearchEffects = Readonly<{
	trainingComputeReduction: number;
	modelScoreBonus: Readonly<Record<ModelDimension, number>>;
	evaluationCoverageBonus: Readonly<Record<ResearchEvaluationKind, number>>;
	modelScoreCeilingBonus: number;
	trainingComputeSurcharge: number;
	dataQualityImpactBonus: number;
	trainingVarianceBonus: number;
}>;

/**
 * The no-op research projection used before any effect-bearing node completes.
 * It is intentionally explicit rather than a general modifier registry.
 */
export function createEmptyResearchEffects(): ActiveResearchEffects {
	return {
		trainingComputeReduction: 0,
		modelScoreBonus: {
			capability: 0,
			coding: 0,
			reliability: 0,
			safety: 0,
			efficiency: 0,
			multimodal: 0,
		},
		evaluationCoverageBonus: {
			capability: 0,
			safety_reliability: 0,
		},
		modelScoreCeilingBonus: 0,
		trainingComputeSurcharge: 0,
		dataQualityImpactBonus: 0,
		trainingVarianceBonus: 0,
	};
}

/**
 * Derive the active mechanics from completed node ids. Because this walks the
 * authoritative research component on every call, repeated weekly ticks and
 * save/load round-trips cannot duplicate an effect.
 */
export function deriveResearchEffects(
	research: Pick<ResearchState, "nodes"> &
		Partial<Pick<ResearchState, "paradigmId">>,
): ActiveResearchEffects {
	const empty = createEmptyResearchEffects();
	let trainingComputeReduction = empty.trainingComputeReduction;
	let modelScoreCeilingBonus = empty.modelScoreCeilingBonus;
	let trainingComputeSurcharge = empty.trainingComputeSurcharge;
	let dataQualityImpactBonus = empty.dataQualityImpactBonus;
	let trainingVarianceBonus = empty.trainingVarianceBonus;
	const modelScoreBonus = { ...empty.modelScoreBonus };
	const evaluationCoverageBonus = { ...empty.evaluationCoverageBonus };

	for (const node of research.nodes) {
		if (node.status !== "completed") continue;
		const definition = getResearchDefinition(node.id);
		if (definition === undefined) {
			throw new Error(`Unknown completed research node: ${node.id}`);
		}
		const effects = definition.effects ?? [];
		assertResearchEffects(effects, `Research definition ${node.id} effects`);
		for (const effect of effects) {
			switch (effect.kind) {
				case "training_compute_reduction":
					trainingComputeReduction = addAmount(
						trainingComputeReduction,
						effect.amount,
						`training compute reduction from ${node.id}`,
					);
					break;
				case "model_score_bonus":
					modelScoreBonus[effect.dimension] = addAmount(
						modelScoreBonus[effect.dimension],
						effect.amount,
						`model score bonus from ${node.id}`,
					);
					break;
				case "evaluation_coverage_bonus":
					evaluationCoverageBonus[effect.evaluation] = addAmount(
						evaluationCoverageBonus[effect.evaluation],
						effect.amount,
						`evaluation coverage bonus from ${node.id}`,
					);
					break;
			}
		}
	}

	if (research.paradigmId !== undefined && research.paradigmId !== null) {
		const paradigm = getResearchParadigm(research.paradigmId);
		for (const effect of paradigm.effects) {
			switch (effect.kind) {
				case "model_score_ceiling_bonus":
					modelScoreCeilingBonus = addAmount(
						modelScoreCeilingBonus,
						effect.amount,
						`model score ceiling bonus from ${paradigm.id}`,
					);
					break;
				case "model_score_ceiling_penalty":
					modelScoreCeilingBonus = addAmount(
						modelScoreCeilingBonus,
						-effect.amount,
						`model score ceiling penalty from ${paradigm.id}`,
					);
					break;
				case "training_compute_surcharge":
					trainingComputeSurcharge = addAmount(
						trainingComputeSurcharge,
						effect.amount,
						`training compute surcharge from ${paradigm.id}`,
					);
					break;
				case "data_quality_impact_bonus":
					dataQualityImpactBonus = addAmount(
						dataQualityImpactBonus,
						effect.amount,
						`data quality impact bonus from ${paradigm.id}`,
					);
					break;
				case "training_variance_bonus":
					trainingVarianceBonus = addAmount(
						trainingVarianceBonus,
						effect.amount,
						`training variance bonus from ${paradigm.id}`,
					);
					break;
			}
		}
	}

	return {
		trainingComputeReduction,
		modelScoreBonus,
		evaluationCoverageBonus,
		modelScoreCeilingBonus,
		trainingComputeSurcharge,
		dataQualityImpactBonus,
		trainingVarianceBonus,
	};
}

/** Return the immutable data effects attached to one catalog node. */
export function researchEffectsForNode(
	nodeId: string,
): readonly ResearchEffect[] {
	const definition = getResearchDefinition(nodeId);
	if (definition === undefined) {
		throw new Error(`Unknown research node: ${nodeId}`);
	}
	return (definition.effects ?? []).map((effect) => ({ ...effect }));
}

function addAmount(current: number, amount: number, path: string): number {
	const next = current + amount;
	if (!Number.isSafeInteger(next)) {
		throw new Error(`${path} exceeds the safe integer limit`);
	}
	return next;
}
