import { describe, expect, it } from "vitest";

import type { Model } from "./components/models.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import {
	ASSISTANT_MODELS_KEYSTONE_ID,
	RESEARCH_NODES,
} from "./data/research.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import { launchProduct } from "./products.js";
import { researchSystem } from "./systems/research.js";

function completeEra(
	state: ReturnType<typeof startRun>,
	era: "text" | "assistant" | "multimodal",
): void {
	for (const node of state.research.nodes) {
		if (node.era === era) node.status = "completed";
	}
}

function scoredModel(
	id: string,
	family: "text" | "assistant" | "multimodal",
): Model {
	return {
		id,
		name: `${family}-${id}`,
		foundation: "fresh",
		status: "ready",
		projectId: null,
		family,
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
			multimodal: 100,
		},
		estimates: {
			capability: { estimate: 100, lower: 80, upper: 100 },
			coding: { estimate: 100, lower: 80, upper: 100 },
			reliability: { estimate: 100, lower: 80, upper: 100 },
			safety: { estimate: 100, lower: 80, upper: 100 },
			efficiency: { estimate: 100, lower: 80, upper: 100 },
			multimodal: { estimate: 100, lower: 80, upper: 100 },
		},
	};
}

function withReadyModel(
	state: ReturnType<typeof startRun>,
	family: "text" | "assistant" | "multimodal",
	id = "model_001",
): ReturnType<typeof startRun> {
	state.models.items = [...state.models.items, scoredModel(id, family)];
	state.counters.model = state.models.items.length + 1;
	return state;
}

function launchChatModel(
	state: ReturnType<typeof startRun>,
	modelId = "model_001",
): ReturnType<typeof startRun> {
	state.company.hype = 100;
	return launchProduct(state, modelId, "chat").state;
}

function launchedTextState(): ReturnType<typeof startRun> {
	return launchChatModel(
		withReadyModel(startRun({ companyName: "Acme Labs" }, 42), "text"),
	);
}

function launchedAssistantState(): ReturnType<typeof startRun> {
	let state = launchedTextState();
	completeEra(state, "text");
	state = researchSystem(state, { phase: "research", week: 2 }).state;
	completeEra(state, "assistant");
	state = withReadyModel(state, "assistant", "model_002");
	return launchChatModel(state, "model_002");
}

function completeResearchPrerequisites(
	state: ReturnType<typeof startRun>,
	nodeId: string,
	visiting = new Set<string>(),
): void {
	if (visiting.has(nodeId)) {
		throw new Error(`Cycle in test fixture at ${nodeId}`);
	}
	const definition = RESEARCH_NODES.find((node) => node.id === nodeId);
	const node = state.research.nodes.find(
		(candidate) => candidate.id === nodeId,
	);
	if (definition === undefined || node === undefined) {
		throw new Error(`Expected research fixture node ${nodeId}`);
	}
	visiting.add(nodeId);
	for (const prerequisiteId of definition.prerequisites) {
		completeResearchPrerequisites(state, prerequisiteId, visiting);
	}
	visiting.delete(nodeId);
	node.status = "completed";
}

describe("shipped-generation era gates", () => {
	it("does not advance from Text with only the completed Text keystone", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		completeEra(state, "text");

		const result = researchSystem(state, {
			phase: "research",
			week: 2,
		});

		expect(result.state.research.currentEra).toBe("text");
		expect(result.state.meta.era).toBe("text");
	});

	it("does not treat a trained and ready Text model as shipped proof", () => {
		const state = withReadyModel(
			startRun({ companyName: "Acme Labs" }, 42),
			"text",
		);
		completeEra(state, "text");

		const result = researchSystem(state, { phase: "research", week: 2 });

		expect(result.state.research.currentEra).toBe("text");
	});

	it("rejects a launched model without retained true scores and estimates", () => {
		const state = launchedTextState();
		const model = state.models.items[0];
		if (model === undefined) throw new Error("Expected launched Text model");
		delete model.trueScores;
		delete model.estimates;

		expect(() => assertGameState(state)).toThrow(
			/launched.*true scores.*estimates|true scores.*estimates.*launched/i,
		);
	});

	it("advances with a valid launched scored model after its family unlock completes", () => {
		const state = launchedTextState();
		completeEra(state, "text");

		const result = researchSystem(state, { phase: "research", week: 2 });

		expect(result.state.research.currentEra).toBe("assistant");
		expect(result.state.meta.era).toBe("assistant");
	});

	it("keeps a ready model valid without retained scores or estimates", () => {
		const state = withReadyModel(
			startRun({ companyName: "Acme Labs" }, 42),
			"text",
		);
		const model = state.models.items[0];
		if (model === undefined) throw new Error("Expected ready Text model");
		delete model.trueScores;
		delete model.estimates;

		expect(() => assertGameState(state)).not.toThrow();
	});

	it("does not let a shipped Text model bypass its Text keystone", () => {
		const state = launchedTextState();

		const result = researchSystem(state, { phase: "research", week: 2 });

		expect(result.state.research.currentEra).toBe("text");
	});

	it("advances exactly once after a normal Text launch and retains launch evidence", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		completeEra(state, "text");
		const launched = launchChatModel(withReadyModel(state, "text"));

		expect(launched.models.items[0]?.status).toBe("launched");
		expect(launched.products.items[0]).toMatchObject({
			modelId: "model_001",
			status: "operating",
		});
		expect(launched.reports.items.map((report) => report.fact)).toContainEqual(
			expect.objectContaining({
				kind: "product_launched",
				channel: "chat",
			}),
		);

		const first = researchSystem(launched, {
			phase: "research",
			week: 2,
		}).state;
		const second = researchSystem(first, {
			phase: "research",
			week: 3,
		}).state;

		expect(first.research.currentEra).toBe("assistant");
		expect(first.meta.era).toBe("assistant");
		expect(second.research.currentEra).toBe("assistant");
		expect(second.meta.era).toBe("assistant");
	});

	it("rejects a future-generation model before it can become Text proof", () => {
		const state = withReadyModel(
			startRun({ companyName: "Acme Labs" }, 42),
			"assistant",
		);

		expect(() => assertGameState(state)).toThrow(/era|generation|family/i);
	});

	it("rejects a launched model with no retained shipped product", () => {
		const state = withReadyModel(
			startRun({ companyName: "Acme Labs" }, 42),
			"text",
		);
		const model = state.models.items[0];
		if (model === undefined) throw new Error("Expected Text model");
		model.status = "launched";

		expect(() => assertGameState(state)).toThrow(/launched|shipped|product/i);
	});

	it("does not accept shipped proof while the model family unlock is locked", () => {
		let state = launchedTextState();
		completeEra(state, "text");
		state = researchSystem(state, { phase: "research", week: 2 }).state;
		state = withReadyModel(state, "assistant", "model_002");
		state = launchChatModel(state, "model_002");
		completeResearchPrerequisites(state, ASSISTANT_MODELS_KEYSTONE_ID);

		const familyUnlock = state.research.nodes.find(
			(node) => node.id === "assistant_models_reasoning",
		);
		if (familyUnlock === undefined) {
			throw new Error("Expected Assistant family unlock node");
		}
		expect(familyUnlock.status).toBe("locked");

		const result = researchSystem(state, { phase: "research", week: 3 });

		expect(result.state.research.currentEra).toBe("assistant");
		expect(result.state.meta.era).toBe("assistant");
	});

	it("applies the same shipped-generation gate from Assistant to Multimodal", () => {
		const state = launchedAssistantState();

		const result = researchSystem(state, { phase: "research", week: 3 });

		expect(result.state.research.currentEra).toBe("multimodal");
		expect(result.state.meta.era).toBe("multimodal");
	});

	it("does not move the era backward when a proof product is retired", () => {
		const state = launchedTextState();
		completeEra(state, "text");
		const advanced = researchSystem(state, {
			phase: "research",
			week: 2,
		}).state;
		const proofProduct = advanced.products.items[0];
		if (proofProduct === undefined) throw new Error("Expected proof product");
		proofProduct.status = "paused";
		proofProduct.servingDemand = 0;
		advanced.compute = withRecomputedCompute(advanced);

		const result = researchSystem(advanced, {
			phase: "research",
			week: 3,
		});

		expect(result.state.research.currentEra).toBe("assistant");
		expect(result.state.meta.era).toBe("assistant");
	});
});
