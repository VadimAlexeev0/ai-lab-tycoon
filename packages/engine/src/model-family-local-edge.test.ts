import { describe, expect, it } from "vitest";

import { canonicalEqual } from "./canonical.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import { MODEL_FAMILIES, type ModelFamilyId } from "./data/model-families.js";
import {
	assertResearchDefinitions,
	LOCAL_EDGE_INFERENCE_ID,
	RESEARCH_NODES,
	type ResearchDefinition,
} from "./data/research.js";
import type { ModelDesignSpec } from "./index.js";
import {
	advanceWeek,
	applyDecision,
	applyProductResume,
	assertGameState,
	assignProject,
	buyCompute,
	deserializeGameState,
	designModel,
	launchProduct,
	replayCommandLog,
	serializeGameState,
	startRun,
} from "./index.js";
import { generateTrueScores } from "./model-design.js";
import { selectVisibleModels } from "./selectors.js";
import type { GameState } from "./state.js";
import { productsSystem } from "./systems/products.js";

const LOCAL_EDGE_FAMILY_ID = "local_edge" as const satisfies ModelFamilyId;
const LOCAL_EDGE_UNLOCK_ID = LOCAL_EDGE_INFERENCE_ID;

const LOCAL_EDGE_SPEC = {
	name: "Pocket-1",
	family: LOCAL_EDGE_FAMILY_ID,
	foundation: "fresh" as const,
	tier: "standard" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

type TestFamily = "text" | typeof LOCAL_EDGE_FAMILY_ID;

function scores() {
	return {
		capability: 80,
		coding: 80,
		reliability: 80,
		safety: 80,
		efficiency: 80,
		multimodal: 80,
	};
}

function estimates() {
	return {
		capability: { estimate: 80, lower: 60, upper: 100 },
		coding: { estimate: 80, lower: 60, upper: 100 },
		reliability: { estimate: 80, lower: 60, upper: 100 },
		safety: { estimate: 80, lower: 60, upper: 100 },
		efficiency: { estimate: 80, lower: 60, upper: 100 },
		multimodal: { estimate: 80, lower: 60, upper: 100 },
	};
}

function completePrerequisites(state: GameState, nodeId: string): void {
	const definition = RESEARCH_NODES.find(
		(node) => (node.id as string) === nodeId,
	);
	const node = state.research.nodes.find(
		(candidate) => candidate.id === nodeId,
	);
	if (definition === undefined || node === undefined) {
		throw new Error(`Expected research fixture node ${nodeId}`);
	}
	for (const prerequisite of definition.prerequisites) {
		completePrerequisites(state, prerequisite);
	}
	node.status = "completed";
}

function assistantEraState(testFamily: TestFamily): GameState {
	const state = startRun({ companyName: "Edge Labs" }, 42);
	for (const node of state.research.nodes) {
		if (node.era === "text") node.status = "completed";
	}
	state.meta.era = "assistant";
	state.research.currentEra = "assistant";
	if (testFamily === LOCAL_EDGE_FAMILY_ID) {
		completePrerequisites(state, LOCAL_EDGE_UNLOCK_ID);
	}

	state.models.items = [
		{
			id: "model_001",
			name: "Text-Proof",
			foundation: "fresh",
			status: "launched",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			trueScores: scores(),
			estimates: estimates(),
		},
		{
			id: "model_002",
			name: "Edge-Candidate",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			family: testFamily,
			tier: "standard",
			scoreCeiling:
				testFamily === LOCAL_EDGE_FAMILY_ID
					? BALANCE.modelTiers.standard.scoreCeiling - 12
					: BALANCE.modelTiers.standard.scoreCeiling,
			trueScores: scores(),
			estimates: estimates(),
		},
	];
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
			effectiveQuality: 80,
			price: 10,
			lastMargin: 0,
			cumulativeMargin: 0,
			satisfaction: 100,
			churnRate: 0,
			retiredUsers: 0,
		},
	];
	state.counters.model = 3;
	state.counters.product = 2;
	state.company.hype = 100;
	state.company.trust = 100;
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

function resolveAllDecisions(state: GameState): GameState {
	let current = state;
	for (let guard = 0; guard < 128; guard += 1) {
		const decision =
			current.decisions.pending.find((candidate) => candidate.blocking) ??
			current.decisions.pending[0];
		if (decision === undefined) return current;

		switch (decision.kind) {
			case "launch":
				current =
					decision.channel === undefined || decision.channel === "chat"
						? applyDecision(current, {
								kind: "launch",
								decisionId: decision.id,
								channel: "chat",
								...(decision.price === undefined
									? {}
									: { price: decision.price }),
							}).state
						: applyDecision(current, {
								kind: "shelve",
								decisionId: decision.id,
							}).state;
				break;
			case "evaluation":
				current = applyDecision(current, {
					kind: "evaluate",
					decisionId: decision.id,
					evaluation: decision.evaluation,
				}).state;
				break;
			case "funding":
				current = applyDecision(current, {
					kind: "funding",
					decisionId: decision.id,
					round: decision.round,
					accept: true,
				}).state;
				break;
			case "incident":
				current = applyDecision(current, {
					kind: "incident",
					decisionId: decision.id,
					response: "disclose",
				}).state;
				break;
			case "crisis":
				current = applyDecision(current, {
					kind: "crisis",
					decisionId: decision.id,
					crisisId: decision.crisisId,
					choice: "investigate",
				}).state;
				break;
			case "paradigm": {
				const paradigmId = decision.choices[0];
				if (paradigmId === undefined) {
					throw new Error("Expected a paradigm choice");
				}
				current = applyDecision(current, {
					kind: "paradigm",
					decisionId: decision.id,
					paradigmId,
				}).state;
				break;
			}
			case "publication":
				current = applyDecision(current, {
					kind: "publication",
					decisionId: decision.id,
					nodeId: decision.nodeId,
					outcome: "publish",
				}).state;
				break;
		}
	}
	throw new Error("Replay fixture exceeded its decision-resolution guard");
}

function completeResearchNode(state: GameState, nodeId: string): GameState {
	let current = state;
	const visiting = new Set<string>();

	const complete = (
		candidateState: GameState,
		candidateId: string,
	): GameState => {
		const definition = RESEARCH_NODES.find(
			(node) => (node.id as string) === candidateId,
		);
		if (definition === undefined) {
			throw new Error(`Expected research node ${candidateId}`);
		}
		const node = candidateState.research.nodes.find(
			(item) => item.id === candidateId,
		);
		if (node?.status === "completed") return candidateState;
		if (visiting.has(candidateId)) {
			throw new Error(`Research fixture cycle at ${candidateId}`);
		}
		visiting.add(candidateId);
		let next = candidateState;
		for (const prerequisite of definition.prerequisites) {
			next = complete(next, prerequisite);
		}
		visiting.delete(candidateId);

		for (let guard = 0; guard < 128; guard += 1) {
			next = resolveAllDecisions(next);
			const currentNode = next.research.nodes.find(
				(item) => item.id === candidateId,
			);
			if (currentNode?.status === "completed") return next;
			const project = next.projects.items.find(
				(item) =>
					item.kind === "research" &&
					item.nodeId === candidateId &&
					item.status === "available",
			);
			if (project === undefined) {
				next = resolveAllDecisions(advanceWeek(next).state);
				continue;
			}
			const team = next.teams.items.find(
				(item) => item.activeProjectId === null,
			);
			if (team === undefined || currentNode === undefined) {
				throw new Error(
					`Expected an idle team for research node ${candidateId}`,
				);
			}
			while (next.company.insight < currentNode.insightCost) {
				next = resolveAllDecisions(advanceWeek(next).state);
			}
			next = assignProject(next, team.id, project.id).state;
			for (let progressGuard = 0; progressGuard < 8; progressGuard += 1) {
				next = resolveAllDecisions(advanceWeek(next).state);
				const progressedProject = next.projects.items.find(
					(item) => item.id === project.id,
				);
				if (progressedProject?.status !== "active") break;
			}
		}
		throw new Error(`Research fixture stalled at ${candidateId}`);
	};

	current = complete(current, nodeId);
	return current;
}

function trainAndLaunch(state: GameState, spec: ModelDesignSpec): GameState {
	let current = designModel(state, spec).state;
	for (let guard = 0; guard < 16; guard += 1) {
		current = resolveAllDecisions(current);
		const model = current.models.items.find((item) => item.name === spec.name);
		if (model?.status === "launched") return current;
		if (
			current.compute.trainingDemand + current.compute.servingDemand >
				current.compute.capacity &&
			current.company.cash >= BALANCE.computePurchaseCost
		) {
			current = buyCompute(current).state;
			continue;
		}
		current = advanceWeek(current).state;
	}
	throw new Error(`Expected ${spec.name} to train and launch`);
}

const TEXT_REPLAY_SPEC = {
	name: "Text-Replay",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function localEdgeReplayRun(): GameState {
	let current = startRun({ companyName: "Local Edge Replay" }, 42);
	// This fixture uses the documented replay initial-cash override so the
	// command log remains focused on the model-family path.
	current.company.cash = 10_000;
	for (const node of RESEARCH_NODES.filter(
		(candidate) => candidate.era === "text",
	)) {
		current = completeResearchNode(current, node.id);
	}
	current = trainAndLaunch(current, TEXT_REPLAY_SPEC);
	current = resolveAllDecisions(advanceWeek(current).state);
	current = completeResearchNode(current, LOCAL_EDGE_UNLOCK_ID);
	return trainAndLaunch(current, LOCAL_EDGE_SPEC);
}

describe("local/edge model family", () => {
	it("unlocks through research and trades score ceiling for lower serving compute", () => {
		const family = MODEL_FAMILIES.find(
			(candidate) => candidate.id === LOCAL_EDGE_FAMILY_ID,
		);
		expect(family).toMatchObject({
			id: LOCAL_EDGE_FAMILY_ID,
			allowedEras: ["assistant"],
			unlockedByResearchNodeId: LOCAL_EDGE_UNLOCK_ID,
			servingComputePerUserPercent: 50,
			scoreCeilingAdjustment: -12,
		});

		const unlock = RESEARCH_NODES.find(
			(node) => node.id === LOCAL_EDGE_UNLOCK_ID,
		);
		expect(unlock).toMatchObject({
			era: "assistant",
			category: "efficiency_school",
			branch: "infrastructure",
			status: "locked",
			prerequisites: expect.arrayContaining([
				"text_models_keystone",
				"int4_quantization",
			]),
		});

		const designed = designModel(
			assistantEraState(LOCAL_EDGE_FAMILY_ID),
			LOCAL_EDGE_SPEC,
		).state;
		const model = designed.models.items.at(-1);
		if (model === undefined || family === undefined) {
			throw new Error("Expected the designed local/edge model");
		}
		const existingFamilies = MODEL_FAMILIES.filter(
			(candidate) => candidate.id === "text" || candidate.id === "assistant",
		);
		expect(
			existingFamilies.every(
				(candidate) =>
					family.scoreCeilingAdjustment < candidate.scoreCeilingAdjustment &&
					family.servingComputePerUserPercent <
						candidate.servingComputePerUserPercent,
			),
		).toBe(true);
		expect(model.scoreCeiling).toBe(
			BALANCE.modelTiers.standard.scoreCeiling + family.scoreCeilingAdjustment,
		);
		expect(model.scoreCeiling).toBeLessThan(
			BALANCE.modelTiers.standard.scoreCeiling,
		);

		const localState = launchProduct(
			assistantEraState(LOCAL_EDGE_FAMILY_ID),
			"model_002",
			"developer_api",
		).state;
		const textState = launchProduct(
			assistantEraState("text"),
			"model_002",
			"developer_api",
		).state;
		const localProduct = localState.products.items.find(
			(product) => product.modelId === "model_002",
		);
		const textProduct = textState.products.items.find(
			(product) => product.modelId === "model_002",
		);
		if (localProduct === undefined || textProduct === undefined) {
			throw new Error("Expected launched comparison products");
		}
		expect(localProduct.servingDemand).toBeLessThan(
			textProduct.servingDemand ?? 0,
		);
		expect(computeReservations(localState).servingDemand).toBe(
			(localState.products.items[0]?.servingDemand ?? 0) +
				(localProduct.servingDemand ?? 0),
		);
	});

	it("keeps the local/edge ceiling bound in direct score generation", () => {
		const generated = generateTrueScores(
			startRun({ companyName: "Scores" }, 42).rng,
			{
				id: "model_001",
				name: "Pocket-1",
				foundation: "fresh",
				status: "training",
				projectId: null,
				family: LOCAL_EDGE_FAMILY_ID,
				tier: "standard",
				dataMix: { general: 60, code: 30, multimodal: 10 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			},
		);

		expect(
			Math.max(...Object.values(generated.trueScores)),
		).toBeLessThanOrEqual(BALANCE.modelTiers.standard.scoreCeiling - 12);
		expect(JSON.stringify(generated.estimates)).not.toContain("trueScores");
	});

	it("rejects an unavailable family before unlock and malformed unlock references", () => {
		expect(() =>
			designModel(assistantEraState("text"), LOCAL_EDGE_SPEC),
		).toThrow(/completed research node.*local_edge_inference/i);

		const malformed = RESEARCH_NODES.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})) as ResearchDefinition[];
		const localEdgeNode = malformed.find(
			(node) => node.id === LOCAL_EDGE_UNLOCK_ID,
		);
		if (localEdgeNode === undefined) {
			throw new Error("Expected the local/edge research node");
		}
		(localEdgeNode.prerequisites as string[]).push(
			"missing_local_edge_prerequisite",
		);
		expect(() => assertResearchDefinitions(malformed)).toThrow(
			/unknown.*prerequisite/i,
		);
	});

	it("validates local/edge saves while rejecting unknown families and fields", () => {
		const state = assistantEraState(LOCAL_EDGE_FAMILY_ID);
		expect(() => assertGameState(state)).not.toThrow();

		const roundTrip = deserializeGameState(serializeGameState(state));
		expect(canonicalEqual(roundTrip, state)).toBe(true);
		expect(JSON.stringify(selectVisibleModels(state))).not.toContain(
			"trueScores",
		);

		const unknownFamily = JSON.parse(JSON.stringify(state)) as GameState;
		const unknownFamilyModel = unknownFamily.models.items[1];
		if (unknownFamilyModel === undefined) {
			throw new Error("Expected the local/edge model fixture");
		}
		(unknownFamilyModel as unknown as Record<string, unknown>).family =
			"future_family";
		expect(() => assertGameState(unknownFamily)).toThrow(/model family/i);

		const unknownField = JSON.parse(JSON.stringify(state)) as GameState;
		const unknownFieldModel = unknownField.models.items[1];
		if (unknownFieldModel === undefined) {
			throw new Error("Expected the local/edge model fixture");
		}
		(unknownFieldModel as unknown as Record<string, unknown>).futureField =
			true;
		expect(() => assertGameState(unknownField)).toThrow(/unexpected field/i);
	});

	it("does not mutate the state while designing a local/edge model", () => {
		const state = assistantEraState(LOCAL_EDGE_FAMILY_ID);
		const before = JSON.parse(JSON.stringify(state)) as GameState;

		designModel(state, LOCAL_EDGE_SPEC);

		expect(state).toEqual(before);
	});

	it("keeps local/edge serving demand lower through weekly product pressure", () => {
		const local = productsSystem(
			launchProduct(
				assistantEraState(LOCAL_EDGE_FAMILY_ID),
				"model_002",
				"developer_api",
			).state,
			{ phase: "products", week: 1 },
		).state;
		const text = productsSystem(
			launchProduct(assistantEraState("text"), "model_002", "developer_api")
				.state,
			{ phase: "products", week: 1 },
		).state;
		const localProduct = local.products.items.find(
			(product) => product.modelId === "model_002",
		);
		const textProduct = text.products.items.find(
			(product) => product.modelId === "model_002",
		);
		if (localProduct === undefined || textProduct === undefined) {
			throw new Error("Expected weekly comparison products");
		}

		expect(localProduct.servingDemand).toBeLessThan(
			textProduct.servingDemand ?? 0,
		);
		expect(local.compute.servingDemand).toBeLessThan(
			text.compute.servingDemand,
		);
	});

	it("recomputes local/edge demand when resuming a paused product", () => {
		const launched = launchProduct(
			assistantEraState(LOCAL_EDGE_FAMILY_ID),
			"model_002",
			"developer_api",
		).state;
		const product = launched.products.items.find(
			(candidate) => candidate.modelId === "model_002",
		);
		if (product === undefined)
			throw new Error("Expected the local/edge product");
		product.status = "paused";
		product.users = 12;
		launched.compute = withRecomputedCompute(launched);

		const resumed = applyProductResume(launched, product.id).state;
		const resumedProduct = resumed.products.items.find(
			(candidate) => candidate.id === product.id,
		);
		if (resumedProduct === undefined)
			throw new Error("Expected resumed product");
		expect(resumedProduct.servingDemand).toBe(12);
		expect(resumed.compute.servingDemand).toBe(
			(resumed.products.items[0]?.servingDemand ?? 0) +
				(resumedProduct.servingDemand ?? 0),
		);
	});

	it("round-trips a public command log containing a local/edge launch", {
		timeout: 300_000,
	}, () => {
		const live = localEdgeReplayRun();
		const localModel = live.models.items.find(
			(model) => (model.family as string) === LOCAL_EDGE_FAMILY_ID,
		);
		if (localModel === undefined) {
			throw new Error("Expected a local/edge model in the replay fixture");
		}
		expect(localModel.status).toBe("launched");
		expect(live.commandLog).toContainEqual(
			expect.objectContaining({
				kind: "design_model",
				family: LOCAL_EDGE_FAMILY_ID,
			}),
		);

		const replayed = replayCommandLog(live.commandLog, {
			initialCash: 10_000,
			expectedState: live,
		});
		expect(canonicalEqual(replayed, live)).toBe(true);
		expect(replayed.commandLog).toEqual(live.commandLog);
	});
});
