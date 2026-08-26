import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";
import {
	effectiveProductQuality,
	isProductLaunchEligible,
	launchProduct,
	rivalLaunchPressure,
} from "./products.js";
import type { GameState } from "./state.js";

function readyState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.hype = 100;
	state.company.trust = 100;
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

function assistantEraState(): GameState {
	const state = readyState();
	state.meta.era = "assistant";
	state.research.currentEra = "assistant";
	return state;
}

function setEstimate(
	state: GameState,
	dimension: "capability" | "coding" | "reliability" | "safety",
	estimate: number,
): GameState {
	const model = state.models.items[0];
	if (model?.estimates === undefined) {
		throw new Error("Expected model estimates");
	}
	model.estimates = {
		...model.estimates,
		[dimension]: { estimate, lower: 0, upper: 100 },
	};
	return state;
}

describe("product launch gates", () => {
	it("enforces every chat threshold including its exact boundary value", () => {
		const tuning = BALANCE.productChannels.chat;
		const cases = [
			{ factor: "trust", at: tuning.minimumTrust },
			{ factor: "hype", at: tuning.minimumHype },
			{ factor: "capability", at: tuning.minimumCapability },
			{ factor: "reliability", at: tuning.minimumReliability },
		] as const;

		for (const testCase of cases) {
			const state = readyState();
			if (
				testCase.factor === "capability" ||
				testCase.factor === "reliability"
			) {
				setEstimate(state, testCase.factor, testCase.at - 1);
				expect(() => launchProduct(state, "model_001", "chat")).toThrow(
					/estimate/i,
				);
				setEstimate(state, testCase.factor, testCase.at);
				expect(() => launchProduct(state, "model_001", "chat")).not.toThrow();
			} else {
				state.company[testCase.factor] = testCase.at - 1;
				expect(() => launchProduct(state, "model_001", "chat")).toThrow(
					new RegExp(`${testCase.factor}`, "i"),
				);
				state.company[testCase.factor] = testCase.at;
				expect(() => launchProduct(state, "model_001", "chat")).not.toThrow();
			}
		}
	});

	it("requires exactly the launch cost in cash and changes nothing on failure", () => {
		const tuning = BALANCE.productChannels.chat;
		const state = readyState();
		state.company.cash = tuning.launchCost - 1;
		const before = JSON.stringify(state);
		expect(() => launchProduct(state, "model_001", "chat")).toThrow(
			/insufficient cash|cost/i,
		);
		expect(JSON.stringify(state)).toBe(before);
		expect(state.products.items).toHaveLength(0);

		state.company.cash = tuning.launchCost;
		const result = launchProduct(state, "model_001", "chat");
		expect(result.state.products.items[0]?.status).toBe("operating");
		expect(result.state.company.cash).toBe(0);
	});

	it("enforces the developer_api score and resource thresholds", () => {
		const tuning = BALANCE.productChannels.developer_api;
		const scoreGates: Record<"capability" | "coding" | "reliability", number> =
			{
				capability: tuning.minimumCapability,
				coding: tuning.minimumCoding,
				reliability: tuning.minimumReliability,
			};
		for (const [dimension, minimum] of Object.entries(scoreGates) as Array<
			[keyof typeof scoreGates, number]
		>) {
			if (minimum === 0) continue;
			const state = setEstimate(readyState(), dimension, minimum - 1);
			expect(() => launchProduct(state, "model_001", "developer_api")).toThrow(
				/estimate/i,
			);
		}

		const tooLowTrust = readyState();
		tooLowTrust.company.trust = tuning.minimumTrust - 1;
		expect(() =>
			launchProduct(tooLowTrust, "model_001", "developer_api"),
		).toThrow(/trust/i);

		const tooLowHype = readyState();
		tooLowHype.company.hype = tuning.minimumHype - 1;
		expect(() =>
			launchProduct(tooLowHype, "model_001", "developer_api"),
		).toThrow(/hype/i);

		expect(() =>
			launchProduct(readyState(), "model_001", "developer_api"),
		).not.toThrow();
	});

	it("blocks enterprise until the Assistant era and enforces its gates", () => {
		const textEra = readyState();
		expect(() => launchProduct(textEra, "model_001", "enterprise")).toThrow(
			/era/i,
		);
		expect(isProductLaunchEligible(textEra, "model_001", "enterprise")).toBe(
			false,
		);

		const tuning = BALANCE.productChannels.enterprise;
		const scoreGates: Record<"capability" | "reliability" | "safety", number> =
			{
				capability: tuning.minimumCapability,
				reliability: tuning.minimumReliability,
				safety: tuning.minimumSafety,
			};
		for (const [dimension, minimum] of Object.entries(scoreGates) as Array<
			[keyof typeof scoreGates, number]
		>) {
			if (minimum === 0) continue;
			const state = setEstimate(assistantEraState(), dimension, minimum - 1);
			expect(() => launchProduct(state, "model_001", "enterprise")).toThrow(
				/estimate/i,
			);
		}

		const lowTrust = assistantEraState();
		lowTrust.company.trust = tuning.minimumTrust - 1;
		expect(() => launchProduct(lowTrust, "model_001", "enterprise")).toThrow(
			/trust/i,
		);

		expect(() =>
			launchProduct(assistantEraState(), "model_001", "enterprise"),
		).not.toThrow();
	});

	it("accepts the api alias for developer_api and rejects duplicate channels", () => {
		const viaAlias = launchProduct(readyState(), "model_001", "api");
		expect(viaAlias.state.products.items[0]?.channel).toBe("developer_api");

		expect(() =>
			launchProduct(readyState(), "model_001", "developer_api"),
		).not.toThrow();
		const launched = launchProduct(readyState(), "model_001", "chat").state;
		expect(() => launchProduct(launched, "model_001", "chat")).toThrow(
			/already|product/i,
		);
	});

	it("mirrors the eligibility predicate at every launch boundary", () => {
		const tuning = BALANCE.productChannels.chat;
		const belowTrust = readyState();
		belowTrust.company.trust = tuning.minimumTrust - 1;
		expect(isProductLaunchEligible(belowTrust, "model_001", "chat")).toBe(
			false,
		);

		const belowScore = setEstimate(
			readyState(),
			"capability",
			tuning.minimumCapability - 1,
		);
		expect(isProductLaunchEligible(belowScore, "model_001", "chat")).toBe(
			false,
		);

		const lowCash = readyState();
		lowCash.company.cash = tuning.launchCost - 1;
		expect(isProductLaunchEligible(lowCash, "model_001", "chat")).toBe(false);

		expect(isProductLaunchEligible(readyState(), "model_001", "chat")).toBe(
			true,
		);
		expect(
			isProductLaunchEligible(assistantEraState(), "model_001", "enterprise"),
		).toBe(true);
	});

	it("applies rival launch pressure at every 25-point progress band", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const base = BALANCE.productChannels.chat.minimumHype;
		for (const [progress, expected] of [
			[0, base],
			[24, base],
			[25, base + 1],
			[49, base + 1],
			[50, base + 2],
			[74, base + 2],
			[75, base + 3],
			[99, base + 3],
			[100, base + 4],
		] as const) {
			const first = state.rivals.items[0];
			const second = state.rivals.items[1];
			if (first === undefined || second === undefined) {
				throw new Error("Expected opening rivals");
			}
			first.progress = progress;
			second.progress = 0;
			expect(rivalLaunchPressure(state, base), `${progress}`).toBe(expected);
		}
	});

	it("computes channel quality from the channel quality dimensions only", () => {
		const chatState = readyState();
		const chatModel = chatState.models.items[0];
		if (chatModel === undefined) throw new Error("Expected model");
		expect(effectiveProductQuality(chatModel, "chat")).toBe(100);

		const mixed = readyState();
		const mixedModel = mixed.models.items[0];
		if (mixedModel?.estimates === undefined) throw new Error("Expected model");
		mixedModel.estimates.capability = { estimate: 80, lower: 60, upper: 100 };
		mixedModel.estimates.coding = { estimate: 10, lower: 0, upper: 20 };
		expect(effectiveProductQuality(mixedModel, "chat")).toBe(90);
		expect(effectiveProductQuality(mixedModel, "developer_api")).toBe(63);

		const noEstimates = readyState();
		const bareModel = noEstimates.models.items[0];
		if (bareModel === undefined) throw new Error("Expected model");
		delete (bareModel as Partial<typeof bareModel>).estimates;
		expect(() => effectiveProductQuality(bareModel, "chat")).toThrow(
			/estimates/i,
		);
	});

	it("rejects a model that is not ready or launched", () => {
		const state = readyState();
		const model = state.models.items[0];
		if (model === undefined) throw new Error("Expected model");
		model.status = "designing";
		expect(() => launchProduct(state, "model_001", "chat")).toThrow(
			/ready|launched/i,
		);
	});

	it("accepts the request-object overload", () => {
		const result = launchProduct(readyState(), {
			modelId: "model_001",
			channel: "chat",
		});
		expect(result.state.products.items[0]?.channel).toBe("chat");
	});
});
