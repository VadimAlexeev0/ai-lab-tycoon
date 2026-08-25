import { describe, expect, it } from "vitest";
import type { IncidentType } from "./components/decisions.js";
import { startRun } from "./index.js";
import type { GameState } from "./state.js";
import { incidentsSystem } from "./systems/incidents.js";

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
});
