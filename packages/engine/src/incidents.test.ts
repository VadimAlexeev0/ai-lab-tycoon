import { describe, expect, it } from "vitest";
import type { IncidentType } from "./components/decisions.js";
import { incidentDefinition } from "./data/incidents.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";
import type { GameState } from "./state.js";
import {
	applyIncidentResponse,
	incidentsSystem,
	isIncidentConditionActive,
} from "./systems/incidents.js";

const INCIDENTS: readonly IncidentType[] = [
	"outage",
	"latency_degradation",
	"quality_safety_scandal",
	"compute_cost_overrun",
	"enterprise_sla_breach",
	"data_privacy_incident",
];

function forcedState(incident: IncidentType): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "launched",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 70,
				coding: 60,
				reliability: 60,
				safety: 60,
				efficiency: 60,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 60, lower: 40, upper: 80 },
				coding: { estimate: 60, lower: 40, upper: 80 },
				reliability: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 60, lower: 40, upper: 80 },
				efficiency: { estimate: 60, lower: 40, upper: 80 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];

	if (incident === "compute_cost_overrun") {
		state.compute.trainingDemand = state.compute.capacity + 1;
		return state;
	}
	const channel =
		incident === "enterprise_sla_breach"
			? "enterprise"
			: incident === "latency_degradation"
				? "developer_api"
				: "chat";
	state.products.items = [
		{
			id: "product_001",
			channel,
			modelId: "model_001",
			status: "operating",
			users: 10,
			lastRevenue: 0,
			cumulativeRevenue: 0,
			servingDemand:
				incident === "outage" || incident === "latency_degradation"
					? state.compute.capacity + 1
					: 1,
			effectiveQuality: incident === "quality_safety_scandal" ? 10 : 60,
		},
	];
	if (incident === "data_privacy_incident") state.company.trust = 1;
	if (incident === "enterprise_sla_breach") {
		const model = state.models.items[0];
		if (model?.estimates !== undefined) {
			model.estimates.reliability = { estimate: 10, lower: 0, upper: 20 };
		}
	}
	state.compute.servingDemand = state.products.items[0]?.servingDemand ?? 0;
	return state;
}

describe("incidents", () => {
	it.each(INCIDENTS)(
		"triggers %s from its forced world condition and incident RNG",
		(incident) => {
			const result = incidentsSystem(forcedState(incident), {
				phase: "incidents",
				week: 1,
				incidentRolls: [0],
			});
			expect(result.pending).toContainEqual(
				expect.objectContaining({ kind: "incident", incident, blocking: true }),
			);
			expect(result.facts).toContainEqual(
				expect.objectContaining({
					kind: "incident_occurred",
					incident,
					week: 1,
				}),
			);
		},
	);

	it("uses base probability with deterministic roll fixtures and persists RNG misses", () => {
		const state = forcedState("outage");
		const missed = incidentsSystem(state, {
			phase: "incidents",
			week: 1,
			incidentRolls: [2],
		});
		expect(missed.pending).toHaveLength(0);
		expect(missed.state.rng).not.toEqual(state.rng);

		const hit = incidentsSystem(state, {
			phase: "incidents",
			week: 1,
			incidentRolls: [0],
		});
		expect(hit.pending).toContainEqual(
			expect.objectContaining({ kind: "incident", incident: "outage" }),
		);
	});

	it.each(INCIDENTS)(
		"resolves the %s trigger mechanically after a response",
		(incident) => {
			const occurrence = incidentsSystem(forcedState(incident), {
				phase: "incidents",
				week: 1,
				incidentRolls: [0],
			});
			const definition = incidentDefinition(incident);
			expect(occurrence.facts).toContainEqual(
				expect.objectContaining({
					kind: "incident_occurred",
					condition: definition.condition,
					metric: expect.any(String),
					affectedEntity: expect.anything(),
					severity: expect.any(Number),
				}),
			);
			const resolved = applyIncidentResponse(
				occurrence.state,
				incident,
				"repair",
			);
			expect(
				isIncidentConditionActive(definition.condition, resolved.state),
			).toBe(false);
			const resolvedFact = resolved.facts.find(
				(fact) => fact.kind === "incident_resolved",
			);
			if (resolvedFact?.kind !== "incident_resolved") {
				throw new Error("Expected an incident resolution fact");
			}
			expect(resolvedFact.incidentId).toBe(incident);
			expect(resolved.facts).toContainEqual(
				expect.objectContaining({
					kind: "incident_resolved",
					incident,
					response: "repair",
				}),
			);
		},
	);

	it("keeps a trust-zero incident pending until its response is applied", () => {
		const state = forcedState("data_privacy_incident");
		state.compute.capacity = 100;
		const advanced = advanceWeek(state, { incidentRolls: [0] });

		expect(advanced.state.terminal.status).toBe("active");
		expect(advanced.state.decisions.pending).toHaveLength(1);
		expect(advanced.state.decisions.pending[0]).toMatchObject({
			kind: "incident",
			incident: "data_privacy_incident",
		});
		expect(advanced.facts).not.toContainEqual(
			expect.objectContaining({ kind: "terminal" }),
		);

		const decision = advanced.state.decisions.pending[0];
		if (decision?.kind !== "incident")
			throw new Error("Expected incident decision");
		const disclosed = applyDecision(advanced.state, {
			kind: "incident",
			decisionId: decision.id,
			response: "disclose",
		});
		expect(disclosed.state.company.trust).toBeGreaterThan(0);
		expect(disclosed.state.terminal.status).toBe("active");
		expect(disclosed.state.decisions.pending).toHaveLength(0);
		const disclosedFact = disclosed.facts.find(
			(fact) => fact.kind === "incident_resolved",
		);
		expect(disclosedFact).toMatchObject({
			kind: "incident_resolved",
			incidentId: decision.id,
			incident: "data_privacy_incident",
			response: "disclose",
		});
	});

	it("terminalizes immediately when an incident response leaves Trust at zero", () => {
		const state = forcedState("data_privacy_incident");
		state.compute.capacity = 100;
		const advanced = advanceWeek(state, { incidentRolls: [0] });
		const decision = advanced.state.decisions.pending[0];
		if (decision?.kind !== "incident")
			throw new Error("Expected incident decision");

		const resolved = applyDecision(advanced.state, {
			kind: "incident",
			decisionId: decision.id,
			response: "repair",
		});
		expect(resolved.state.company.trust).toBe(0);
		expect(resolved.state.terminal).toMatchObject({
			status: "lost",
			reason: "trust_collapsed",
		});
		expect(resolved.facts).toContainEqual(
			expect.objectContaining({ kind: "terminal", reason: "trust_collapsed" }),
		);
	});

	it("returns cash-depleted after an unaffordable outage repair instead of throwing", () => {
		const state = forcedState("outage");
		state.compute.capacity = 12;
		state.company.cash = 50;
		const advanced = advanceWeek(state, { incidentRolls: [0] });
		const decision = advanced.state.decisions.pending[0];
		if (decision?.kind !== "incident")
			throw new Error("Expected incident decision");

		const resolved = applyDecision(advanced.state, {
			kind: "incident",
			decisionId: decision.id,
			response: "repair",
		});
		expect(resolved.state.terminal).toMatchObject({
			status: "lost",
			reason: "cash_depleted",
		});
	});
});
