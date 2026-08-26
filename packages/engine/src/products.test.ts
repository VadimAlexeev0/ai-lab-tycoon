import { describe, expect, it } from "vitest";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";
import { isProductLaunchEligible, launchProduct } from "./products.js";
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

function assistantEra(state: GameState): GameState {
	state.meta.era = "assistant";
	state.research.currentEra = "assistant";
	for (const nodeId of ["text_models_principles", "text_models_keystone"]) {
		const node = state.research.nodes.find((item) => item.id === nodeId);
		if (node === undefined) throw new Error(`Expected ${nodeId}`);
		node.status = "completed";
	}
	return state;
}

function syncCompute(state: GameState): GameState {
	state.compute = withRecomputedCompute(state);
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
		const state = assistantEra(readyState());
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

	it("offers eligible launches alongside an affordable evaluation", () => {
		const state = readyState();
		state.company.hype = 100;
		state.company.trust = 100;
		state.company.insight = BALANCE.evaluations.capability.insightCost;
		expect(isProductLaunchEligible(state, "model_001", "chat")).toBe(true);
		expect(isProductLaunchEligible(state, "model_001", "developer_api")).toBe(
			true,
		);
		const result = productsSystem(state, { phase: "products", week: 1 });

		expect(result.pending).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "evaluation",
					modelId: "model_001",
					evaluation: "capability",
				}),
				expect.objectContaining({
					kind: "launch",
					modelId: "model_001",
					channel: "chat",
				}),
				expect.objectContaining({
					kind: "launch",
					modelId: "model_001",
					channel: "developer_api",
				}),
			]),
		);
	});

	it("keeps eligible launches when evaluation resources are unavailable", () => {
		const state = readyState();
		state.company.hype = 100;
		state.company.trust = 100;
		state.company.insight = 0;
		const result = productsSystem(state, { phase: "products", week: 1 });
		const launches = result.pending.filter(
			(decision) => decision.kind === "launch",
		);

		expect(launches.map((decision) => decision.channel)).toEqual(
			expect.arrayContaining(["chat", "developer_api"]),
		);
		expect(
			result.pending.some((decision) => decision.kind === "evaluation"),
		).toBe(false);
	});

	it("surfaces an informational fact when a ready model has no affordable choice", () => {
		const state = readyState();
		state.company.cash = 0;
		state.company.hype = 0;
		state.company.insight = 0;
		state.company.trust = 0;

		const result = productsSystem(state, { phase: "products", week: 1 });

		expect(
			result.pending.some(
				(decision) =>
					(decision.kind === "launch" || decision.kind === "evaluation") &&
					decision.modelId === "model_001",
			),
		).toBe(false);
		expect(result.facts.length).toBeGreaterThan(0);
	});

	it("zeroes demand and revenue for non-operating products", () => {
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		const product = launched.products.items[0];
		if (product === undefined) throw new Error("Expected chat product");
		product.status = "paused";
		product.servingDemand = 99;
		product.lastRevenue = 42;

		const result = productsSystem(syncCompute(launched), {
			phase: "products",
			week: 2,
		});

		expect(result.state.products.items[0]).toMatchObject({
			status: "paused",
			servingDemand: 0,
			lastRevenue: 0,
		});
		expect(result.state.compute.servingDemand).toBe(0);
		expect(result.state.compute.allocated).toBe(0);
		expect(result.facts.some((fact) => fact.kind === "revenue")).toBe(false);
	});

	it("clamps trust at exactly 100 and stops emitting trust facts", () => {
		const state = assistantEra(readyState());
		state.company.hype = 100;
		state.company.trust = 98;
		const model = state.models.items[0];
		if (model?.estimates === undefined) throw new Error("Expected estimates");
		for (const estimate of Object.values(model.estimates)) {
			estimate.estimate = 100;
			estimate.lower = 80;
			estimate.upper = 100;
		}
		const launched = launchProduct(state, "model_001", "enterprise").state;

		const first = productsSystem(launched, { phase: "products", week: 1 });
		expect(first.state.company.trust).toBe(99);
		const second = productsSystem(first.state, {
			phase: "products",
			week: 2,
		});
		expect(second.state.company.trust).toBe(100);
		expect(
			second.facts.filter(
				(fact) => fact.kind === "resource_changed" && fact.resource === "trust",
			),
		).toHaveLength(1);
		const third = productsSystem(second.state, {
			phase: "products",
			week: 3,
		});
		expect(third.state.company.trust).toBe(100);
		expect(
			third.facts.filter(
				(fact) => fact.kind === "resource_changed" && fact.resource === "trust",
			),
		).toHaveLength(0);
	});

	it("emits no revenue fact when the computed revenue truncates to zero", () => {
		const state = readyState();
		const model = state.models.items[0];
		if (model?.estimates === undefined) throw new Error("Expected estimates");
		model.estimates.capability = { estimate: 0, lower: 0, upper: 20 };
		model.estimates.reliability = { estimate: 0, lower: 0, upper: 20 };
		model.status = "launched";
		state.products.items = [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_001",
				status: "operating",
				users: 10,
				lastRevenue: 0,
				cumulativeRevenue: 0,
				servingDemand: 10,
				effectiveQuality: 0,
			},
		];

		const result = productsSystem(syncCompute(state), {
			phase: "products",
			week: 1,
		});

		expect(result.state.products.items[0]?.lastRevenue).toBe(0);
		expect(result.state.products.items[0]?.cumulativeRevenue).toBe(0);
		expect(result.state.company.cash).toBe(state.company.cash);
		expect(result.facts.some((fact) => fact.kind === "revenue")).toBe(false);
	});

	it("truncates fractional revenue toward zero instead of rounding", () => {
		const state = readyState();
		const model = state.models.items[0];
		if (model?.estimates === undefined) throw new Error("Expected estimates");
		// Chat quality is the mean of capability and reliability: 57 here.
		model.estimates.capability = { estimate: 54, lower: 34, upper: 74 };
		model.estimates.reliability = { estimate: 60, lower: 40, upper: 80 };
		const launched = launchProduct(state, "model_001", "chat").state;

		// 100 * 57 * 15 / 1000 = 85.5, which must truncate to 85.
		const result = productsSystem(launched, { phase: "products", week: 1 });
		expect(result.state.products.items[0]?.users).toBe(15);
		expect(result.state.products.items[0]?.lastRevenue).toBe(85);
		expect(result.state.products.items[0]?.cumulativeRevenue).toBe(85);
		expect(result.state.company.cash).toBe(launched.company.cash + 85);
	});

	it("accumulates exact weekly revenue into cash and cumulative revenue", () => {
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		const first = productsSystem(launched, { phase: "products", week: 1 });
		expect(first.state.products.items[0]?.users).toBe(15);
		expect(first.state.products.items[0]?.lastRevenue).toBe(75);
		expect(first.state.products.items[0]?.cumulativeRevenue).toBe(75);

		const second = productsSystem(first.state, {
			phase: "products",
			week: 2,
		});
		expect(second.state.products.items[0]?.users).toBe(20);
		expect(second.state.products.items[0]?.lastRevenue).toBe(100);
		expect(second.state.products.items[0]?.cumulativeRevenue).toBe(175);
		expect(second.state.company.cash).toBe(launched.company.cash + 75 + 100);
	});
});
