import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertPositiveInteger,
	assertString,
} from "../../validation.js";
import { RESEARCH_PARADIGM_BALANCE } from "./paradigm-balance.js";

// Era 1 only: the catalog must not grow past this ceiling without an explicit contract change.
// ponytail: keep Era 2+ paradigms out of this catalog until their decision contract exists.

export type ResearchParadigmId =
	| "scale_maximalism"
	| "data_curation_doctrine"
	| "architecture_tinkering";

export type ResearchParadigmEffect =
	| {
			readonly kind: "model_score_ceiling_bonus";
			readonly amount: number;
			readonly polarity: "benefit";
	  }
	| {
			readonly kind: "model_score_ceiling_penalty";
			readonly amount: number;
			readonly polarity: "liability";
	  }
	| {
			readonly kind: "training_compute_surcharge";
			readonly amount: number;
			readonly polarity: "liability";
	  }
	| {
			readonly kind: "data_quality_impact_bonus";
			readonly amount: number;
			readonly polarity: "benefit";
	  }
	| {
			readonly kind: "training_variance_bonus";
			readonly amount: number;
			readonly polarity: "liability";
	  };

export type ResearchParadigmDefinition = {
	readonly id: ResearchParadigmId;
	readonly label: string;
	readonly description: string;
	readonly effects: readonly ResearchParadigmEffect[];
};

export const PARADIGM_IDS = [
	"scale_maximalism",
	"data_curation_doctrine",
	"architecture_tinkering",
] as const satisfies readonly ResearchParadigmId[];

export const RESEARCH_PARADIGMS = [
	{
		id: "scale_maximalism",
		label: "Scale Maximalism",
		description:
			"Pursue larger training runs and a higher capability ceiling, accepting sharp compute pressure.",
		effects: [
			{
				kind: "model_score_ceiling_bonus",
				amount:
					RESEARCH_PARADIGM_BALANCE.scale_maximalism.modelScoreCeilingBonus,
				polarity: "benefit",
			},
			{
				kind: "training_compute_surcharge",
				amount:
					RESEARCH_PARADIGM_BALANCE.scale_maximalism.trainingComputeSurcharge,
				polarity: "liability",
			},
		],
	},
	{
		id: "data_curation_doctrine",
		label: "Data Curation Doctrine",
		description:
			"Make carefully curated data do more of the work, while accepting a lower size-only ceiling.",
		effects: [
			{
				kind: "data_quality_impact_bonus",
				amount:
					RESEARCH_PARADIGM_BALANCE.data_curation_doctrine
						.dataQualityImpactBonus,
				polarity: "benefit",
			},
			{
				kind: "model_score_ceiling_penalty",
				amount:
					RESEARCH_PARADIGM_BALANCE.data_curation_doctrine
						.modelScoreCeilingPenalty,
				polarity: "liability",
			},
		],
	},
	{
		id: "architecture_tinkering",
		label: "Architecture Tinkering",
		description:
			"Chase unusual breakthroughs through bolder architecture changes, with less predictable outcomes.",
		effects: [
			{
				kind: "model_score_ceiling_bonus",
				amount:
					RESEARCH_PARADIGM_BALANCE.architecture_tinkering
						.modelScoreCeilingBonus,
				polarity: "benefit",
			},
			{
				kind: "training_variance_bonus",
				amount:
					RESEARCH_PARADIGM_BALANCE.architecture_tinkering
						.trainingVarianceBonus,
				polarity: "liability",
			},
		],
	},
] as const satisfies readonly ResearchParadigmDefinition[];

const PARADIGM_ID_SET: ReadonlySet<string> = new Set(PARADIGM_IDS);
const PARADIGM_EFFECT_KINDS = [
	"model_score_ceiling_bonus",
	"model_score_ceiling_penalty",
	"training_compute_surcharge",
	"data_quality_impact_bonus",
	"training_variance_bonus",
] as const;
const PARADIGM_POLARITIES = ["benefit", "liability"] as const;

export function isResearchParadigmId(
	value: unknown,
): value is ResearchParadigmId {
	return typeof value === "string" && PARADIGM_ID_SET.has(value);
}

export function getResearchParadigm(
	id: ResearchParadigmId,
): ResearchParadigmDefinition {
	const definition = RESEARCH_PARADIGMS.find((item) => item.id === id);
	if (definition === undefined) {
		throw new Error(`Unknown research paradigm: ${id}`);
	}
	return definition;
}

export function assertResearchParadigmEffect(
	value: unknown,
): asserts value is ResearchParadigmEffect {
	assertExactObject(
		value,
		["kind", "amount", "polarity"],
		"research paradigm effect",
	);
	assertEnum(value.kind, PARADIGM_EFFECT_KINDS, "Paradigm effect kind");
	assertPositiveInteger(value.amount, "Paradigm effect amount");
	if (value.amount > 100) {
		throw new Error("Paradigm effect amount must be at most 100");
	}
	assertEnum(value.polarity, PARADIGM_POLARITIES, "Paradigm effect polarity");
	const expectedPolarity =
		value.kind === "model_score_ceiling_bonus" ||
		value.kind === "data_quality_impact_bonus"
			? "benefit"
			: "liability";
	if (value.polarity !== expectedPolarity) {
		throw new Error(
			`Paradigm effect ${value.kind} must be a ${expectedPolarity}`,
		);
	}
}

export function assertResearchParadigmDefinition(
	value: unknown,
): asserts value is ResearchParadigmDefinition {
	assertExactObject(
		value,
		["id", "label", "description", "effects"],
		"research paradigm definition",
	);
	assertIdentifier(value.id, "Research paradigm id");
	if (!isResearchParadigmId(value.id)) {
		throw new Error(`Unknown research paradigm id: ${value.id}`);
	}
	assertString(value.label, "Research paradigm label");
	assertString(value.description, "Research paradigm description");
	assertArray(value.effects, "Research paradigm effects");
	if (value.effects.length < 2) {
		throw new Error(
			`Research paradigm ${value.id} must have a benefit and liability effect`,
		);
	}
	const polarities = new Set<string>();
	for (const effect of value.effects) {
		assertResearchParadigmEffect(effect);
		polarities.add(effect.polarity);
	}
	if (!polarities.has("benefit") || !polarities.has("liability")) {
		throw new Error(
			`Research paradigm ${value.id} must include both benefit and liability effects`,
		);
	}
}

export function assertResearchParadigms(value: unknown): void {
	assertArray(value, "research paradigms");
	if (value.length !== PARADIGM_IDS.length) {
		throw new Error(
			`Research paradigm catalog must contain exactly ${PARADIGM_IDS.length} choices`,
		);
	}
	const ids = new Set<string>();
	for (const definition of value) {
		assertResearchParadigmDefinition(definition);
		if (ids.has(definition.id)) {
			throw new Error(`Duplicate research paradigm id: ${definition.id}`);
		}
		ids.add(definition.id);
	}
	for (const id of PARADIGM_IDS) {
		if (!ids.has(id)) {
			throw new Error(`Research paradigm catalog is missing: ${id}`);
		}
	}
}

assertResearchParadigms(RESEARCH_PARADIGMS);
