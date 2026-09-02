import type { IncidentCondition } from "../data/incidents.js";
import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertNullableString,
	assertObject,
	assertPositiveInteger,
	assertString,
} from "../validation.js";
import type { CrisisChoice, IncidentType } from "./decisions.js";

export type RiskMemory = {
	id: string;
	name: string;
	incident: IncidentType;
	condition: IncidentCondition;
	severity: number;
	affectedProductId: string | null;
	affectedModelId: string | null;
	unresolved: boolean;
	recurrenceCount: number;
	unresolvedRecurrenceCount: number;
	lastOccurrenceWeek: number;
};

export type RiskCrisisKind = "risk_escalation";
export type RiskCrisisStatus = "open" | "resolved";

export type RiskCrisis = {
	id: string;
	kind: RiskCrisisKind;
	riskMemoryId: string;
	status: RiskCrisisStatus;
	openedWeek: number;
	resolvedWeek: number | null;
	choice: CrisisChoice | null;
};

export type RiskState = {
	memories: RiskMemory[];
	crises: RiskCrisis[];
};

export type RiskMemoryState = RiskState;
export type Crisis = RiskCrisis;

export type RiskStateValidationOptions = Readonly<{
	currentWeek?: number;
}>;

export const RISK_MEMORY_MAX_SEVERITY = 1_000;
export const RISK_MEMORY_RECURRENCE_ARITHMETIC_CAP = 100;

const INCIDENT_CONDITIONS: Readonly<Record<IncidentType, IncidentCondition>> = {
	outage: "serving_overload",
	latency_degradation: "api_overload",
	quality_safety_scandal: "low_quality",
	compute_cost_overrun: "training_overload",
	enterprise_sla_breach: "enterprise_risk",
	data_privacy_incident: "privacy_exposure",
};
const INCIDENT_TYPES = Object.keys(INCIDENT_CONDITIONS) as IncidentType[];
const INCIDENT_CONDITION_VALUES = Object.values(
	INCIDENT_CONDITIONS,
) as IncidentCondition[];
const CRISIS_KINDS = ["risk_escalation"] as const;
const CRISIS_STATUSES = ["open", "resolved"] as const;
const CRISIS_CHOICES = ["investigate", "contain", "disclose"] as const;

export function createRiskState(
	memories: readonly RiskMemory[] = [],
	crises: readonly RiskCrisis[] = [],
): RiskState {
	return {
		memories: memories.map(cloneRiskMemory),
		crises: crises.map(cloneRiskCrisis),
	};
}

export const createRiskMemoryState = createRiskState;

/** Clone a risk component before a system applies a state transition. */
export function cloneRiskState(state: RiskState): RiskState {
	return createRiskState(state.memories, state.crises);
}

export const cloneRiskMemoryState = cloneRiskState;

export function cloneRiskMemory(memory: RiskMemory): RiskMemory {
	return { ...memory };
}

export function cloneRiskCrisis(crisis: RiskCrisis): RiskCrisis {
	return { ...crisis };
}

/** Validate the exact persisted risk-memory and crisis-chain shape. */
export function assertRiskState(
	value: unknown,
	options: RiskStateValidationOptions = {},
): asserts value is RiskState {
	assertExactObject(value, ["memories", "crises"], "risk");
	assertArray(value.memories, "Risk memories");
	assertArray(value.crises, "Risk crises");
	if (options.currentWeek !== undefined) {
		assertPositiveInteger(options.currentWeek, "Risk validation current week");
	}

	const memoriesById = new Set<string>();
	const memorySignatures = new Set<string>();
	for (const item of value.memories) {
		assertObject(item, "risk memory");
		assertRiskMemory(item, options.currentWeek);
		const memory = item as unknown as RiskMemory;
		if (memoriesById.has(memory.id)) {
			throw new Error(`Duplicate risk memory id: ${memory.id}`);
		}
		memoriesById.add(memory.id);
		const signature = [
			memory.incident,
			memory.condition,
			memory.affectedProductId ?? "company",
			memory.affectedModelId ?? "company",
		].join("|");
		if (memorySignatures.has(signature)) {
			throw new Error(`Duplicate risk memory source: ${signature}`);
		}
		memorySignatures.add(signature);
	}

	const crisesById = new Set<string>();
	const crisisMemoryIds = new Set<string>();
	for (const item of value.crises) {
		assertObject(item, "risk crisis");
		assertRiskCrisis(item, options.currentWeek);
		const crisis = item as unknown as RiskCrisis;
		if (crisesById.has(crisis.id)) {
			throw new Error(`Duplicate risk crisis id: ${crisis.id}`);
		}
		crisesById.add(crisis.id);
		if (crisisMemoryIds.has(crisis.riskMemoryId)) {
			throw new Error(
				`Duplicate risk crisis for memory: ${crisis.riskMemoryId}`,
			);
		}
		crisisMemoryIds.add(crisis.riskMemoryId);
		if (!memoriesById.has(crisis.riskMemoryId)) {
			throw new Error(
				`Risk crisis ${crisis.id} references unknown memory ${crisis.riskMemoryId}`,
			);
		}
		const memory = value.memories.find(
			(candidate) =>
				(candidate as Record<string, unknown>).id === crisis.riskMemoryId,
		) as unknown as RiskMemory | undefined;
		if (
			crisis.status === "open" &&
			memory !== undefined &&
			memory.lastOccurrenceWeek >= crisis.openedWeek
		) {
			throw new Error(
				`Open risk crisis ${crisis.id} must open after its triggering occurrence`,
			);
		}
	}
}

/**
 * The component is deliberately persistent but not yet coupled to lineage.
 * ponytail: successor inheritance/reduction belongs to Wave 4; this slice keeps
 * the authoritative memory intact so a later lineage system can consume it.
 */
export const assertRiskMemoryState = assertRiskState;

function assertRiskMemory(
	value: Record<string, unknown>,
	currentWeek?: number,
): void {
	assertExactObject(
		value,
		[
			"id",
			"name",
			"incident",
			"condition",
			"severity",
			"affectedProductId",
			"affectedModelId",
			"unresolved",
			"recurrenceCount",
			"unresolvedRecurrenceCount",
			"lastOccurrenceWeek",
		],
		"risk memory",
	);
	assertIdentifier(value.id, "Risk memory id");
	assertString(value.name, `Risk memory ${value.id} name`);
	if (value.name.trim().length === 0) {
		throw new Error(`Risk memory ${value.id} name must not be empty`);
	}
	assertEnum(value.incident, INCIDENT_TYPES, "Risk memory incident");
	assertEnum(
		value.condition,
		INCIDENT_CONDITION_VALUES,
		"Risk memory condition",
	);
	if (INCIDENT_CONDITIONS[value.incident] !== value.condition) {
		throw new Error(
			`Risk memory ${value.id} condition does not match its incident`,
		);
	}
	assertNonNegativeInteger(value.severity, `Risk memory ${value.id} severity`);
	if (value.severity > RISK_MEMORY_MAX_SEVERITY) {
		throw new Error(
			`Risk memory ${value.id} severity must be at most ${RISK_MEMORY_MAX_SEVERITY}`,
		);
	}
	assertNullableString(
		value.affectedProductId,
		`Risk memory ${value.id} product id`,
	);
	if (value.affectedProductId !== null) {
		assertIdentifier(
			value.affectedProductId,
			`Risk memory ${value.id} product id`,
		);
	}
	assertNullableString(
		value.affectedModelId,
		`Risk memory ${value.id} model id`,
	);
	if (value.affectedModelId !== null) {
		assertIdentifier(value.affectedModelId, `Risk memory ${value.id} model id`);
	}
	assertBoolean(value.unresolved, `Risk memory ${value.id} unresolved`);
	assertPositiveInteger(
		value.recurrenceCount,
		`Risk memory ${value.id} recurrence count`,
	);
	assertNonNegativeInteger(
		value.unresolvedRecurrenceCount,
		`Risk memory ${value.id} unresolved recurrence count`,
	);
	if (value.unresolvedRecurrenceCount > value.recurrenceCount) {
		throw new Error(
			`Risk memory ${value.id} unresolved recurrences cannot exceed total recurrences`,
		);
	}
	if (!value.unresolved && value.unresolvedRecurrenceCount !== 0) {
		throw new Error(
			`Resolved risk memory ${value.id} cannot retain an unresolved streak`,
		);
	}
	if (value.unresolved && value.unresolvedRecurrenceCount < 1) {
		throw new Error(
			`Unresolved risk memory ${value.id} must have an unresolved recurrence`,
		);
	}
	assertPositiveInteger(
		value.lastOccurrenceWeek,
		`Risk memory ${value.id} last occurrence week`,
	);
	if (currentWeek !== undefined && value.lastOccurrenceWeek > currentWeek) {
		throw new Error(
			`Risk memory ${value.id} last occurrence cannot be from a future week`,
		);
	}
}

function assertRiskCrisis(
	value: Record<string, unknown>,
	currentWeek?: number,
): void {
	assertExactObject(
		value,
		[
			"id",
			"kind",
			"riskMemoryId",
			"status",
			"openedWeek",
			"resolvedWeek",
			"choice",
		],
		"risk crisis",
	);
	assertIdentifier(value.id, "Risk crisis id");
	assertEnum(value.kind, CRISIS_KINDS, "Risk crisis kind");
	assertIdentifier(value.riskMemoryId, "Risk crisis memory id");
	const canonicalId = `crisis_${value.riskMemoryId}`;
	if (value.id !== canonicalId) {
		throw new Error(
			`Risk crisis ${value.id} must use canonical id ${canonicalId}`,
		);
	}
	assertEnum(value.status, CRISIS_STATUSES, "Risk crisis status");
	assertPositiveInteger(
		value.openedWeek,
		`Risk crisis ${value.id} opened week`,
	);
	if (currentWeek !== undefined && value.openedWeek > currentWeek) {
		throw new Error(
			`Risk crisis ${value.id} opened week cannot be from a future week`,
		);
	}
	if (value.resolvedWeek === null) {
		if (value.status !== "open" || value.choice !== null) {
			throw new Error(
				`Open risk crisis ${value.id} must not have a resolution`,
			);
		}
	} else {
		assertPositiveInteger(
			value.resolvedWeek,
			`Risk crisis ${value.id} resolved week`,
		);
		if (value.resolvedWeek < value.openedWeek) {
			throw new Error(`Risk crisis ${value.id} cannot resolve before it opens`);
		}
		if (currentWeek !== undefined && value.resolvedWeek > currentWeek) {
			throw new Error(
				`Risk crisis ${value.id} resolved week cannot be from a future week`,
			);
		}
		if (value.status !== "resolved") {
			throw new Error(
				`A risk crisis with a resolved week must be resolved: ${value.id}`,
			);
		}
		if (value.choice === null) {
			throw new Error(`Resolved risk crisis ${value.id} needs a choice`);
		}
	}
	if (value.choice !== null) {
		assertEnum(value.choice, CRISIS_CHOICES, "Risk crisis choice");
		if (value.status !== "resolved") {
			throw new Error(`Open risk crisis ${value.id} cannot have a choice`);
		}
	}
}

/** Return the authored condition for an incident without exposing mutable data. */
export function riskConditionForIncident(
	incident: IncidentType,
): IncidentCondition {
	const condition = INCIDENT_CONDITIONS[incident];
	if (condition === undefined) {
		throw new Error(`Unknown risk incident: ${incident}`);
	}
	return condition;
}

export function assertRiskCrisisChoice(
	value: unknown,
): asserts value is CrisisChoice {
	assertEnum(value, CRISIS_CHOICES, "Risk crisis choice");
}
