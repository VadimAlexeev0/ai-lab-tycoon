import type { ResearchEra } from "./components/research.js";
import { MODEL_FAMILIES } from "./data/model-families.js";
import { RESEARCH_ERAS } from "./data/research.js";
import type { GameState } from "./state.js";

/**
 * A shipped proof is derived from retained launch evidence, never stored as a
 * separate mutable flag. The research set is supplied so weekly completion
 * can prove a family whose unlock completed during the same tick.
 */
export function hasShippedModelProof(
	state: Pick<GameState, "models" | "products">,
	era: ResearchEra,
	completedResearchNodeIds: ReadonlySet<string>,
): boolean {
	const family = modelFamilyForEra(era);
	return state.products.items.some(
		(product) =>
			(product.status === "operating" || product.status === "paused") &&
			state.models.items.some(
				(model) =>
					model.id === product.modelId &&
					model.status === "launched" &&
					model.family === family.id &&
					model.trueScores !== undefined &&
					model.estimates !== undefined &&
					completedResearchNodeIds.has(family.unlockedByResearchNodeId),
			),
	);
}

/**
 * Return whether an era has every shipped proof required to enter it. Text
 * has no prior era and therefore requires no proof; later eras require every
 * earlier family proof so the progression remains monotonic.
 */
export function hasRequiredShippedModelProof(
	state: Pick<GameState, "models" | "products">,
	era: ResearchEra,
	completedResearchNodeIds: ReadonlySet<string>,
): boolean {
	const eraIndex = RESEARCH_ERAS.indexOf(era);
	if (eraIndex < 0) {
		throw new Error(`Research era is not recognized: ${era}`);
	}
	return RESEARCH_ERAS.slice(0, eraIndex).every((proofEra) =>
		hasShippedModelProof(state, proofEra, completedResearchNodeIds),
	);
}

function modelFamilyForEra(era: ResearchEra) {
	const family = MODEL_FAMILIES.find((candidate) =>
		candidate.allowedEras.some((allowedEra) => allowedEra === era),
	);
	if (family === undefined) {
		throw new Error(`No model family is defined for the ${era} era`);
	}
	return family;
}
