import type {
	IncidentResponse,
	IncidentType,
} from "../components/decisions.js";
import {
	assertEnum,
	assertExactObject,
	assertInteger,
	assertNonNegativeInteger,
	assertString,
} from "../validation.js";

export type IncidentCondition =
	| "serving_overload"
	| "api_overload"
	| "low_quality"
	| "training_overload"
	| "enterprise_risk"
	| "privacy_exposure";

export type IncidentTarget = "product" | "training_project" | "company";
export type IncidentMetric =
	| "servingDemand"
	| "effectiveQuality"
	| "trainingDemand"
	| "reliability"
	| "trust";
export type IncidentResolution =
	| "pause_product"
	| "cancel_training"
	| "disable_exposure";

export type IncidentEffect = Readonly<{
	cash: number;
	trust: number;
	hype: number;
}>;

export type IncidentResponseEffect = IncidentEffect &
	Readonly<{ resolution: IncidentResolution }>;

export type IncidentDefinition = Readonly<{
	type: IncidentType;
	riskName: string;
	condition: IncidentCondition;
	affectedEntity: IncidentTarget;
	metric: IncidentMetric;
	threshold: number;
	baseProbability: number;
	severity: IncidentEffect;
	responses: Readonly<Record<IncidentResponse, IncidentResponseEffect>>;
}>;

/** V1 incident content. Rules consume this table rather than embedding prose. */
export const INCIDENT_DEFINITIONS = [
	{
		type: "outage",
		riskName: "Unresolved Availability Risk",
		condition: "serving_overload",
		affectedEntity: "product",
		metric: "servingDemand",
		threshold: 12,
		baseProbability: 2,
		severity: { cash: 80, trust: 5, hype: 3 },
		responses: {
			repair: {
				cash: 60,
				trust: -2,
				hype: 0,
				resolution: "pause_product",
			},
			reduce_scope: {
				cash: 15,
				trust: -4,
				hype: -2,
				resolution: "pause_product",
			},
			disclose: {
				cash: 10,
				trust: 0,
				hype: -5,
				resolution: "pause_product",
			},
		},
	},
	{
		type: "latency_degradation",
		riskName: "Unresolved Latency Risk",
		condition: "api_overload",
		affectedEntity: "product",
		metric: "servingDemand",
		threshold: 12,
		baseProbability: 3,
		severity: { cash: 50, trust: 3, hype: 2 },
		responses: {
			repair: {
				cash: 45,
				trust: -1,
				hype: 0,
				resolution: "pause_product",
			},
			reduce_scope: {
				cash: 10,
				trust: -3,
				hype: -2,
				resolution: "pause_product",
			},
			disclose: {
				cash: 8,
				trust: 0,
				hype: -3,
				resolution: "pause_product",
			},
		},
	},
	{
		type: "quality_safety_scandal",
		riskName: "Unresolved Quality Risk",
		condition: "low_quality",
		affectedEntity: "product",
		metric: "effectiveQuality",
		threshold: 30,
		baseProbability: 4,
		severity: { cash: 40, trust: 12, hype: 8 },
		responses: {
			repair: {
				cash: 50,
				trust: -2,
				hype: -1,
				resolution: "pause_product",
			},
			reduce_scope: {
				cash: 15,
				trust: -7,
				hype: -4,
				resolution: "pause_product",
			},
			disclose: {
				cash: 10,
				trust: 2,
				hype: -6,
				resolution: "pause_product",
			},
		},
	},
	{
		type: "compute_cost_overrun",
		riskName: "Unresolved Compute Risk",
		condition: "training_overload",
		affectedEntity: "training_project",
		metric: "trainingDemand",
		threshold: 12,
		baseProbability: 3,
		severity: { cash: 100, trust: 0, hype: 1 },
		responses: {
			repair: {
				cash: 70,
				trust: 0,
				hype: 0,
				resolution: "cancel_training",
			},
			reduce_scope: {
				cash: 20,
				trust: 0,
				hype: -2,
				resolution: "cancel_training",
			},
			disclose: {
				cash: 15,
				trust: 0,
				hype: -3,
				resolution: "cancel_training",
			},
		},
	},
	{
		type: "enterprise_sla_breach",
		riskName: "Unresolved Enterprise Reliability Risk",
		condition: "enterprise_risk",
		affectedEntity: "product",
		// Enterprise SLA V1 is reliability-only; quality is not a second trigger.
		metric: "reliability",
		threshold: 35,
		baseProbability: 5,
		severity: { cash: 90, trust: 10, hype: 4 },
		responses: {
			repair: {
				cash: 80,
				trust: -2,
				hype: 0,
				resolution: "pause_product",
			},
			reduce_scope: {
				cash: 25,
				trust: -7,
				hype: -3,
				resolution: "pause_product",
			},
			disclose: {
				cash: 15,
				trust: 1,
				hype: -5,
				resolution: "pause_product",
			},
		},
	},
	{
		type: "data_privacy_incident",
		riskName: "Unresolved Privacy Concerns",
		condition: "privacy_exposure",
		affectedEntity: "company",
		metric: "trust",
		threshold: 10,
		baseProbability: 3,
		severity: { cash: 70, trust: 15, hype: 10 },
		responses: {
			repair: {
				cash: 65,
				trust: -5,
				hype: -2,
				resolution: "disable_exposure",
			},
			reduce_scope: {
				cash: 20,
				trust: -8,
				hype: -5,
				resolution: "disable_exposure",
			},
			disclose: {
				cash: 25,
				trust: 2,
				hype: -7,
				resolution: "disable_exposure",
			},
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

/** Return the single data definition that owns a predicate condition. */
export function incidentDefinitionForCondition(
	condition: IncidentCondition,
): IncidentDefinition {
	const definition = INCIDENT_DEFINITIONS.find(
		(item) => item.condition === condition,
	);
	if (definition === undefined) {
		throw new Error(`Unknown incident condition: ${condition}`);
	}
	return definition;
}

function assertIncidentDefinitions(
	definitions: readonly IncidentDefinition[],
): void {
	const types = new Set<string>();
	const conditions = new Set<string>();
	for (const definition of definitions) {
		assertExactObject(
			definition,
			[
				"type",
				"riskName",
				"condition",
				"affectedEntity",
				"metric",
				"threshold",
				"baseProbability",
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
		assertString(definition.riskName, "Incident risk name");
		if (definition.riskName.trim().length === 0) {
			throw new Error(
				`Incident ${definition.type} risk name must not be empty`,
			);
		}
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
		if (conditions.has(definition.condition)) {
			throw new Error("Incident conditions must be unique");
		}
		conditions.add(definition.condition);
		assertEnum(
			definition.affectedEntity,
			["product", "training_project", "company"],
			"Incident affected entity",
		);
		assertString(definition.metric, "Incident metric");
		assertEnum(
			definition.metric,
			[
				"servingDemand",
				"effectiveQuality",
				"trainingDemand",
				"reliability",
				"trust",
			],
			"Incident metric",
		);
		const expectedMetric = metricForCondition(definition.condition);
		if (definition.metric !== expectedMetric) {
			throw new Error(
				`Incident ${definition.type} metric must be ${expectedMetric}`,
			);
		}
		assertInteger(definition.threshold, "Incident threshold");
		assertNonNegativeInteger(
			definition.baseProbability,
			"Incident base probability",
		);
		if (definition.baseProbability > 100) {
			throw new Error("Incident probabilities must be between 0 and 100");
		}
		assertEffect(definition.severity, "Incident severity");
		for (const response of ["repair", "reduce_scope", "disclose"] as const) {
			assertExactObject(
				definition.responses[response],
				["cash", "trust", "hype", "resolution"],
				`Incident ${definition.type} ${response} response`,
			);
			assertEffect(definition.responses[response], "Incident response effect");
			assertEnum(
				definition.responses[response].resolution,
				["pause_product", "cancel_training", "disable_exposure"],
				"Incident response resolution",
			);
		}
	}
	if (definitions.length !== 6)
		throw new Error("V1 must define six incident types");
}

function metricForCondition(condition: IncidentCondition): IncidentMetric {
	switch (condition) {
		case "serving_overload":
		case "api_overload":
			return "servingDemand";
		case "low_quality":
			return "effectiveQuality";
		case "training_overload":
			return "trainingDemand";
		case "enterprise_risk":
			return "reliability";
		case "privacy_exposure":
			return "trust";
	}
}

function assertEffect(value: IncidentEffect, path: string): void {
	assertInteger(value.cash, `${path} cash`);
	assertInteger(value.trust, `${path} trust`);
	assertInteger(value.hype, `${path} hype`);
}
