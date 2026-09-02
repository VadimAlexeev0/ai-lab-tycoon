import type { Model } from "./components/models.js";
import { BALANCE } from "./data/balance.js";

export type KnowledgeFreshnessStatus = "fresh" | "aging" | "stale";

export type KnowledgePressure = Readonly<{
	/** False for legacy/manual models that predate the cutoff contract. */
	recorded: boolean;
	status: KnowledgeFreshnessStatus;
	ageWeeks: number;
	knowledgeCutoff: number | null;
	knowledgeFreshness: number | null;
	demandFactor: number;
	qualityFactor: number;
}>;

/**
 * Derive live pressure from the in-game calendar and a model's recorded
 * cutoff. Age is current week minus cutoff, truncated at zero; no wall clock
 * or implicit refresh is involved.
 */
export function deriveKnowledgePressure(
	model: Pick<Model, "knowledgeCutoff" | "knowledgeFreshness">,
	currentWeek: number,
): KnowledgePressure {
	if (!Number.isSafeInteger(currentWeek) || currentWeek < 1) {
		throw new Error("Knowledge pressure week must be a positive safe integer");
	}
	const cutoff = model.knowledgeCutoff;
	const freshness = model.knowledgeFreshness;
	if (cutoff === undefined && freshness === undefined) {
		return {
			recorded: false,
			status: "fresh",
			ageWeeks: 0,
			knowledgeCutoff: null,
			knowledgeFreshness: null,
			demandFactor: 100,
			qualityFactor: 100,
		};
	}
	if (cutoff === undefined || freshness === undefined) {
		throw new Error("Knowledge cutoff and freshness must be recorded together");
	}
	const ageWeeks = Math.max(0, currentWeek - cutoff);
	if (ageWeeks >= BALANCE.knowledgeCutoff.staleAfterWeeks) {
		return {
			recorded: true,
			status: "stale",
			ageWeeks,
			knowledgeCutoff: cutoff,
			knowledgeFreshness: freshness,
			demandFactor: BALANCE.knowledgeCutoff.staleDemandFactor,
			qualityFactor: BALANCE.knowledgeCutoff.staleQualityFactor,
		};
	}
	if (ageWeeks > BALANCE.knowledgeCutoff.freshThroughWeeks) {
		return {
			recorded: true,
			status: "aging",
			ageWeeks,
			knowledgeCutoff: cutoff,
			knowledgeFreshness: freshness,
			demandFactor: BALANCE.knowledgeCutoff.agingDemandFactor,
			qualityFactor: BALANCE.knowledgeCutoff.agingQualityFactor,
		};
	}
	return {
		recorded: true,
		status: "fresh",
		ageWeeks,
		knowledgeCutoff: cutoff,
		knowledgeFreshness: freshness,
		demandFactor: 100,
		qualityFactor: 100,
	};
}

export const getKnowledgePressure = deriveKnowledgePressure;

export function getKnowledgeFreshnessStatus(
	model: Pick<Model, "knowledgeCutoff" | "knowledgeFreshness">,
	currentWeek: number,
): KnowledgeFreshnessStatus {
	return deriveKnowledgePressure(model, currentWeek).status;
}

export function applyKnowledgeQuality(
	baseQuality: number,
	pressure: Pick<KnowledgePressure, "qualityFactor">,
): number {
	return Math.trunc((baseQuality * pressure.qualityFactor) / 100);
}
