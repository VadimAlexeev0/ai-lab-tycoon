import { describe, expect, it } from "vitest";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import type { GameState } from "./state.js";

function cloneState(state: GameState): GameState {
	return JSON.parse(JSON.stringify(state)) as GameState;
}

function scoredModel(
	overrides: Partial<GameState["models"]["items"][number]> = {},
) {
	return {
		id: "model_001",
		name: "Aurora-1",
		foundation: "fresh" as const,
		status: "ready" as const,
		projectId: null,
		family: "text" as const,
		tier: "lean" as const,
		...overrides,
	};
}

function terminalContributors() {
	return [
		{ kind: "resource_changed" as const, impact: -10, week: 1, index: 0 },
		{ kind: "rival_progressed" as const, impact: 5, week: 1, index: 1 },
		{ kind: "rival_progressed" as const, impact: 1, week: 1, index: 2 },
	];
}

describe("assertGameState domain validation", () => {
	it("rejects unsafe persisted resource integers", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = Number.MAX_SAFE_INTEGER + 1;

		expect(() => assertGameState(state)).toThrow(/safe integer/i);

		const computeState = startRun({ companyName: "Acme Labs" }, 42);
		computeState.compute.capacity = Number.MAX_SAFE_INTEGER + 1;
		expect(() => assertGameState(computeState)).toThrow(/safe integer/i);

		const productState = startRun({ companyName: "Acme Labs" }, 42);
		productState.models.items = [scoredModel({ status: "designing" })];
		productState.products.items = [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_001",
				status: "planned",
				users: Number.MAX_SAFE_INTEGER + 1,
			},
		];
		expect(() => assertGameState(productState)).toThrow(/safe integer/i);
	});

	it("allows negative cash only for an explicitly marked transition", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = -1;

		expect(() => assertGameState(state)).toThrow(/cash/i);
		expect(() =>
			assertGameState(state, { allowNegativeCash: true }),
		).not.toThrow();
	});

	it("rejects stale derived compute reservations", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.trainingDemand = 1;

		expect(() => assertGameState(state)).toThrow(
			/training demand|reservation|compute/i,
		);
	});

	it("rejects duplicate research prerequisites", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_keystone",
		);
		if (node === undefined) throw new Error("Expected the keystone node");
		node.prerequisites = ["text_models_principles", "text_models_principles"];

		expect(() => assertGameState(state)).toThrow(
			/duplicate|repeat.*prerequisite/i,
		);
	});

	it("requires completed research prerequisites for completed nodes", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_keystone",
		);
		if (node === undefined) throw new Error("Expected the keystone node");
		node.status = "completed";

		expect(() => assertGameState(state)).toThrow(
			/prerequisite.*completed|completed.*prerequisite/i,
		);
	});

	it("does not allow the current era to outrun its keystone", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.era = "assistant";
		state.research.currentEra = "assistant";

		expect(() => assertGameState(state)).toThrow(/era|keystone|unlock/i);

		const futureNode = startRun({ companyName: "Acme Labs" }, 42);
		const assistantNode = futureNode.research.nodes.find(
			(node) => node.era === "assistant",
		);
		if (assistantNode === undefined)
			throw new Error("Expected an Assistant node");
		assistantNode.status = "available";
		assistantNode.prerequisites = [];
		expect(() => assertGameState(futureNode)).toThrow(/era|unlock/i);
	});

	it("cross-checks terminal reasons against company resources", () => {
		const cashState = startRun({ companyName: "Acme Labs" }, 42);
		cashState.company.cash = 1;
		cashState.terminal = {
			status: "lost",
			reason: "cash_depleted",
			frontierReached: false,
			contributors: terminalContributors(),
		};
		expect(() => assertGameState(cashState)).toThrow(
			/cash.*depleted|terminal.*cash/i,
		);

		const trustState = startRun({ companyName: "Acme Labs" }, 42);
		trustState.company.trust = 1;
		trustState.terminal = {
			status: "lost",
			reason: "trust_collapsed",
			frontierReached: false,
			contributors: terminalContributors(),
		};
		expect(() => assertGameState(trustState)).toThrow(
			/trust.*collapsed|terminal.*trust/i,
		);
	});

	it("requires model family and tier after designing", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const model = scoredModel() as GameState["models"]["items"][number];
		delete model.family;
		delete model.tier;
		state.models.items = [model];

		expect(() => assertGameState(state)).toThrow(/family|tier/i);
	});

	it("requires true scores and estimates to be present together", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.models.items = [
			scoredModel({
				trueScores: {
					capability: 50,
					coding: 50,
					reliability: 50,
					safety: 50,
					efficiency: 50,
					multimodal: 50,
				},
			}),
		];

		expect(() => assertGameState(state)).toThrow(/true scores|estimates/i);

		const inverse = cloneState(state);
		const model = inverse.models.items[0];
		if (model === undefined) throw new Error("Expected the model fixture");
		delete model.trueScores;
		model.estimates = {
			capability: { estimate: 50, lower: 40, upper: 60 },
			coding: { estimate: 50, lower: 40, upper: 60 },
			reliability: { estimate: 50, lower: 40, upper: 60 },
			safety: { estimate: 50, lower: 40, upper: 60 },
			efficiency: { estimate: 50, lower: 40, upper: 60 },
			multimodal: { estimate: 50, lower: 40, upper: 60 },
		};
		expect(() => assertGameState(inverse)).toThrow(/true scores|estimates/i);
	});

	it("rejects operating products whose model is shelved", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.models.items = [scoredModel({ status: "shelved" })];
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
				effectiveQuality: 50,
			},
		];
		state.compute.servingDemand = 10;
		state.compute.allocated = 10;

		expect(() => assertGameState(state)).toThrow(/shelved|operating|launched/i);
	});
});
