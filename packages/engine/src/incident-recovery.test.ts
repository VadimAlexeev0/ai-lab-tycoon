import { describe, expect, it } from "vitest";
import { withRecomputedCompute } from "./compute-reservations.js";
import { startRun } from "./index.js";
import { applyProductResume } from "./products.js";
import type { GameState } from "./state.js";
import { applyIncidentResponse } from "./systems/incidents.js";

function pausedState(): GameState {
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
				efficiency: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 60, lower: 40, upper: 80 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	state.products.items = [
		{
			id: "product_001",
			channel: "chat",
			modelId: "model_001",
			status: "paused",
			// V1 pause policy: users persist with decay=0; resume serves them again.
			users: 17,
			lastRevenue: 0,
			cumulativeRevenue: 123,
			servingDemand: 0,
			effectiveQuality: 60,
		},
	];
	return state;
}

describe("incident product recovery", () => {
	it("resumes paused products with persisted users and recomputed demand", () => {
		const state = pausedState();
		const before = JSON.stringify(state);

		const result = applyProductResume(state, "product_001");
		const product = result.state.products.items[0];

		expect(product).toMatchObject({
			id: "product_001",
			status: "operating",
			users: 17,
			servingDemand: 17,
			cumulativeRevenue: 123,
		});
		expect(result.state.compute.servingDemand).toBe(17);
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "product_resumed",
				productId: "product_001",
				channel: "chat",
			}),
		);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("keeps pause temporary so a later resume reuses the retained users", () => {
		const state = pausedState();
		const product = state.products.items[0];
		if (product === undefined) throw new Error("Expected product");
		product.status = "operating";
		product.servingDemand = 17;
		state.compute = withRecomputedCompute(state);
		state.decisions.pending = [
			{
				kind: "incident",
				id: "decision_001",
				incidentId: "decision_001",
				incident: "outage",
				blocking: true,
			},
		];
		state.queue.decisionIds = ["decision_001"];

		const paused = applyIncidentResponse(
			state,
			"outage",
			"repair",
			"decision_001",
		);
		expect(paused.state.products.items[0]).toMatchObject({
			status: "paused",
			users: 17,
			servingDemand: 0,
		});

		const resumed = applyProductResume(paused.state, "product_001");
		expect(resumed.state.products.items[0]).toMatchObject({
			status: "operating",
			users: 17,
			servingDemand: 17,
		});
	});

	it("requires an existing paused product for resume", () => {
		expect(() => applyProductResume(pausedState(), "product_999")).toThrow(
			/unknown product/i,
		);

		const operating = pausedState();
		const operatingProduct = operating.products.items[0];
		if (operatingProduct === undefined) throw new Error("Expected product");
		operatingProduct.status = "operating";
		expect(() => applyProductResume(operating, operatingProduct.id)).toThrow(
			/paused/i,
		);

		const planned = pausedState();
		const plannedProduct = planned.products.items[0];
		if (plannedProduct === undefined) throw new Error("Expected product");
		plannedProduct.status = "planned";
		expect(() => applyProductResume(planned, plannedProduct.id)).toThrow(
			/paused/i,
		);
	});
});
