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
			(BALANCE.productChannels.chat.weeklyRevenue * expectedQuality) / 100,
		);

		expect(result.state.company.cash).toBe(
			launched.company.cash + expectedRevenue,
		);
		expect(result.state.compute.servingDemand).toBeGreaterThan(0);
		expect(result.facts).toContainEqual({
			kind: "revenue",
			productId: "product_001",
			channel: "chat",
			amount: expectedRevenue,
			effectiveQuality: expectedQuality,
			week: 1,
		});
	});
});
