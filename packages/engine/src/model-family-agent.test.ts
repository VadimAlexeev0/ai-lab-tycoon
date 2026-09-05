import { describe, expect, it } from "vitest";
import { canonicalEqual } from "./canonical.js";
import type { PendingDecision } from "./components/decisions.js";
import type { Model } from "./components/models.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	assertModelFamilyDefinitions,
	MODEL_FAMILIES,
} from "./data/model-families.js";
import {
	AGENT_RUNTIME_ID,
	assertResearchDefinitions,
	RESEARCH_NODES,
	type ResearchDefinition,
} from "./data/research.js";
import {
	advanceWeek,
	applyDecision,
	assertGameState,
	assignProject,
	buyCompute,
	deserializeGameState,
	replayCommandLog,
	serializeGameState,
} from "./index.js";
import { designModel, type ModelDesignSpec } from "./model-design.js";
import { applyProductResume, launchProduct } from "./products.js";
import { selectVisibleModels } from "./selectors.js";
import { startRun } from "./start-run.js";
import type { GameState } from "./state.js";
import { incidentsSystem } from "./systems/incidents.js";
import { productsSystem } from "./systems/products.js";
import { trainingSystem } from "./systems/training.js";

const AGENT_FAMILY_ID = "agent";
const AGENT_SPEC: ModelDesignSpec = {
	name: "Operator-1",
	family: "agent",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 20, code: 40, multimodal: 40 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

describe("agent model family", () => {
	it("defines an agent family behind an unambiguous multimodal tool-runtime gate", () => {
		const family = MODEL_FAMILIES.find(
			(candidate) => (candidate.id as string) === AGENT_FAMILY_ID,
		);
		expect(family).toMatchObject({
			id: AGENT_FAMILY_ID,
			allowedEras: ["multimodal"],
			unlockedByResearchNodeId: AGENT_RUNTIME_ID,
			dataMixRequirements: {
				general: 15,
				code: 30,
				multimodal: 25,
			},
			servingComputePerUserPercent: 300,
			scoreCeilingAdjustment: -4,
			incidentExposurePercent: 200,
		});

		const unlock = RESEARCH_NODES.find(
			(node) => (node.id as string) === AGENT_RUNTIME_ID,
		);
		expect(unlock).toMatchObject({
			era: "multimodal",
			category: "multimodal_agents",
			branch: "models",
			status: "locked",
			prerequisites: expect.arrayContaining([
				"assistant_models_keystone",
				"tool_calling",
				"code_execution",
				"verification",
			]),
		});
	});
});

function scores(value = 100) {
	return {
		capability: value,
		coding: value,
		reliability: value,
		safety: value,
		efficiency: value,
		multimodal: value,
	};
}

function estimates(value = 100) {
	return {
		capability: {
			estimate: value,
			lower: Math.max(0, value - 20),
			upper: value,
		},
		coding: { estimate: value, lower: Math.max(0, value - 20), upper: value },
		reliability: {
			estimate: value,
			lower: Math.max(0, value - 20),
			upper: value,
		},
		safety: { estimate: value, lower: Math.max(0, value - 20), upper: value },
		efficiency: {
			estimate: value,
			lower: Math.max(0, value - 20),
			upper: value,
		},
		multimodal: {
			estimate: value,
			lower: Math.max(0, value - 20),
			upper: value,
		},
	};
}

function scoredModel(id: string, family: "text" | "assistant"): Model {
	return {
		id,
		name: `${family}-${id}`,
		foundation: "fresh",
		status: "ready",
		projectId: null,
		family,
		tier: "standard",
		scoreCeiling: 88,
		trueScores: scores(),
		estimates: estimates(),
	};
}

function completeResearchPrerequisites(
	state: GameState,
	nodeId: string,
	visiting = new Set<string>(),
): void {
	if (visiting.has(nodeId)) {
		throw new Error(`Research fixture cycle at ${nodeId}`);
	}
	const definition = RESEARCH_NODES.find((node) => node.id === nodeId);
	const node = state.research.nodes.find(
		(candidate) => candidate.id === nodeId,
	);
	if (definition === undefined || node === undefined) {
		throw new Error(`Expected research fixture node ${nodeId}`);
	}
	visiting.add(nodeId);
	for (const prerequisite of definition.prerequisites) {
		completeResearchPrerequisites(state, prerequisite, visiting);
	}
	visiting.delete(nodeId);
	node.status = "completed";
}

function multimodalAgentState(unlocked: boolean): GameState {
	let state = startRun({ companyName: "Agent Labs" }, 42);
	state.company.hype = 100;
	state.company.trust = 100;
	state.company.insight = 10;
	for (const node of state.research.nodes) {
		if (node.era === "text") node.status = "completed";
	}
	state.models.items = [scoredModel("model_001", "text")];
	state.counters.model = 2;
	state = launchProduct(state, "model_001", "chat").state;

	state.meta.era = "assistant";
	state.research.currentEra = "assistant";
	for (const node of state.research.nodes) {
		if (node.era === "assistant") node.status = "completed";
	}
	state.models.items = [
		...state.models.items,
		scoredModel("model_002", "assistant"),
	];
	state.counters.model = 3;
	state = launchProduct(state, "model_002", "chat").state;

	state.meta.era = "multimodal";
	state.research.currentEra = "multimodal";
	completeResearchPrerequisites(state, AGENT_RUNTIME_ID);
	if (!unlocked) {
		const unlock = state.research.nodes.find(
			(node) => node.id === AGENT_RUNTIME_ID,
		);
		if (unlock === undefined) throw new Error("Expected Agent unlock node");
		unlock.status = "locked";
	}
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

function designAndTrainAgent(input: GameState): GameState {
	let state = designModel(input, AGENT_SPEC).state;
	for (const week of [2, 3, 4]) {
		state = trainingSystem(state, { phase: "training", week }).state;
	}
	return state;
}

describe("agent model design and training", () => {
	it("requires the runtime unlock, reserves the agent data mix, and trains with isolated hidden scores", () => {
		const unavailable = multimodalAgentState(false);
		expect(() => designModel(unavailable, AGENT_SPEC)).toThrow(
			/completed research node agent_runtime/i,
		);

		const state = multimodalAgentState(true);
		const before = JSON.stringify(state);
		const designed = designModel(state, AGENT_SPEC);
		const designedModel = designed.state.models.items.at(-1);
		const family = MODEL_FAMILIES.find(
			(candidate) => candidate.id === AGENT_FAMILY_ID,
		);
		if (designedModel === undefined || family === undefined) {
			throw new Error("Expected the designed Agent model");
		}
		expect(designedModel).toMatchObject({
			family: AGENT_FAMILY_ID,
			dataMix: AGENT_SPEC.dataMix,
			status: "designing",
			scoreCeiling:
				BALANCE.modelTiers.standard.scoreCeiling +
				family.scoreCeilingAdjustment,
		});
		expect(designedModel.dataAllocation).toEqual([
			{ recordId: "data_001", amount: 20 },
			{ recordId: "data_002", amount: 40 },
			{ recordId: "data_003", amount: 40 },
		]);
		expect(
			designed.state.dataInventory.items.map((item) => item.reservedAmount),
		).toEqual([20, 40, 40]);

		const trained = designAndTrainAgent(state);
		const trainedModel = trained.models.items.at(-1);
		if (trainedModel === undefined)
			throw new Error("Expected trained Agent model");
		expect(trainedModel.status).toBe("ready");
		expect(trainedModel.trueScores).toBeDefined();
		expect(trainedModel.estimates).toBeDefined();
		expect(
			Math.max(...Object.values(trainedModel.trueScores ?? {})),
		).toBeLessThanOrEqual(trainedModel.scoreCeiling ?? 0);
		expect(
			trained.dataInventory.items.map((item) => item.consumedAmount),
		).toEqual([20, 40, 40]);
		expect(JSON.stringify(selectVisibleModels(trained))).not.toContain(
			"trueScores",
		);
		expect(JSON.stringify(state)).toBe(before);
	});
});

function launchedAgentState(): GameState {
	const trained = designAndTrainAgent(multimodalAgentState(true));
	const model = trained.models.items.at(-1);
	if (model === undefined) throw new Error("Expected trained Agent model");
	model.estimates = estimates(100);
	const state = launchProduct(trained, model.id, "chat").state;
	const product = state.products.items.find(
		(candidate) => candidate.modelId === model.id,
	);
	if (product === undefined) throw new Error("Expected launched Agent product");
	product.users = 1;
	product.servingDemand = 13;
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

describe("agent family validation and risk memory", () => {
	it("keeps all pre-existing families at neutral incident exposure", () => {
		expect(
			MODEL_FAMILIES.filter(
				(family) =>
					family.id !== AGENT_FAMILY_ID &&
					family.id !== "world" &&
					family.id !== "robotics",
			).every((family) => family.incidentExposurePercent === 100),
		).toBe(true);
	});

	it("retains unresolved Agent risk memory and applies its multiplier to recurrence", () => {
		const first = incidentsSystem(launchedAgentState(), {
			phase: "incidents",
			week: 1,
			incidentRoll: 0,
		});
		const firstDecision = first.pending.find(
			(decision) => decision.kind === "incident",
		);
		if (firstDecision?.kind !== "incident")
			throw new Error("Expected first Agent incident");
		const offered: GameState = {
			...first.state,
			decisions: {
				pending: first.pending.map((decision) => ({ ...decision })),
			},
			queue: {
				...first.state.queue,
				decisionIds: first.pending.map((decision) => decision.id),
			},
		};
		const repaired = applyDecision(offered, {
			kind: "incident",
			decisionId: firstDecision.id,
			response: "repair",
		}).state;
		const pausedAgent = repaired.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (pausedAgent === undefined)
			throw new Error("Expected paused Agent product");
		let resumed = applyProductResume(repaired, pausedAgent.id).state;
		const resumedAgent = resumed.products.items.find(
			(product) => product.id === pausedAgent.id,
		);
		if (resumedAgent === undefined)
			throw new Error("Expected resumed Agent product");
		resumedAgent.users = 1;
		resumedAgent.servingDemand = 13;
		resumed = {
			...resumed,
			meta: { ...resumed.meta, week: 2 },
		};
		resumed.compute = withRecomputedCompute(resumed);

		const repeated = incidentsSystem(resumed, {
			phase: "incidents",
			week: 2,
			// Base 2 + unresolved recurrence bonus 10 = 12; Agent doubles it
			// to 24, so this boundary roll must trigger.
			incidentRoll: 12,
		});
		expect(repeated.pending).toContainEqual(
			expect.objectContaining({ kind: "incident", incident: "outage" }),
		);
		expect(repeated.state.risk.memories).toContainEqual(
			expect.objectContaining({
				id: "risk_outage_product_003",
				recurrenceCount: 2,
				unresolved: true,
			}),
		);
	});

	it("rejects malformed Agent family and runtime DAG definitions", () => {
		const valid = MODEL_FAMILIES.map((family) => ({
			...family,
			baseScoreProfile: { ...family.baseScoreProfile },
			dataMixRequirements: { ...family.dataMixRequirements },
		}));
		const agent = valid.find((family) => family.id === AGENT_FAMILY_ID);
		if (agent === undefined)
			throw new Error("Expected Agent family definition");
		(agent as { incidentExposurePercent: number }).incidentExposurePercent = 0;
		expect(() => assertModelFamilyDefinitions(valid)).toThrow(
			/exposure.*positive/i,
		);

		const unknownUnlock = MODEL_FAMILIES.map((family) => ({
			...family,
			baseScoreProfile: { ...family.baseScoreProfile },
			dataMixRequirements: { ...family.dataMixRequirements },
		}));
		const unknownAgent = unknownUnlock.find(
			(family) => family.id === AGENT_FAMILY_ID,
		);
		if (unknownAgent === undefined)
			throw new Error("Expected Agent family definition");
		(
			unknownAgent as { unlockedByResearchNodeId: string }
		).unlockedByResearchNodeId = "missing_agent_unlock";
		expect(() => assertModelFamilyDefinitions(unknownUnlock)).toThrow(
			/unknown research unlock/i,
		);

		const malformedResearch = RESEARCH_NODES.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})) as unknown as ResearchDefinition[];
		const runtime = malformedResearch.find(
			(node) => node.id === AGENT_RUNTIME_ID,
		);
		if (runtime === undefined) throw new Error("Expected Agent runtime node");
		(runtime.prerequisites as string[]).push("missing_agent_prerequisite");
		expect(() => assertResearchDefinitions(malformedResearch)).toThrow(
			/unknown.*prerequisite/i,
		);
	});
});

function addActiveTrainingPressure(input: GameState): GameState {
	const state: GameState = {
		...input,
		teams: {
			items: [
				...input.teams.items.map((team) => ({ ...team })),
				{
					id: "team_002",
					name: "Agent Training",
					activeProjectId: "project_999",
				},
			],
		},
		models: {
			...input.models,
			items: [
				...input.models.items,
				{
					id: "model_004",
					name: "Pressure-Model",
					foundation: "fresh",
					status: "training",
					projectId: "project_999",
					family: "text",
					tier: "aggressive",
				},
			],
		},
		projects: {
			items: [
				...input.projects.items,
				{
					kind: "training",
					id: "project_999",
					teamId: "team_002",
					modelId: "model_004",
					status: "active",
					progress: 0,
					duration: 4,
				},
			],
		},
		compute: { ...input.compute, capacity: 20 },
	};
	return { ...state, compute: withRecomputedCompute(state) };
}

describe("agent product pressure", () => {
	it("uses higher Agent serving demand through launch, resume, and weekly pressure", () => {
		const trained = designAndTrainAgent(multimodalAgentState(true));
		const model = trained.models.items.at(-1);
		if (model === undefined) throw new Error("Expected trained Agent model");
		model.estimates = estimates(100);
		const launched = launchProduct(trained, model.id, "chat").state;
		const product = launched.products.items.find(
			(candidate) => candidate.modelId === model.id,
		);
		if (product === undefined)
			throw new Error("Expected launched Agent product");
		expect(product.servingDemand).toBe(30);
		expect(product.servingDemand).toBeGreaterThan(
			launched.products.items.find(
				(candidate) => candidate.modelId === "model_001",
			)?.servingDemand ?? 0,
		);

		product.status = "paused";
		product.users = 12;
		product.servingDemand = 0;
		launched.compute = withRecomputedCompute(launched);
		const resumed = applyProductResume(launched, product.id).state;
		const resumedProduct = resumed.products.items.find(
			(candidate) => candidate.id === product.id,
		);
		if (resumedProduct === undefined)
			throw new Error("Expected resumed Agent product");
		expect(resumedProduct.servingDemand).toBe(36);

		const pressured = productsSystem(resumed, {
			phase: "products",
			week: 1,
		}).state;
		const pressuredProduct = pressured.products.items.find(
			(candidate) => candidate.id === product.id,
		);
		if (pressuredProduct === undefined)
			throw new Error("Expected pressured Agent product");
		expect(pressuredProduct.servingDemand).toBeGreaterThan(36);
		expect(pressured.compute.servingDemand).toBe(
			pressured.products.items.reduce(
				(total, item) => total + (item.servingDemand ?? 0),
				0,
			),
		);
	});

	it("reports Agent serving demand in a shared compute conflict with active training", () => {
		const pressured = addActiveTrainingPressure(launchedAgentState());
		const result = productsSystem(pressured, { phase: "products", week: 1 });
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "compute_conflict",
				choice: "serving_throttled",
			}),
		);
		expect(result.state.compute.servingDemand).toBeGreaterThan(20);
	});
});

const TEXT_REPLAY_SPEC: ModelDesignSpec = {
	name: "Text-Replay",
	family: "text",
	foundation: "fresh",
	tier: "lean",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

const ASSISTANT_REPLAY_SPEC: ModelDesignSpec = {
	name: "Assistant-Replay",
	family: "assistant",
	foundation: "fresh",
	tier: "lean",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function choiceFor(decision: PendingDecision) {
	switch (decision.kind) {
		case "launch":
			return {
				kind: "launch" as const,
				decisionId: decision.id,
				channel: decision.channel ?? "chat",
				...(decision.price === undefined ? {} : { price: decision.price }),
			};
		case "evaluation":
			return {
				kind: "evaluate" as const,
				decisionId: decision.id,
				evaluation: decision.evaluation,
			};
		case "funding":
			return {
				kind: "funding" as const,
				decisionId: decision.id,
				round: decision.round,
				accept: true,
			};
		case "incident":
			return {
				kind: "incident" as const,
				decisionId: decision.id,
				response: "disclose" as const,
			};
		case "crisis":
			return {
				kind: "crisis" as const,
				decisionId: decision.id,
				crisisId: decision.crisisId,
				choice: "investigate" as const,
			};
		case "paradigm": {
			const paradigmId = decision.choices[0];
			if (paradigmId === undefined) throw new Error("Expected paradigm choice");
			return {
				kind: "paradigm" as const,
				decisionId: decision.id,
				paradigmId,
			};
		}
		case "publication":
			return {
				kind: "publication" as const,
				decisionId: decision.id,
				nodeId: decision.nodeId,
				outcome: "publish" as const,
			};
	}
}

function resolveAllDecisions(state: GameState): GameState {
	let current = state;
	for (let guard = 0; guard < 128; guard += 1) {
		const decision =
			current.decisions.pending.find((candidate) => candidate.blocking) ??
			current.decisions.pending[0];
		if (decision === undefined) return current;
		current = applyDecision(current, choiceFor(decision)).state;
	}
	throw new Error("Agent replay fixture exceeded its decision guard");
}

function completeResearchNode(state: GameState, nodeId: string): GameState {
	const visiting = new Set<string>();
	const complete = (
		candidateState: GameState,
		candidateId: string,
	): GameState => {
		const definition = RESEARCH_NODES.find((node) => node.id === candidateId);
		const node = candidateState.research.nodes.find(
			(item) => item.id === candidateId,
		);
		if (definition === undefined || node === undefined) {
			throw new Error(`Expected research node ${candidateId}`);
		}
		if (node.status === "completed") return candidateState;
		if (visiting.has(candidateId))
			throw new Error(`Research cycle at ${candidateId}`);
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
				throw new Error(`Expected idle team for research node ${candidateId}`);
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
	return complete(state, nodeId);
}

function trainAndLaunch(state: GameState, spec: ModelDesignSpec): GameState {
	let current = designModel(state, spec).state;
	for (let guard = 0; guard < 32; guard += 1) {
		current = resolveAllDecisions(current);
		const model = current.models.items.find(
			(candidate) => candidate.name === spec.name,
		);
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

function agentReplayRun(): GameState {
	let state = startRun({ companyName: "Agent Replay" }, 42);
	state.company.cash = 10_000;
	for (const node of RESEARCH_NODES.filter(
		(candidate) => candidate.era === "text",
	)) {
		state = completeResearchNode(state, node.id);
	}
	state = trainAndLaunch(state, TEXT_REPLAY_SPEC);
	state = resolveAllDecisions(advanceWeek(state).state);
	state = completeResearchNode(state, "assistant_models_reasoning");
	state = trainAndLaunch(state, ASSISTANT_REPLAY_SPEC);
	state = resolveAllDecisions(advanceWeek(state).state);
	state = completeResearchNode(state, "assistant_models_keystone");
	state = completeResearchNode(state, AGENT_RUNTIME_ID);
	return trainAndLaunch(state, AGENT_SPEC);
}

describe("agent save and replay", () => {
	it("round-trips Agent state and replays its real design and launch commands", {
		timeout: 300_000,
	}, () => {
		const live = agentReplayRun();
		const agent = live.models.items.find(
			(model) => model.family === AGENT_FAMILY_ID,
		);
		if (agent === undefined)
			throw new Error("Expected Agent in replay fixture");
		expect(agent.status).toBe("launched");
		expect(live.commandLog).toContainEqual(
			expect.objectContaining({
				kind: "design_model",
				family: AGENT_FAMILY_ID,
			}),
		);
		expect(live.products.items).toContainEqual(
			expect.objectContaining({ modelId: agent.id, status: "operating" }),
		);

		const serialized = serializeGameState(live);
		const restored = deserializeGameState(serialized);
		expect(canonicalEqual(restored, live)).toBe(true);
		expect(serializeGameState(restored)).toBe(serialized);

		const replayed = replayCommandLog(live.commandLog, {
			initialCash: 10_000,
			expectedState: live,
		});
		expect(canonicalEqual(replayed, live)).toBe(true);
		expect(replayed.commandLog).toEqual(live.commandLog);
		expect(JSON.stringify(selectVisibleModels(replayed))).not.toContain(
			"trueScores",
		);
	});
});

describe("agent persisted validation", () => {
	it("rejects unknown Agent family values and unexpected model fields", () => {
		const designed = designModel(multimodalAgentState(true), AGENT_SPEC).state;
		const unknownFamily = structuredClone(designed) as GameState;
		const familyModel = unknownFamily.models.items.at(-1);
		if (familyModel === undefined)
			throw new Error("Expected designed Agent model");
		(familyModel as unknown as Record<string, unknown>).family = "future_agent";
		expect(() => assertGameState(unknownFamily)).toThrow(/model family/i);

		const unknownField = structuredClone(designed) as GameState;
		const fieldModel = unknownField.models.items.at(-1);
		if (fieldModel === undefined)
			throw new Error("Expected designed Agent model");
		(fieldModel as unknown as Record<string, unknown>).futureField = true;
		expect(() => assertGameState(unknownField)).toThrow(/unexpected field/i);
	});
});
