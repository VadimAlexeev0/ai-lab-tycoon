import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";
import { launchProduct } from "./products.js";
import type { GameState } from "./state.js";
import { productsSystem } from "./systems/products.js";

function readyState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 100,
				coding: 100,
				reliability: 100,
				safety: 100,
				efficiency: 100,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 40, lower: 20, upper: 60 },
				coding: { estimate: 40, lower: 20, upper: 60 },
				reliability: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 50, lower: 30, upper: 70 },
				efficiency: { estimate: 50, lower: 30, upper: 70 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	return state;
}

describe("products", () => {
	it("launches only when data-driven channel requirements are met", () => {
		const state = readyState();
		const result = launchProduct(state, "model_001", "chat");
		const product = result.state.products.items[0];

		expect(product).toMatchObject({
			channel: "chat",
			modelId: "model_001",
			status: "operating",
		});
		expect(result.facts).toContainEqual(
			expect.objectContaining({ kind: "product_launched", channel: "chat" }),
		);
	});

	it("uses estimate quality, never hidden true scores, for exact weekly revenue", () => {
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		const result = productsSystem(launched, { phase: "products", week: 1 });
		const expectedQuality = Math.trunc((40 + 60) / 2);
		const expectedRevenue = Math.trunc(
			(BALANCE.productChannels.chat.weeklyRevenue * expectedQuality * 15) /
				(100 * BALANCE.productChannels.chat.baseUsers),
		);

		expect(result.state.company.cash).toBe(
			launched.company.cash + expectedRevenue,
		);
		expect(result.state.compute.servingDemand).toBeGreaterThan(0);
		expect(result.state.compute.allocated).toBeLessThanOrEqual(
			result.state.compute.capacity,
		);
		expect(result.facts).toContainEqual({
			kind: "revenue",
			productId: "product_001",
			channel: "chat",
			amount: expectedRevenue,
			effectiveQuality: expectedQuality,
			week: 1,
		});
	});

	it("scales revenue monotonically with traction users", () => {
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		const product = launched.products.items[0];
		if (product === undefined) throw new Error("Expected chat product");
		product.users = 15;
		const result = productsSystem(launched, { phase: "products", week: 1 });
		expect(result.state.products.items[0]?.users).toBe(20);
		expect(result.state.products.items[0]?.lastRevenue).toBe(100);
	});

	it("offers each missing channel once its exact gates are met", () => {
		const state = readyState();
		state.meta.era = "assistant";
		state.research.currentEra = "assistant";
		state.company.hype = 100;
		state.company.trust = 100;
		const model = state.models.items[0];
		if (model?.estimates === undefined)
			throw new Error("Expected model estimates");
		for (const estimate of Object.values(model.estimates)) {
			estimate.estimate = 100;
			estimate.lower = 80;
			estimate.upper = 100;
		}
		const launched = launchProduct(state, "model_001", "chat").state;
		const result = productsSystem(launched, { phase: "products", week: 1 });
		const channels = result.pending
			.filter((decision) => decision.kind === "launch")
			.map((decision) => decision.channel);
		expect(channels).toEqual(
			expect.arrayContaining(["developer_api", "enterprise"]),
		);
	});
});
