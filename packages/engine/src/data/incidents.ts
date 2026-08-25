import type {
	IncidentResponse,
	IncidentType,
} from "../components/decisions.js";
import {
	assertEnum,
	assertExactObject,
	assertInteger,
	assertNonNegativeInteger,
} from "../validation.js";

export type IncidentCondition =
	| "serving_overload"
	| "api_overload"
	| "low_quality"
	| "training_overload"
	| "enterprise_risk"
	| "privacy_exposure";

export type IncidentEffect = Readonly<{
	cash: number;
	trust: number;
	hype: number;
}>;

export type IncidentDefinition = Readonly<{
	type: IncidentType;
	condition: IncidentCondition;
	baseProbability: number;
	forcedProbability: number;
	severity: IncidentEffect;
	responses: Readonly<Record<IncidentResponse, IncidentEffect>>;
}>;

/** V1 incident content. Rules consume this table rather than embedding prose. */
export const INCIDENT_DEFINITIONS = [
	{
		type: "outage",
		condition: "serving_overload",
		baseProbability: 2,
		forcedProbability: 100,
		severity: { cash: 80, trust: 5, hype: 3 },
		responses: {
			repair: { cash: 60, trust: -2, hype: 0 },
			reduce_scope: { cash: 15, trust: -4, hype: -2 },
			disclose: { cash: 10, trust: 0, hype: -5 },
		},
	},
	{
		type: "latency_degradation",
		condition: "api_overload",
		baseProbability: 3,
		forcedProbability: 100,
		severity: { cash: 50, trust: 3, hype: 2 },
		responses: {
			repair: { cash: 45, trust: -1, hype: 0 },
			reduce_scope: { cash: 10, trust: -3, hype: -2 },
			disclose: { cash: 8, trust: 0, hype: -3 },
		},
	},
	{
		type: "quality_safety_scandal",
		condition: "low_quality",
		baseProbability: 4,
		forcedProbability: 100,
		severity: { cash: 40, trust: 12, hype: 8 },
		responses: {
			repair: { cash: 50, trust: -2, hype: -1 },
			reduce_scope: { cash: 15, trust: -7, hype: -4 },
			disclose: { cash: 10, trust: 2, hype: -6 },
		},
	},
	{
		type: "compute_cost_overrun",
		condition: "training_overload",
		baseProbability: 3,
		forcedProbability: 100,
		severity: { cash: 100, trust: 0, hype: 1 },
		responses: {
			repair: { cash: 70, trust: 0, hype: 0 },
			reduce_scope: { cash: 20, trust: 0, hype: -2 },
			disclose: { cash: 15, trust: 0, hype: -3 },
		},
	},
	{
		type: "enterprise_sla_breach",
		condition: "enterprise_risk",
		baseProbability: 5,
		forcedProbability: 100,
		severity: { cash: 90, trust: 10, hype: 4 },
		responses: {
			repair: { cash: 80, trust: -2, hype: 0 },
			reduce_scope: { cash: 25, trust: -7, hype: -3 },
			disclose: { cash: 15, trust: 1, hype: -5 },
		},
	},
	{
		type: "data_privacy_incident",
		condition: "privacy_exposure",
		baseProbability: 3,
		forcedProbability: 100,
		severity: { cash: 70, trust: 15, hype: 10 },
		responses: {
			repair: { cash: 65, trust: -5, hype: -2 },
			reduce_scope: { cash: 20, trust: -8, hype: -5 },
			disclose: { cash: 25, trust: 2, hype: -7 },
		},
	},
] as const satisfies readonly IncidentDefinition[];

assertIncidentDefinitions(INCIDENT_DEFINITIONS);

export function incidentDefinition(type: IncidentType): IncidentDefinition {
	const definition = INCIDENT_DEFINITIONS.find((item) => item.type === type);
	if (definition === undefined)
		throw new Error(`Unknown incident type: ${type}`);
	return definition;
}

function assertIncidentDefinitions(
	definitions: readonly IncidentDefinition[],
): void {
	const types = new Set<string>();
	for (const definition of definitions) {
		assertExactObject(
			definition,
			[
				"type",
				"condition",
				"baseProbability",
				"forcedProbability",
				"severity",
				"responses",
			],
			"incident definition",
		);
		assertEnum(
			definition.type,
			[
				"outage",
				"latency_degradation",
				"quality_safety_scandal",
				"compute_cost_overrun",
				"enterprise_sla_breach",
				"data_privacy_incident",
			],
			"Incident type",
		);
		if (types.has(definition.type))
			throw new Error("Incident types must be unique");
		types.add(definition.type);
		assertEnum(
			definition.condition,
			[
				"serving_overload",
				"api_overload",
				"low_quality",
				"training_overload",
				"enterprise_risk",
				"privacy_exposure",
			],
			"Incident condition",
		);
		assertNonNegativeInteger(
			definition.baseProbability,
			"Incident base probability",
		);
		assertNonNegativeInteger(
			definition.forcedProbability,
			"Incident forced probability",
		);
		if (
			definition.baseProbability > 100 ||
			definition.forcedProbability > 100
		) {
			throw new Error("Incident probabilities must be between 0 and 100");
		}
		assertEffect(definition.severity, "Incident severity");
		for (const response of ["repair", "reduce_scope", "disclose"] as const) {
			assertExactObject(
				definition.responses[response],
				["cash", "trust", "hype"],
				`Incident ${definition.type} ${response} response`,
			);
			assertEffect(definition.responses[response], "Incident response effect");
		}
	}
	if (definitions.length !== 6)
		throw new Error("V1 must define six incident types");
}

function assertEffect(value: IncidentEffect, path: string): void {
	assertInteger(value.cash, `${path} cash`);
	assertInteger(value.trust, `${path} trust`);
	assertInteger(value.hype, `${path} hype`);
}
