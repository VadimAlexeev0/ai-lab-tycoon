import type {
	CrisisChoice,
	CrisisKind,
	IncidentResponse,
	IncidentType,
	PendingDecision,
} from "../components/decisions.js";
import type { Model } from "../components/models.js";
import type { Fact } from "../components/reports.js";
import {
	assertRiskCrisisChoice,
	cloneRiskState,
	RISK_MEMORY_MAX_SEVERITY,
	RISK_MEMORY_RECURRENCE_ARITHMETIC_CAP,
	type RiskCrisis,
	type RiskMemory,
} from "../components/risk.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import {
	INCIDENT_DEFINITIONS,
	type IncidentCondition,
	type IncidentDefinition,
	incidentDefinition,
	incidentDefinitionForCondition,
} from "../data/incidents.js";
import {
	DEFAULT_INCIDENT_EXPOSURE_PERCENT,
	MAX_INCIDENT_EXPOSURE_PERCENT,
	MODEL_FAMILIES,
} from "../data/model-families.js";
import { getMultimodalArchitecturePath } from "../data/multimodal-architectures.js";
import { assertRunActive } from "../guards.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import { nextInt } from "../rng.js";
import type { EngineResult, GameState } from "../state.js";
import { assertIdentifier, assertInteger } from "../validation.js";
import type { GameSystem } from "./types.js";

const CRISIS_KIND: CrisisKind = "risk_escalation";
const CRISIS_CHOICES: readonly CrisisChoice[] = [
	"investigate",
	"contain",
	"disclose",
];

/** Roll at most one data-defined incident for the current world state. */
export const incidentsSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		return {
			state,
			facts: [],
			pending: state.decisions.pending.map((item) => ({ ...item })),
		};
	}

	const pending: PendingDecision[] = state.decisions.pending.map(
		(decision) => ({ ...decision }),
	);
	const eligibleCrisis = nextEligibleCrisis(state, context.week);
	if (eligibleCrisis !== undefined) {
		const offered = openRiskCrisis(
			state,
			eligibleCrisis,
			context.week,
			pending,
		);
		assertGameState(offered.state, {
			allowNegativeCash: offered.state.company.cash < 0,
		});
		return offered;
	}

	let nextRng = state.rng;
	let nextState = state;
	let activeConditionIndex = 0;
	const facts: Fact[] = [];
	for (const definition of INCIDENT_DEFINITIONS) {
		if (!isIncidentConditionActive(definition.condition, state)) continue;
		const evidence = incidentEvidence(definition, state);
		const memory = matchingRiskMemory(
			state.risk.memories,
			definition,
			evidence,
		);
		const roll = nextInt(nextRng, "incidents", 0, 99);
		nextRng = roll.rng;
		const fixtureRoll =
			context.incidentRolls?.[activeConditionIndex] ?? context.incidentRoll;
		activeConditionIndex += 1;
		const rollValue =
			fixtureRoll === undefined ? roll.value : normalizeRoll(fixtureRoll);
		const probability = incidentProbability(
			definition,
			memory,
			state.risk.crises,
			state.models.items,
			evidence.affectedModelId,
		);
		if (rollValue >= probability) continue;

		const severity = incidentEffect(definition, memory, state.risk.crises);
		const nextMemory = recordIncidentMemory(
			state.risk.memories,
			definition,
			evidence,
			severity,
			context.week,
		);
		const nextRisk = upsertRiskMemory(state.risk, nextMemory);
		nextState = {
			...nextState,
			rng: nextRng,
			risk: nextRisk,
			warnings: updateRiskWarning(state.warnings, nextRisk.memories),
			company: {
				...nextState.company,
				cash: nextState.company.cash - severity.cash,
				trust: Math.max(0, nextState.company.trust - severity.trust),
				hype: Math.max(0, nextState.company.hype - severity.hype),
			},
		};
		const allocation = allocateId(nextState, "decision");
		nextState = allocation.state;
		pending.push({
			kind: "incident",
			id: allocation.id,
			incidentId: allocation.id,
			riskMemoryId: nextMemory.id,
			incident: definition.type,
			blocking: true,
		});
		facts.push({
			kind: "incident_occurred",
			incident: definition.type,
			condition: definition.condition,
			affectedEntity: evidence.affectedEntity,
			metric: definition.metric,
			measurement: evidence.measurement,
			threshold: definition.threshold,
			severity: -(severity.cash + severity.trust + severity.hype),
			riskMemoryId: nextMemory.id,
			recurrenceCount: nextMemory.recurrenceCount,
			unresolved: nextMemory.unresolved,
			unresolvedRecurrenceCount: nextMemory.unresolvedRecurrenceCount,
			riskSeverity: nextMemory.severity,
			week: context.week,
		});
		facts.push(riskMemoryFact(nextMemory, context.week));
		appendResourceFact(facts, "cash", -severity.cash, context.week);
		appendResourceFact(facts, "trust", -severity.trust, context.week);
		appendResourceFact(facts, "hype", -severity.hype, context.week);
		break;
	}

	// A miss still consumes the incident stream draw. Do not return the original
	// state, or replayed misses would silently rewind the deterministic stream.
	nextState = { ...nextState, rng: nextRng };
	assertGameState(nextState, {
		allowNegativeCash: nextState.company.cash < 0,
	});
	return { state: nextState, facts, pending };
};

export function isIncidentConditionActive(
	condition: IncidentCondition,
	state: GameState,
): boolean {
	const reservations = computeReservations(state);
	const servingOverloadDefinition =
		incidentDefinitionForCondition("serving_overload");
	const apiOverloadDefinition = incidentDefinitionForCondition("api_overload");
	const lowQualityDefinition = incidentDefinitionForCondition("low_quality");
	const trainingOverloadDefinition =
		incidentDefinitionForCondition("training_overload");
	const enterpriseRiskDefinition =
		incidentDefinitionForCondition("enterprise_risk");
	const privacyDefinition = incidentDefinitionForCondition("privacy_exposure");
	const servingDemand = reservations.servingDemand;
	const trainingDemand = reservations.trainingDemand;
	const servingOverload = servingDemand > servingOverloadDefinition.threshold;
	const apiOverload = servingDemand > apiOverloadDefinition.threshold;
	const hasApi = state.products.items.some(
		(product) =>
			product.status === "operating" && product.channel === "developer_api",
	);
	const hasProduct = state.products.items.some(
		(product) => product.status === "operating",
	);
	const hasEnterprise = state.products.items.some(
		(product) =>
			product.status === "operating" && product.channel === "enterprise",
	);
	const lowQuality = state.products.items.some(
		(product) =>
			product.status === "operating" &&
			(product.effectiveQuality ?? 100) <= lowQualityDefinition.threshold,
	);
	const enterpriseRisk = state.products.items.some((product) => {
		if (product.status !== "operating" || product.channel !== "enterprise") {
			return false;
		}
		const model = state.models.items.find(
			(candidate) => candidate.id === product.modelId,
		);
		return (
			(model?.estimates?.reliability?.estimate ?? 100) <=
			enterpriseRiskDefinition.threshold
		);
	});
	const trainingOverload =
		trainingDemand > trainingOverloadDefinition.threshold;

	switch (condition) {
		case "serving_overload":
			return servingOverload && !hasApi && !hasEnterprise;
		case "api_overload":
			return apiOverload && hasApi;
		case "low_quality":
			return lowQuality && state.company.trust > privacyDefinition.threshold;
		case "training_overload":
			return trainingOverload;
		case "enterprise_risk":
			return enterpriseRisk;
		case "privacy_exposure":
			return hasProduct && state.company.trust <= privacyDefinition.threshold;
	}
}

/** Apply the selected response for a blocking incident. */
export function applyIncidentResponse(
	state: GameState,
	incident: IncidentType,
	response: IncidentResponse,
	incidentId?: string,
): EngineResult {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	assertRunActive(state);
	const definition = incidentDefinition(incident);
	const effect = definition.responses[response];
	const pendingIncidents = state.decisions.pending.filter(
		(decision): decision is Extract<PendingDecision, { kind: "incident" }> =>
			decision.kind === "incident",
	);
	let pendingIncident:
		| Extract<PendingDecision, { kind: "incident" }>
		| undefined;
	if (incidentId !== undefined) {
		assertIdentifier(incidentId, "Incident id");
		pendingIncident = pendingIncidents.find(
			(decision) =>
				decision.incidentId === incidentId ||
				(decision.incidentId === undefined && decision.id === incidentId),
		);
		if (pendingIncident === undefined) {
			throw new Error(
				`Cannot resolve incident ${incidentId} without a matching pending incident id`,
			);
		}
	} else {
		const matchingIncidents = pendingIncidents.filter(
			(decision) => decision.incident === incident,
		);
		if (matchingIncidents.length !== 1) {
			throw new Error(
				"Cannot resolve an incident without a unique matching pending incident id",
			);
		}
		pendingIncident = matchingIncidents[0];
	}
	if (pendingIncident === undefined) {
		throw new Error(
			"Cannot resolve an incident without its stable incident id",
		);
	}
	if (
		pendingIncident.incidentId !== undefined &&
		pendingIncident.incidentId !== pendingIncident.id
	) {
		throw new Error(
			`Incident decision ${pendingIncident.id} must use its own id as incident id`,
		);
	}
	if (pendingIncident.incident !== incident) {
		throw new Error(
			`Incident id ${incidentId} does not match ${pendingIncident.incident}`,
		);
	}
	const resolvedIncidentId = pendingIncident.incidentId ?? pendingIncident.id;

	const memory = responseMemory(state, incident, pendingIncident);
	const mechanicallyResolved = applyMechanicalResolution(
		state,
		incident,
		effect.resolution,
	);
	const updatedMemory =
		memory === undefined ? undefined : reduceRiskMemory(memory, response);
	const nextState: GameState = {
		...mechanicallyResolved,
		...(updatedMemory === undefined
			? {}
			: {
					risk: replaceRiskMemory(state.risk, updatedMemory),
					warnings: updateRiskWarning(
						state.warnings,
						state.risk.memories.map((item) =>
							item.id === updatedMemory.id ? updatedMemory : item,
						),
					),
				}),
		company: {
			...mechanicallyResolved.company,
			cash: mechanicallyResolved.company.cash - effect.cash,
			trust: Math.max(
				0,
				Math.min(100, mechanicallyResolved.company.trust + effect.trust),
			),
			hype: Math.max(0, mechanicallyResolved.company.hype + effect.hype),
		},
	};
	const facts: Fact[] = [];
	appendResourceFact(facts, "cash", -effect.cash, state.meta.week);
	appendResourceFact(facts, "trust", effect.trust, state.meta.week);
	appendResourceFact(facts, "hype", effect.hype, state.meta.week);
	facts.push({
		kind: "incident_resolved",
		incidentId: resolvedIncidentId,
		incident,
		response,
		...(updatedMemory === undefined ? {} : { riskMemoryId: updatedMemory.id }),
		week: state.meta.week,
	});
	if (updatedMemory !== undefined) {
		facts.push(riskMemoryFact(updatedMemory, state.meta.week));
	}
	assertGameState(nextState, {
		allowNegativeCash: nextState.company.cash < 0,
	});
	return { state: nextState, facts, pending: [] };
}

/** Resolve the first and only Wave 3 crisis chain. */
export function applyCrisisChoice(
	state: GameState,
	crisisId: string,
	choice: CrisisChoice,
	decisionId?: string,
): EngineResult {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	assertRunActive(state);
	assertIdentifier(crisisId, "Crisis id");
	assertRiskCrisisChoice(choice);
	const crisis = state.risk.crises.find((item) => item.id === crisisId);
	if (crisis === undefined) {
		throw new Error(`Cannot resolve unknown crisis: ${crisisId}`);
	}
	if (crisis.status !== "open") {
		throw new Error(`Crisis ${crisisId} has already been resolved`);
	}
	const memory = state.risk.memories.find(
		(item) => item.id === crisis.riskMemoryId,
	);
	if (memory === undefined) {
		throw new Error(`Crisis ${crisisId} references unknown risk memory`);
	}
	if (decisionId !== undefined) {
		assertIdentifier(decisionId, "Crisis decision id");
		const pending = state.decisions.pending.find(
			(item) => item.kind === "crisis" && item.id === decisionId,
		);
		if (pending === undefined) {
			throw new Error(`Cannot resolve unknown crisis decision: ${decisionId}`);
		}
		if (pending.kind !== "crisis" || pending.crisisId !== crisisId) {
			throw new Error(
				`Crisis decision ${decisionId} does not match ${crisisId}`,
			);
		}
	}

	const tuning = BALANCE.riskMemory.crisisChoices[choice];
	const updatedMemory: RiskMemory = {
		...memory,
		unresolved: false,
		unresolvedRecurrenceCount: 0,
		severity: reduceSeverity(memory.severity, tuning.severityReductionPercent),
	};
	const updatedCrisis: RiskCrisis = {
		...crisis,
		status: "resolved",
		resolvedWeek: state.meta.week,
		choice,
	};
	const remaining = state.decisions.pending.filter(
		(item) => !(item.kind === "crisis" && item.crisisId === crisisId),
	);
	const nextState: GameState = {
		...state,
		company: {
			...state.company,
			cash: state.company.cash - tuning.cashCost,
			trust: Math.max(
				0,
				Math.min(100, state.company.trust + tuning.trustChange),
			),
		},
		risk: {
			...cloneRiskState(state.risk),
			memories: state.risk.memories.map((item) =>
				item.id === updatedMemory.id ? { ...updatedMemory } : { ...item },
			),
			crises: state.risk.crises.map((item) =>
				item.id === updatedCrisis.id ? { ...updatedCrisis } : { ...item },
			),
		},
		warnings: updateRiskWarning(
			state.warnings,
			state.risk.memories.map((item) =>
				item.id === updatedMemory.id ? updatedMemory : item,
			),
		),
		decisions: { pending: remaining.map((item) => ({ ...item })) },
		queue: {
			...state.queue,
			decisionIds: remaining.map((item) => item.id),
		},
	};
	const facts: Fact[] = [];
	appendResourceFact(facts, "cash", -tuning.cashCost, state.meta.week);
	appendResourceFact(facts, "trust", tuning.trustChange, state.meta.week);
	facts.push(riskMemoryFact(updatedMemory, state.meta.week));
	facts.push({
		kind: "crisis_resolved",
		crisisId,
		riskMemoryId: updatedMemory.id,
		choice,
		week: state.meta.week,
	});
	assertGameState(nextState, {
		allowNegativeCash: nextState.company.cash < 0,
	});
	return { state: nextState, facts, pending: remaining };
}

export const applyCrisisDecision = applyCrisisChoice;

function openRiskCrisis(
	state: GameState,
	memory: RiskMemory,
	week: number,
	pending: readonly PendingDecision[],
): EngineResult {
	const crisisId = crisisIdForMemory(memory.id);
	if (state.risk.crises.some((crisis) => crisis.id === crisisId)) {
		throw new Error(`Risk crisis ${crisisId} was offered more than once`);
	}
	const allocation = allocateId(state, "decision");
	const crisis: RiskCrisis = {
		id: crisisId,
		kind: CRISIS_KIND,
		riskMemoryId: memory.id,
		status: "open",
		openedWeek: week,
		resolvedWeek: null,
		choice: null,
	};
	const decision: PendingDecision = {
		kind: "crisis",
		id: allocation.id,
		crisisId,
		riskMemoryId: memory.id,
		crisis: CRISIS_KIND,
		choices: [...CRISIS_CHOICES],
		blocking: true,
	};
	const allPending = [...pending.map((item) => ({ ...item })), decision];
	const nextState: GameState = {
		...allocation.state,
		risk: {
			...cloneRiskState(state.risk),
			crises: [...state.risk.crises.map((item) => ({ ...item })), crisis],
		},
		warnings: updateRiskWarning(state.warnings, state.risk.memories),
	};
	return {
		state: nextState,
		facts: [
			{
				kind: "crisis_opened",
				crisisId,
				riskMemoryId: memory.id,
				crisis: CRISIS_KIND,
				week,
			},
		],
		pending: allPending,
	};
}

function nextEligibleCrisis(
	state: GameState,
	week: number,
): RiskMemory | undefined {
	return [...state.risk.memories]
		.filter(
			(memory) =>
				memory.unresolved &&
				memory.unresolvedRecurrenceCount >=
					BALANCE.riskMemory.crisisRecurrenceThreshold &&
				memory.lastOccurrenceWeek < week &&
				!state.risk.crises.some((crisis) => crisis.riskMemoryId === memory.id),
		)
		.sort(
			(left, right) =>
				left.lastOccurrenceWeek - right.lastOccurrenceWeek ||
				left.id.localeCompare(right.id),
		)[0];
}

function incidentProbability(
	definition: IncidentDefinition,
	memory: RiskMemory | undefined,
	crises: readonly RiskCrisis[],
	models: readonly Pick<Model, "id" | "family">[],
	affectedModelId: string | null,
): number {
	const bonus =
		memory?.unresolved === true && !hasResolvedCrisis(memory, crises)
			? Math.min(
					100,
					Math.min(
						RISK_MEMORY_RECURRENCE_ARITHMETIC_CAP,
						memory.unresolvedRecurrenceCount,
					) * BALANCE.riskMemory.recurrenceProbabilityBonus,
				)
			: 0;
	const baseProbability = definition.baseProbability + bonus;
	const exposure = incidentExposureForModel(models, affectedModelId);
	return Math.min(100, Math.trunc((baseProbability * exposure) / 100));
}

function incidentExposureForModel(
	models: readonly Pick<
		Model,
		"id" | "family" | "architecturePath" | "architectureDebt"
	>[],
	affectedModelId: string | null,
): number {
	if (affectedModelId === null) return DEFAULT_INCIDENT_EXPOSURE_PERCENT;
	const model = models.find((candidate) => candidate.id === affectedModelId);
	if (model?.family === undefined) return DEFAULT_INCIDENT_EXPOSURE_PERCENT;
	const family = MODEL_FAMILIES.find(
		(candidate) => candidate.id === model.family,
	);
	const familyExposure =
		family?.incidentExposurePercent ?? DEFAULT_INCIDENT_EXPOSURE_PERCENT;
	const architecture =
		model.architecturePath === undefined
			? undefined
			: getMultimodalArchitecturePath(model.architecturePath);
	if (architecture === undefined) return familyExposure;
	const pathExposure =
		architecture.incidentExposurePercent + (model.architectureDebt ?? 0);
	return Math.min(
		MAX_INCIDENT_EXPOSURE_PERCENT,
		Math.trunc((familyExposure * pathExposure) / 100),
	);
}

function incidentEffect(
	definition: IncidentDefinition,
	memory: RiskMemory | undefined,
	crises: readonly RiskCrisis[],
): { cash: number; trust: number; hype: number } {
	const priorUnresolvedRecurrences =
		memory?.unresolved === true && !hasResolvedCrisis(memory, crises)
			? Math.min(
					RISK_MEMORY_RECURRENCE_ARITHMETIC_CAP,
					memory.unresolvedRecurrenceCount,
				)
			: 0;
	const multiplier =
		100 +
		priorUnresolvedRecurrences *
			BALANCE.riskMemory.recurrenceSeverityIncreasePercent;
	return {
		cash: Math.trunc((definition.severity.cash * multiplier) / 100),
		trust: Math.trunc((definition.severity.trust * multiplier) / 100),
		hype: Math.trunc((definition.severity.hype * multiplier) / 100),
	};
}

function hasResolvedCrisis(
	memory: RiskMemory,
	crises: readonly RiskCrisis[],
): boolean {
	return crises.some(
		(crisis) =>
			crisis.riskMemoryId === memory.id && crisis.status === "resolved",
	);
}

function recordIncidentMemory(
	memories: readonly RiskMemory[],
	definition: IncidentDefinition,
	evidence: IncidentEvidence,
	severity: { cash: number; trust: number; hype: number },
	week: number,
): RiskMemory {
	const id = riskMemoryId(definition.type, evidence);
	const existing = memories.find((memory) => memory.id === id);
	return {
		id,
		name: definition.riskName,
		incident: definition.type,
		condition: definition.condition,
		severity: Math.min(
			RISK_MEMORY_MAX_SEVERITY,
			Math.max(
				existing?.severity ?? 0,
				severity.cash + severity.trust + severity.hype,
			),
		),
		affectedProductId: evidence.affectedProductId,
		affectedModelId: evidence.affectedModelId,
		unresolved: true,
		recurrenceCount: (existing?.recurrenceCount ?? 0) + 1,
		unresolvedRecurrenceCount:
			(existing?.unresolved === true ? existing.unresolvedRecurrenceCount : 0) +
			1,
		lastOccurrenceWeek: week,
	};
}

function responseMemory(
	state: GameState,
	incident: IncidentType,
	pending: PendingDecision | undefined,
): RiskMemory | undefined {
	if (pending?.kind === "incident" && pending.riskMemoryId !== undefined) {
		const memory = state.risk.memories.find(
			(item) => item.id === pending.riskMemoryId,
		);
		if (memory === undefined) {
			throw new Error(
				`Incident references unknown risk memory ${pending.riskMemoryId}`,
			);
		}
		return memory;
	}
	const matches = state.risk.memories.filter(
		(memory) => memory.incident === incident,
	);
	return [...matches].sort(
		(left, right) =>
			right.lastOccurrenceWeek - left.lastOccurrenceWeek ||
			left.id.localeCompare(right.id),
	)[0];
}

function reduceRiskMemory(
	memory: RiskMemory,
	response: IncidentResponse,
): RiskMemory {
	const tuning = BALANCE.riskMemory.responses[response];
	return {
		...memory,
		unresolved: tuning.unresolved,
		unresolvedRecurrenceCount: tuning.unresolved
			? memory.unresolvedRecurrenceCount
			: 0,
		severity: reduceSeverity(memory.severity, tuning.severityReductionPercent),
	};
}

function reduceSeverity(severity: number, reductionPercent: number): number {
	assertInteger(severity, "Risk severity");
	assertInteger(reductionPercent, "Risk severity reduction");
	return Math.trunc((severity * (100 - reductionPercent)) / 100);
}

function replaceRiskMemory(
	risk: GameState["risk"],
	memory: RiskMemory,
): GameState["risk"] {
	return {
		...cloneRiskState(risk),
		memories: risk.memories.map((item) =>
			item.id === memory.id ? { ...memory } : { ...item },
		),
	};
}

function upsertRiskMemory(
	risk: GameState["risk"],
	memory: RiskMemory,
): GameState["risk"] {
	const memories = risk.memories.some((item) => item.id === memory.id)
		? risk.memories.map((item) =>
				item.id === memory.id ? { ...memory } : { ...item },
			)
		: [...risk.memories.map((item) => ({ ...item })), { ...memory }];
	return { ...cloneRiskState(risk), memories };
}

function matchingRiskMemory(
	memories: readonly RiskMemory[],
	definition: IncidentDefinition,
	evidence: IncidentEvidence,
): RiskMemory | undefined {
	const id = riskMemoryId(definition.type, evidence);
	return memories.find((memory) => memory.id === id);
}

function riskMemoryId(
	incident: IncidentType,
	evidence: Pick<IncidentEvidence, "affectedProductId" | "affectedModelId">,
): string {
	const target =
		evidence.affectedProductId ?? evidence.affectedModelId ?? "company";
	return `risk_${incident}_${target}`;
}

function crisisIdForMemory(memoryId: string): string {
	return `crisis_${memoryId}`;
}

function riskMemoryFact(memory: RiskMemory, week: number): Fact {
	return {
		kind: "risk_memory_updated",
		riskMemoryId: memory.id,
		name: memory.name,
		incident: memory.incident,
		condition: memory.condition,
		severity: memory.severity,
		affectedProductId: memory.affectedProductId,
		affectedModelId: memory.affectedModelId,
		unresolved: memory.unresolved,
		unresolvedRecurrenceCount: memory.unresolvedRecurrenceCount,
		recurrenceCount: memory.recurrenceCount,
		lastOccurrenceWeek: memory.lastOccurrenceWeek,
		week,
	};
}

function updateRiskWarning(
	warnings: GameState["warnings"],
	memories: readonly RiskMemory[],
): GameState["warnings"] {
	const withoutRisk = warnings.filter(
		(warning) => warning.code !== "risk_escalation",
	);
	const unresolved = memories.filter((memory) => memory.unresolved);
	if (unresolved.length === 0) return withoutRisk;
	const highest = [...unresolved].sort(
		(left, right) =>
			right.unresolvedRecurrenceCount - left.unresolvedRecurrenceCount ||
			left.id.localeCompare(right.id),
	)[0];
	if (highest === undefined) return withoutRisk;
	return [
		...withoutRisk,
		{
			code: "risk_escalation",
			severity:
				highest.recurrenceCount >= BALANCE.riskMemory.crisisRecurrenceThreshold
					? "critical"
					: "warning",
		},
	];
}

function applyMechanicalResolution(
	state: GameState,
	incident: IncidentType,
	resolution: "pause_product" | "cancel_training" | "disable_exposure",
): GameState {
	if (resolution === "pause_product" || resolution === "disable_exposure") {
		const pauseAll = resolution === "disable_exposure";
		const channel = channelForIncident(incident);
		return {
			...state,
			products: {
				items: state.products.items.map((product) => {
					const shouldPause =
						product.status === "operating" &&
						(pauseAll || channel === undefined || product.channel === channel);
					return shouldPause
						? {
								// Pause is temporary by default: retain users and revenue history.
								...product,
								status: "paused",
								servingDemand: 0,
								lastRevenue: 0,
							}
						: { ...product };
				}),
			},
			compute: withRecomputedCompute({
				...state,
				products: {
					items: state.products.items.map((product) => {
						const shouldPause =
							product.status === "operating" &&
							(pauseAll ||
								channel === undefined ||
								product.channel === channel);
						return shouldPause
							? {
									...product,
									status: "paused",
									servingDemand: 0,
									lastRevenue: 0,
								}
							: { ...product };
					}),
				},
			}),
		};
	}

	const cancelledProjects = state.projects.items.map((project) =>
		project.kind === "training" && project.status === "active"
			? { ...project, status: "cancelled" as const, teamId: null }
			: { ...project },
	);
	const cancelledIds = new Set(
		cancelledProjects
			.filter(
				(project) =>
					project.kind === "training" && project.status === "cancelled",
			)
			.map((project) => project.id),
	);
	const nextState: GameState = {
		...state,
		teams: {
			items: state.teams.items.map((team) =>
				team.activeProjectId !== null && cancelledIds.has(team.activeProjectId)
					? { ...team, activeProjectId: null }
					: { ...team },
			),
		},
		projects: { items: cancelledProjects },
		models: {
			...state.models,
			items: state.models.items.map((model) =>
				model.projectId !== null && cancelledIds.has(model.projectId)
					? {
							...model,
							projectId: null,
							status:
								model.status === "training" || model.status === "designing"
									? "shelved"
									: model.status,
						}
					: { ...model },
			),
		},
	};
	return { ...nextState, compute: withRecomputedCompute(nextState) };
}

function channelForIncident(
	incident: IncidentType,
): "chat" | "developer_api" | "enterprise" | undefined {
	if (incident === "outage") return "chat";
	if (incident === "latency_degradation") return "developer_api";
	if (incident === "enterprise_sla_breach") return "enterprise";
	return undefined;
}

type IncidentEvidence = {
	affectedEntity: string;
	measurement: number;
	affectedProductId: string | null;
	affectedModelId: string | null;
};

function incidentEvidence(
	definition: IncidentDefinition,
	state: GameState,
): IncidentEvidence {
	const reservations = computeReservations(state);
	switch (definition.condition) {
		case "serving_overload":
		case "api_overload": {
			const operatingProducts = state.products.items.filter(
				(item) => item.status === "operating",
			);
			const product =
				(definition.condition === "api_overload"
					? operatingProducts.find(
							(item) =>
								item.channel === "developer_api" &&
								(item.servingDemand ?? 0) > definition.threshold,
						)
					: undefined) ??
				operatingProducts.find(
					(item) => (item.servingDemand ?? 0) > definition.threshold,
				);
			const model = state.models.items.find(
				(item) => item.id === product?.modelId,
			);
			return {
				affectedEntity: product?.id ?? "company",
				measurement: reservations.servingDemand,
				affectedProductId: product?.id ?? null,
				affectedModelId: model?.id ?? null,
			};
		}
		case "low_quality": {
			const product = state.products.items.find(
				(item) =>
					item.status === "operating" &&
					(item.effectiveQuality ?? 100) <= definition.threshold,
			);
			const model = state.models.items.find(
				(item) => item.id === product?.modelId,
			);
			return {
				affectedEntity: product?.id ?? "company",
				measurement: product?.effectiveQuality ?? 100,
				affectedProductId: product?.id ?? null,
				affectedModelId: model?.id ?? null,
			};
		}
		case "training_overload": {
			const project = state.projects.items.find(
				(item) => item.kind === "training" && item.status === "active",
			);
			const model = state.models.items.find(
				(item) =>
					item.id === (project?.kind === "training" ? project.modelId : null),
			);
			return {
				affectedEntity: project?.id ?? "company",
				measurement: reservations.trainingDemand,
				affectedProductId: null,
				affectedModelId: model?.id ?? null,
			};
		}
		case "enterprise_risk": {
			const product = state.products.items.find(
				(item) => item.status === "operating" && item.channel === "enterprise",
			);
			const model = state.models.items.find(
				(item) => item.id === product?.modelId,
			);
			return {
				affectedEntity: product?.id ?? "company",
				measurement: model?.estimates?.reliability?.estimate ?? 100,
				affectedProductId: product?.id ?? null,
				affectedModelId: model?.id ?? null,
			};
		}
		case "privacy_exposure":
			return {
				affectedEntity: "company",
				measurement: state.company.trust,
				affectedProductId: null,
				affectedModelId: null,
			};
	}
}

function normalizeRoll(value: number): number {
	if (!Number.isInteger(value) || value < 0 || value > 99) {
		throw new Error(
			"Incident roll fixtures must be integers from 0 through 99",
		);
	}
	return value;
}

function appendResourceFact(
	facts: Fact[],
	resource: "cash" | "trust" | "hype",
	amount: number,
	week: number,
): void {
	if (amount === 0) return;
	facts.push({ kind: "resource_changed", resource, amount, week });
}
