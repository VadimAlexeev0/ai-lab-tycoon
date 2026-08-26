import type {
	IncidentResponse,
	IncidentType,
	PendingDecision,
} from "../components/decisions.js";
import type { Fact } from "../components/reports.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import {
	INCIDENT_DEFINITIONS,
	type IncidentCondition,
	type IncidentDefinition,
	incidentDefinition,
	incidentDefinitionForCondition,
} from "../data/incidents.js";
import { assertRunActive } from "../guards.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import { nextInt } from "../rng.js";
import type { EngineResult, GameState } from "../state.js";
import { assertIdentifier } from "../validation.js";
import type { GameSystem } from "./types.js";

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

	let nextRng = state.rng;
	let nextState = state;
	let activeConditionIndex = 0;
	const pending: PendingDecision[] = state.decisions.pending.map(
		(decision) => ({ ...decision }),
	);
	const facts: Fact[] = [];
	for (const definition of INCIDENT_DEFINITIONS) {
		if (!isIncidentConditionActive(definition.condition, state)) continue;
		const roll = nextInt(nextRng, "incidents", 0, 99);
		nextRng = roll.rng;
		const fixtureRoll =
			context.incidentRolls?.[activeConditionIndex] ?? context.incidentRoll;
		activeConditionIndex += 1;
		const rollValue =
			fixtureRoll === undefined ? roll.value : normalizeRoll(fixtureRoll);
		if (rollValue >= definition.baseProbability) continue;

		const severity = definition.severity;
		const evidence = incidentEvidence(definition, state);
		nextState = {
			...nextState,
			rng: nextRng,
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
			incident: definition.type,
			blocking: true,
		});
		facts.push({
			// The pending decision carries the same allocation.id. Adding the
			// incidentId field to this occurrence fact/report validator is a
			// cross-scope schema request; keep the id stable at the decision seam.
			kind: "incident_occurred",
			incident: definition.type,
			condition: definition.condition,
			affectedEntity: evidence.affectedEntity,
			metric: definition.metric,
			measurement: evidence.measurement,
			threshold: definition.threshold,
			severity: -(severity.cash + severity.trust + severity.hype),
			week: context.week,
		});
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
	const mechanicallyResolved = applyMechanicalResolution(
		state,
		incident,
		effect.resolution,
	);
	const nextState: GameState = {
		...mechanicallyResolved,
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
	const pendingIncident = state.decisions.pending.find((decision) => {
		if (decision.kind !== "incident") return false;
		return incidentId === undefined
			? decision.incident === incident
			: decision.incidentId === incidentId || decision.id === incidentId;
	});
	if (incidentId !== undefined) {
		assertIdentifier(incidentId, "Incident id");
	}
	if (
		pendingIncident?.kind === "incident" &&
		pendingIncident.incident !== incident
	) {
		throw new Error(
			`Incident id ${incidentId} does not match ${pendingIncident.incident}`,
		);
	}
	const resolvedIncidentId =
		incidentId ??
		(pendingIncident?.kind === "incident"
			? (pendingIncident.incidentId ?? pendingIncident.id)
			: undefined);
	if (resolvedIncidentId === undefined) {
		throw new Error(
			"Cannot resolve an incident without its stable incident id",
		);
	}
	const facts: Fact[] = [];
	appendResourceFact(facts, "cash", -effect.cash, state.meta.week);
	appendResourceFact(facts, "trust", effect.trust, state.meta.week);
	appendResourceFact(facts, "hype", effect.hype, state.meta.week);
	facts.push({
		kind: "incident_resolved",
		incidentId: resolvedIncidentId,
		incident,
		response,
		week: state.meta.week,
	});
	assertGameState(nextState, {
		allowNegativeCash: nextState.company.cash < 0,
	});
	return { state: nextState, facts, pending: [] };
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

function incidentEvidence(
	definition: IncidentDefinition,
	state: GameState,
): { affectedEntity: string; measurement: number } {
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
			return {
				// Overload is an aggregate metric. Name a product only when its
				// own demand crosses the definition threshold; otherwise the
				// company is the affected entity and the aggregate is reported.
				affectedEntity: product?.id ?? "company",
				measurement: reservations.servingDemand,
			};
		}
		case "low_quality": {
			const product = state.products.items.find(
				(item) =>
					item.status === "operating" &&
					(item.effectiveQuality ?? 100) <= definition.threshold,
			);
			return {
				affectedEntity: product?.id ?? "company",
				measurement: product?.effectiveQuality ?? 100,
			};
		}
		case "training_overload": {
			const project = state.projects.items.find(
				(item) => item.kind === "training" && item.status === "active",
			);
			return {
				affectedEntity: project?.id ?? "company",
				measurement: reservations.trainingDemand,
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
			};
		}
		case "privacy_exposure":
			return { affectedEntity: "company", measurement: state.company.trust };
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
