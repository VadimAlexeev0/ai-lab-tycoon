import { describe, expect, it } from "vitest";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	assertGameState,
	GAME_STATE_SCHEMA_VERSION,
	startRun,
	upgradeGameState,
} from "./index.js";
import { launchProduct, retireProduct } from "./products.js";

import type { GameState } from "./state.js";
import { productsSystem } from "./systems/products.js";
import { trainingSystem } from "./systems/training.js";

function readyState(): GameState {
	const state = startRun({ companyName: "Pressure Labs" }, 42);
	const unlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (unlock === undefined) throw new Error("Expected text model unlock");
	unlock.status = "completed";
	state.company.hype = 100;
	state.company.trust = 100;
	state.models.items = [
		{
			id: "model_001",
			name: "Pressure-1",
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
				capability: { estimate: 100, lower: 80, upper: 100 },
				coding: { estimate: 100, lower: 80, upper: 100 },
				reliability: { estimate: 100, lower: 80, upper: 100 },
				safety: { estimate: 100, lower: 80, upper: 100 },
				efficiency: { estimate: 100, lower: 80, upper: 100 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	return state;
}

function tickAtPrice(price: number): GameState {
	const launch = launchProduct(readyState(), {
		modelId: "model_001",
		channel: "chat",
		price,
	});
	const launched = {
		...launch.state,
		compute: { ...launch.state.compute, capacity: 30 },
	};
	launched.compute = withRecomputedCompute(launched);
	return productsSystem(launched, { phase: "products", week: 1 }).state;
}

describe("product operating pressure", () => {
	it("derives higher revenue and margin from a higher player price", () => {
		const low = tickAtPrice(5).products.items[0];
		const high = tickAtPrice(20).products.items[0];
		if (low === undefined || high === undefined) {
			throw new Error("Expected launched products");
		}

		expect(low.price).toBe(5);
		expect(high.price).toBe(20);
		expect(high.lastRevenue).toBeGreaterThan(low.lastRevenue ?? 0);
		expect(high.lastMargin).toBeGreaterThan(low.lastMargin ?? 0);
	});

	it("uses channel price bounds, keeps the default compatible, and exposes price pressure", () => {
		const defaultLaunch = launchProduct(readyState(), "model_001", "chat");
		const defaultProduct = defaultLaunch.state.products.items[0];
		if (defaultProduct === undefined)
			throw new Error("Expected default product");
		expect(defaultProduct.price).toBe(
			BALANCE.productPressure.channels.chat.defaultPrice,
		);
		expect(defaultLaunch.state.commandLog.at(-1)).toMatchObject({
			kind: "launch_product",
			price: BALANCE.productPressure.channels.chat.defaultPrice,
		});

		const belowMinimum = readyState();
		expect(() =>
			launchProduct(belowMinimum, {
				modelId: "model_001",
				channel: "chat",
				price: BALANCE.productPressure.channels.chat.minimumPrice - 1,
			}),
		).toThrow(/price.*between|price/i);
		expect(belowMinimum.products.items).toHaveLength(0);

		const aboveMaximum = readyState();
		expect(() =>
			launchProduct(aboveMaximum, {
				modelId: "model_001",
				channel: "chat",
				price: BALANCE.productPressure.channels.chat.maximumPrice + 1,
			}),
		).toThrow(/price.*between|price/i);

		const low = tickAtPrice(5).products.items[0] as Record<string, unknown>;
		const high = tickAtPrice(20).products.items[0] as Record<string, unknown>;
		expect(low.servingDemand).toBeGreaterThan(high.servingDemand as number);
	});

	it("persists bounded satisfaction and churn and deterministically loses poor-service users", () => {
		const first = readyState();
		const firstModel = first.models.items[0];
		if (firstModel?.estimates === undefined) {
			throw new Error("Expected model estimates");
		}
		const launched = launchProduct(first, {
			modelId: "model_001",
			channel: "chat",
			price: 20,
		}).state;
		const launchedModel = launched.models.items[0];
		if (launchedModel?.estimates === undefined) {
			throw new Error("Expected launched model estimates");
		}
		launchedModel.estimates.capability = { estimate: 20, lower: 0, upper: 40 };
		launchedModel.estimates.reliability = { estimate: 20, lower: 0, upper: 40 };
		launchedModel.estimates.efficiency = { estimate: 20, lower: 0, upper: 40 };
		const product = launched.products.items[0];
		if (product === undefined) throw new Error("Expected launched product");
		product.users = 100;
		launched.compute.capacity = 1;
		const synced = { ...launched, compute: withRecomputedCompute(launched) };
		const firstTick = productsSystem(synced, {
			phase: "products",
			week: 1,
		}).state;
		const secondTick = productsSystem(synced, {
			phase: "products",
			week: 1,
		}).state;
		const observed = firstTick.products.items[0] as Record<string, unknown>;
		const repeated = secondTick.products.items[0] as Record<string, unknown>;

		expect(observed.satisfaction).toBeLessThan(70);
		expect(observed.churnRate).toBeGreaterThan(0);
		expect(observed.churnRate).toBeLessThanOrEqual(100);
		expect(observed.users).toBeLessThan(100);
		expect(firstTick).toEqual(secondTick);
		expect(repeated.satisfaction).toBe(observed.satisfaction);
	});

	it("keeps fresh, aging, and stale knowledge pressure visible in product outcomes", () => {
		const tickAt = (week: number) => {
			const state = readyState();
			state.company.hype = 10;
			const launched = launchProduct(state, "model_001", "chat").state;
			const model = launched.models.items[0];
			if (model === undefined) throw new Error("Expected launched model");
			model.knowledgeCutoff = 1;
			model.knowledgeFreshness = 100;
			launched.meta.week = week;
			return productsSystem(launched, { phase: "products", week }).state;
		};

		const fresh = tickAt(1).products.items[0] as Record<string, unknown>;
		const aging = tickAt(5).products.items[0] as Record<string, unknown>;
		const stale = tickAt(9).products.items[0] as Record<string, unknown>;

		expect(fresh.effectiveQuality).toBe(100);
		expect(aging.effectiveQuality).toBe(95);
		expect(stale.effectiveQuality).toBe(85);
		expect(fresh.satisfaction).toBeGreaterThan(aging.satisfaction as number);
		expect(aging.satisfaction).toBeGreaterThan(stale.satisfaction as number);
	});

	it("decays hype when an operating product cannot retain customers", () => {
		const state = readyState();
		state.company.hype = 10;
		const launched = launchProduct(state, "model_001", "chat").state;
		const model = launched.models.items[0];
		if (model?.estimates === undefined) throw new Error("Expected estimates");
		model.estimates.capability = { estimate: 20, lower: 0, upper: 40 };
		model.estimates.reliability = { estimate: 20, lower: 0, upper: 40 };
		model.estimates.efficiency = { estimate: 20, lower: 0, upper: 40 };
		launched.compute.capacity = 0;
		launched.compute = withRecomputedCompute(launched);
		const first = productsSystem(launched, { phase: "products", week: 1 });
		const second = productsSystem(first.state, { phase: "products", week: 2 });

		expect(first.state.company.hype).toBeLessThan(10);
		expect(second.state.company.hype).toBeLessThan(first.state.company.hype);
		expect(first.facts).toContainEqual(
			expect.objectContaining({
				kind: "product_pressure",
				freshnessStatus: "fresh",
			}),
		);
	});

	it("upgrades a legacy v7 product to the explicit pressure state", () => {
		const current = launchProduct(readyState(), "model_001", "chat").state;
		const legacy = JSON.parse(JSON.stringify(current)) as Record<
			string,
			unknown
		>;
		const products = legacy.products as {
			items: Array<Record<string, unknown>>;
		};
		const product = products.items[0];
		if (product === undefined) throw new Error("Expected legacy product");
		for (const field of [
			"price",
			"lastMargin",
			"cumulativeMargin",
			"satisfaction",
			"churnRate",
			"retiredUsers",
		]) {
			delete product[field];
		}
		const command = (legacy.commandLog as Array<Record<string, unknown>>).at(
			-1,
		);
		if (command === undefined) throw new Error("Expected launch command");
		delete command.price;
		(legacy.meta as Record<string, unknown>).schemaVersion = 7;

		const upgraded = upgradeGameState(legacy);
		const migrated = upgraded.products.items[0] as Record<string, unknown>;
		expect(GAME_STATE_SCHEMA_VERSION).toBe(10);
		expect(upgraded.meta.schemaVersion).toBe(10);
		expect(migrated.price).toBe(10);
		expect(migrated.satisfaction).toBe(100);
		expect(migrated.retiredUsers).toBe(0);
	});

	it("rejects pressure fields smuggled into a v7 save", () => {
		const current = launchProduct(readyState(), "model_001", "chat").state;
		const futureShaped = JSON.parse(JSON.stringify(current)) as Record<
			string,
			unknown
		>;
		const product = (
			futureShaped.products as { items: Array<Record<string, unknown>> }
		).items[0];
		if (product === undefined) throw new Error("Expected product");
		product.price = 10;
		(futureShaped.meta as Record<string, unknown>).schemaVersion = 7;
		expect(() => upgradeGameState(futureShaped)).toThrow(
			/v7.*unexpected|unexpected.*price/i,
		);
	});

	it("rejects forged pressure metrics and keeps public transitions immutable", () => {
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		const before = JSON.stringify(launched);
		const operated = productsSystem(launched, {
			phase: "products",
			week: 1,
		});
		expect(JSON.stringify(launched)).toBe(before);
		expect(operated.facts).toContainEqual(
			expect.objectContaining({ kind: "product_pressure" }),
		);

		const malformed = JSON.parse(JSON.stringify(operated.state)) as GameState;
		const product = malformed.products.items[0];
		if (product === undefined) throw new Error("Expected operated product");
		product.satisfaction = 101;
		expect(() => assertGameState(malformed)).toThrow(/satisfaction|100/i);
	});

	it("rejects duplicate retirement commands and forged product report references", () => {
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		const retired = retireProduct(launched, "product_001").state;

		const duplicate = JSON.parse(JSON.stringify(retired)) as GameState;
		duplicate.commandLog.push({
			id: "command_004",
			kind: "product_retire",
			week: 1,
			productId: "product_001",
		});
		expect(() => assertGameState(duplicate)).toThrow(
			/more than once|duplicate/i,
		);

		const forged = JSON.parse(JSON.stringify(retired)) as GameState;
		const retirementReport = forged.reports.items.find(
			(report) => report.fact.kind === "product_retired",
		);
		if (
			retirementReport === undefined ||
			retirementReport.fact.kind !== "product_retired"
		) {
			throw new Error("Expected product retirement report");
		}
		retirementReport.fact.productId = "product_missing";
		expect(() => assertGameState(forged)).toThrow(
			/unknown product|product fact/i,
		);
	});

	it("reports viral serving competition and exposes starvation without terminal loss", () => {
		const state = launchProduct(readyState(), "model_001", "chat").state;
		const team = state.teams.items[0];
		if (team === undefined) throw new Error("Expected founding team");
		state.models.items.push({
			id: "model_002",
			name: "Training-2",
			foundation: "fresh",
			status: "training",
			projectId: "project_999",
			family: "text",
			tier: "aggressive",
			scoreCeiling: 100,
		});
		state.projects.items.push({
			kind: "training",
			id: "project_999",
			teamId: team.id,
			modelId: "model_002",
			status: "active",
			progress: 0,
			duration: 4,
		});
		team.activeProjectId = "project_999";
		const product = state.products.items[0];
		if (product === undefined) throw new Error("Expected product");
		product.users = 100;
		state.company.hype = 100;
		state.compute.capacity = 12;
		const synced = { ...state, compute: withRecomputedCompute(state) };

		const operated = productsSystem(synced, {
			phase: "products",
			week: 1,
		});
		expect(operated.state.terminal.status).toBe("active");
		expect(operated.state.warnings).toContainEqual({
			code: "compute_conflict",
			severity: "warning",
		});
		expect(operated.facts).toContainEqual(
			expect.objectContaining({
				kind: "compute_conflict",
				viral: true,
				choice: "serving_throttled",
			}),
		);
		expect(
			operated.facts.some((fact) => fact.kind === "serving_throttled"),
		).toBe(true);

		const trained = trainingSystem(operated.state, {
			phase: "training",
			week: 2,
		});
		expect(trained.state.terminal.status).toBe("active");
		expect(trained.facts).toContainEqual(
			expect.objectContaining({ kind: "training_starved" }),
		);
		expect(
			trained.state.projects.items.find((item) => item.id === "project_999")
				?.progress,
		).toBe(0);
	});

	it("retires an operating product, releases serving compute, and records backlash", () => {
		const launched = launchProduct(readyState(), {
			modelId: "model_001",
			channel: "chat",
			price: 10,
		}).state;
		const before = JSON.stringify(launched);
		const result = retireProduct(launched, "product_001");
		const product = result.state.products.items[0] as Record<string, unknown>;

		expect(product).toMatchObject({
			status: "retired",
			users: 0,
			servingDemand: 0,
			retiredUsers: 10,
		});
		expect(result.state.compute.servingDemand).toBe(0);
		expect(result.state.compute.allocated).toBe(0);
		expect(result.state.company.trust).toBeLessThan(100);
		expect(result.state.company.hype).toBeLessThan(100);
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "product_retired",
				productId: "product_001",
				lostUsers: 10,
			}),
		);
		expect(JSON.stringify(launched)).toBe(before);
	});
});
