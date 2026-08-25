import type {
	IncidentResponse,
	IncidentType,
	PendingDecision,
} from "../components/decisions.js";
import type { Fact } from "../components/reports.js";
import {
	INCIDENT_DEFINITIONS,
	type IncidentCondition,
	incidentDefinition,
} from "../data/incidents.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import { nextInt } from "../rng.js";
import type { EngineResult, GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Roll at most one data-defined incident for the current world state. */
export const incidentsSystem: GameSystem = (state, context) => {
	assertGameState(state);
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		return {
			state,
			facts: [],
			pending: state.decisions.pending.map((item) => ({ ...item })),
		};
	}

	let nextRng = state.rng;
	let nextState = state;
	const pending: PendingDecision[] = state.decisions.pending.map(
		(decision) => ({
			...decision,
		}),
	);
	const facts: Fact[] = [];
	for (const definition of INCIDENT_DEFINITIONS) {
		if (!isIncidentConditionActive(definition.condition, state)) continue;
		const roll = nextInt(nextRng, "incidents", 0, 99);
		nextRng = roll.rng;
		const probability = definition.forcedProbability;
		if (roll.value >= probability) continue;

		const severity = definition.severity;
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
			incident: definition.type,
			blocking: true,
		});
		facts.push({
			kind: "incident_occurred",
			incident: definition.type,
			week: context.week,
		});
		appendResourceFact(facts, "cash", -severity.cash, context.week);
		appendResourceFact(facts, "trust", -severity.trust, context.week);
		appendResourceFact(facts, "hype", -severity.hype, context.week);
		break;
	}

	assertGameState(nextState, { allowNegativeCash: true });
	return { state: nextState, facts, pending };
};

export function isIncidentConditionActive(
	condition: IncidentCondition,
	state: GameState,
): boolean {
	const servingOverload = state.compute.servingDemand > state.compute.capacity;
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
			product.status === "operating" && (product.effectiveQuality ?? 100) <= 30,
	);
	const enterpriseRisk = state.products.items.some((product) => {
		if (product.status !== "operating" || product.channel !== "enterprise")
			return false;
		const model = state.models.items.find(
			(candidate) => candidate.id === product.modelId,
		);
		return (
			(product.effectiveQuality ?? 100) <= 55 ||
			(model?.estimates?.reliability?.estimate ?? 100) <= 35
		);
	});

	switch (condition) {
		case "serving_overload":
			return servingOverload && !hasApi && !hasEnterprise;
		case "api_overload":
			return servingOverload && hasApi;
		case "low_quality":
			return lowQuality && state.company.trust > 10;
		case "training_overload":
			return (
				state.compute.trainingDemand > state.compute.capacity && !hasProduct
			);
		case "enterprise_risk":
			return enterpriseRisk;
		case "privacy_exposure":
			return hasProduct && state.company.trust <= 10;
	}
}

/** Apply the selected response for a blocking incident. */
export function applyIncidentResponse(
	state: GameState,
	incident: IncidentType,
	response: IncidentResponse,
): EngineResult {
	assertGameState(state);
	const definition = incidentDefinition(incident);
	const effect = definition.responses[response];
	const nextState: GameState = {
		...state,
		company: {
			...state.company,
			cash: state.company.cash - effect.cash,
			trust: Math.max(0, Math.min(100, state.company.trust + effect.trust)),
			hype: Math.max(0, state.company.hype + effect.hype),
		},
	};
	const facts: Fact[] = [];
	appendResourceFact(facts, "cash", -effect.cash, state.meta.week);
	appendResourceFact(facts, "trust", effect.trust, state.meta.week);
	appendResourceFact(facts, "hype", effect.hype, state.meta.week);
	assertGameState(nextState, { allowNegativeCash: true });
	return { state: nextState, facts, pending: [] };
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
