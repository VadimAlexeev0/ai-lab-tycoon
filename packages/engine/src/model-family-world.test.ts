import { describe, expect, it } from "vitest";

import { canonicalEqual } from "./canonical.js";
import { assignProject } from "./commands/projects.js";
import type { PendingDecision } from "./components/decisions.js";
import type { Model } from "./components/models.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	assertModelFamilyDefinitions,
	MODEL_FAMILIES,
	type ModelFamilyId,
} from "./data/model-families.js";
import {
	assertResearchDefinitions,
	RESEARCH_NODES,
	type ResearchDefinition,
	WORLD_SIMULATION_ID,
} from "./data/research.js";
import {
	advanceWeek,
	applyDecision,
	applyProductResume,
	assertGameState,
	buyCompute,
	deserializeGameState,
	replayCommandLog,
	serializeGameState,
	startRun,
} from "./index.js";
import {
	designModel as designModelDirect,
	generateTrueScores,
	type ModelDesignSpec,
} from "./model-design.js";
import { launchProduct, servingDemandForModel } from "./products.js";
import { selectVisibleModels } from "./selectors.js";
import type { GameState } from "./state.js";
import { incidentsSystem } from "./systems/incidents.js";
import { productsSystem } from "./systems/products.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";
import { trainingSystem } from "./systems/training.js";

const WORLD_FAMILY_ID = "world" as const satisfies ModelFamilyId;
const WORLD_UNLOCK_ID = WORLD_SIMULATION_ID;
const WORLD_SPEC: ModelDesignSpec = {
	name: "Atlas-1",
	family: WORLD_FAMILY_ID,
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 20, code: 10, multimodal: 70 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

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

function multimodalWorldState(unlocked: boolean): GameState {
	let state = startRun({ companyName: "World Labs" }, 42);
	state.company.cash = 10_000;
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
	completeResearchPrerequisites(state, WORLD_UNLOCK_ID);
	if (!unlocked) {
		const unlock = state.research.nodes.find(
			(node) => node.id === WORLD_UNLOCK_ID,
		);
		if (unlock === undefined) throw new Error("Expected World unlock node");
		unlock.status = "locked";
	}
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

function unlockWorldThroughResearch(): GameState {
	let state = multimodalWorldState(false);
	state = researchSystem(state, { phase: "research", week: 5 }).state;
	const project = state.projects.items.find(
		(candidate) =>
			candidate.kind === "research" &&
			candidate.nodeId === WORLD_UNLOCK_ID &&
			candidate.status === "available",
	);
	const team = state.teams.items.find(
		(candidate) => candidate.activeProjectId === null,
	);
	if (project === undefined || team === undefined) {
		throw new Error("Expected an available World project and idle team");
	}
	state = assignProject(state, team.id, project.id).state;
	state = projectsSystem(state, { phase: "projects", week: 5 }).state;
	const completed = researchSystem(state, { phase: "research", week: 5 });
	expect(completed.facts).toContainEqual(
		expect.objectContaining({
			kind: "research_completed",
			nodeId: WORLD_UNLOCK_ID,
		}),
	);
	return completed.state;
}

function designAndTrainWorld(input: GameState): GameState {
	let state = designModelDirect(input, WORLD_SPEC).state;
	for (const week of [2, 3, 4]) {
		state = trainingSystem(state, { phase: "training", week }).state;
	}
	return state;
}

function launchedWorldState(): GameState {
	const trained = designAndTrainWorld(multimodalWorldState(true));
	const model = trained.models.items.at(-1);
	if (model === undefined) throw new Error("Expected trained World model");
	model.estimates = estimates(100);
	return launchProduct(trained, model.id, "chat").state;
}

function stateWithPending(
	state: GameState,
	pending: readonly PendingDecision[],
): GameState {
	return {
		...state,
		decisions: { pending: pending.map((decision) => ({ ...decision })) },
		queue: {
			...state.queue,
			decisionIds: pending.map((decision) => decision.id),
		},
	};
}

describe("world model family", () => {
	it("defines a multimodal world-simulation unlock with grounding data pressure", () => {
		const family = MODEL_FAMILIES.find(
			(candidate) => (candidate.id as string) === WORLD_FAMILY_ID,
		);
		expect(family).toMatchObject({
			id: WORLD_FAMILY_ID,
			allowedEras: ["multimodal"],
			unlockedByResearchNodeId: WORLD_UNLOCK_ID,
			dataMixRequirements: {
				general: 15,
				code: 5,
				multimodal: 60,
			},
			servingComputePerUserPercent: 400,
			scoreCeilingAdjustment: -15,
			incidentExposurePercent: 250,
		});

		const unlock = RESEARCH_NODES.find(
			(node) => (node.id as string) === WORLD_UNLOCK_ID,
		);
		expect(unlock).toMatchObject({
			era: "multimodal",
			category: "multimodal_agents",
			branch: "models",
			status: "locked",
			prerequisites: expect.arrayContaining([
				"video_world_models",
				"agent_runtime",
			]),
		});
	});

	it("routes World serving demand through the shared family multiplier", () => {
		expect(servingDemandForModel({ family: WORLD_FAMILY_ID }, "chat", 1)).toBe(
			4,
		);
	});

	it("unlocks World through the real research project lifecycle", () => {
		const state = unlockWorldThroughResearch();
		expect(state.research.nodes).toContainEqual(
			expect.objectContaining({
				id: WORLD_UNLOCK_ID,
				status: "completed",
			}),
		);
		expect(state.projects.items).toContainEqual(
			expect.objectContaining({
				kind: "research",
				nodeId: WORLD_UNLOCK_ID,
				status: "completed",
			}),
		);
	});
});

describe("World model design and training", () => {
	it("requires the unlock and heavy multimodal data, then trains with isolated scores", () => {
		expect(() =>
			designModelDirect(multimodalWorldState(false), WORLD_SPEC),
		).toThrow(/completed research node world_simulation/i);

		const state = multimodalWorldState(true);
		const before = JSON.stringify(state);
		const designed = designModelDirect(state, WORLD_SPEC);
		const model = designed.state.models.items.at(-1);
		const family = MODEL_FAMILIES.find(
			(candidate) => candidate.id === WORLD_FAMILY_ID,
		);
		if (model === undefined || family === undefined) {
			throw new Error("Expected the designed World model");
		}
		expect(() =>
			designModelDirect(state, {
				...WORLD_SPEC,
				dataMix: { general: 55, code: 10, multimodal: 35 },
			}),
		).toThrow(/at least 60 multimodal/i);
		expect(model).toMatchObject({
			family: WORLD_FAMILY_ID,
			dataMix: WORLD_SPEC.dataMix,
			status: "designing",
			scoreCeiling:
				BALANCE.modelTiers.standard.scoreCeiling +
				family.scoreCeilingAdjustment,
		});
		expect(model.dataAllocation).toEqual([
			{ recordId: "data_001", amount: 20 },
			{ recordId: "data_002", amount: 10 },
			{ recordId: "data_003", amount: 70 },
		]);
		expect(
			designed.state.dataInventory.items.map((item) => item.reservedAmount),
		).toEqual([20, 10, 70]);

		const trained = designAndTrainWorld(state);
		const trainedModel = trained.models.items.at(-1);
		if (trainedModel === undefined)
			throw new Error("Expected trained World model");
		expect(trainedModel.status).toBe("ready");
		expect(trainedModel.projectId).toBeNull();
		expect(trainedModel.trueScores).toBeDefined();
		expect(trainedModel.estimates).toBeDefined();
		expect(
			Math.max(...Object.values(trainedModel.trueScores ?? {})),
		).toBeLessThanOrEqual(trainedModel.scoreCeiling ?? 0);
		expect(
			trained.dataInventory.items.map((item) => item.consumedAmount),
		).toEqual([20, 10, 70]);
		expect(JSON.stringify(selectVisibleModels(trained))).not.toContain(
			"trueScores",
		);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("keeps the World ceiling bound in direct score generation", () => {
		const generated = generateTrueScores(
			startRun({ companyName: "World Scores" }, 42).rng,
			{
				id: "model_001",
				name: "Atlas-1",
				foundation: "fresh",
				status: "training",
				projectId: null,
				family: WORLD_FAMILY_ID,
				tier: "standard",
				dataMix: WORLD_SPEC.dataMix,
				emphasis: WORLD_SPEC.emphasis,
			},
		);
		const family = MODEL_FAMILIES.find(
			(candidate) => candidate.id === WORLD_FAMILY_ID,
		);
		if (family === undefined) throw new Error("Expected World family");
		expect(
			Math.max(...Object.values(generated.trueScores)),
		).toBeLessThanOrEqual(
			BALANCE.modelTiers.standard.scoreCeiling + family.scoreCeilingAdjustment,
		);
		expect(JSON.stringify(generated.estimates)).not.toContain("trueScores");
	});
});

describe("World product pressure and incidents", () => {
	it("uses high serving demand through launch, resume, and weekly pressure", () => {
		const launched = launchedWorldState();
		const world = launched.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (world === undefined) throw new Error("Expected launched World product");
		expect(world.servingDemand).toBe(40);
		expect(world.servingDemand).toBeGreaterThan(
			launched.products.items[0]?.servingDemand ?? 0,
		);

		world.status = "paused";
		world.users = 12;
		world.servingDemand = 0;
		launched.compute = withRecomputedCompute(launched);
		const resumed = applyProductResume(launched, world.id).state;
		const resumedWorld = resumed.products.items.find(
			(product) => product.id === world.id,
		);
		if (resumedWorld === undefined)
			throw new Error("Expected resumed World product");
		expect(resumedWorld.servingDemand).toBe(48);

		const expanded = {
			...resumed,
			compute: { ...resumed.compute, capacity: 200 },
		};
		const pressured = productsSystem(
			{ ...expanded, compute: withRecomputedCompute(expanded) },
			{ phase: "products", week: 1 },
		);
		const pressuredWorld = pressured.state.products.items.find(
			(product) => product.id === world.id,
		);
		if (pressuredWorld === undefined)
			throw new Error("Expected pressured World product");
		expect(pressuredWorld.servingDemand).toBeGreaterThan(48);
		expect(pressured.state.compute.servingDemand).toBe(
			pressured.state.products.items.reduce(
				(total, product) => total + (product.servingDemand ?? 0),
				0,
			),
		);
	});

	it("reports World demand in a shared compute conflict with active training", () => {
		const state = launchedWorldState();
		const world = state.products.items.find(
			(product) => product.modelId === "model_003",
		);
		const team = state.teams.items[0];
		if (world === undefined || team === undefined) {
			throw new Error("Expected World product and founding team");
		}
		world.users = 100;
		world.servingDemand = 400;
		state.teams.items.push({
			id: "team_002",
			name: "World Training",
			activeProjectId: "project_999",
		});
		state.models.items.push({
			id: "model_004",
			name: "Pressure-Model",
			foundation: "fresh",
			status: "training",
			projectId: "project_999",
			family: "text",
			tier: "aggressive",
		});
		state.projects.items.push({
			kind: "training",
			id: "project_999",
			teamId: "team_002",
			modelId: "model_004",
			status: "active",
			progress: 0,
			duration: 4,
		});
		state.counters.model = 5;
		state.compute.capacity = 20;
		state.compute = withRecomputedCompute(state);

		const result = productsSystem(state, { phase: "products", week: 1 });
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "compute_conflict",
				choice: "serving_throttled",
			}),
		);
		expect(result.state.compute.servingDemand).toBeGreaterThan(150);
	});

	it("retains World risk memory and applies its non-neutral exposure on recurrence", () => {
		const first = incidentsSystem(launchedWorldState(), {
			phase: "incidents",
			week: 1,
			// Outage base probability 2 * World exposure 250% = 5.
			incidentRoll: 4,
		});
		const firstDecision = first.pending.find(
			(decision) => decision.kind === "incident",
		);
		if (firstDecision?.kind !== "incident") {
			throw new Error("Expected first World incident");
		}
		const firstWorld = first.state.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (firstWorld === undefined)
			throw new Error("Expected first World product");
		const offered = stateWithPending(first.state, first.pending);
		const repaired = applyDecision(offered, {
			kind: "incident",
			decisionId: firstDecision.id,
			response: "repair",
		}).state;
		expect(repaired.risk.memories).toContainEqual(
			expect.objectContaining({
				affectedModelId: "model_003",
				unresolved: true,
				recurrenceCount: 1,
			}),
		);

		const paused = repaired.products.items.find(
			(product) => product.id === firstWorld.id,
		);
		if (paused === undefined) throw new Error("Expected paused World product");
		let resumed = applyProductResume(repaired, paused.id).state;
		const resumedWorld = resumed.products.items.find(
			(product) => product.id === paused.id,
		);
		if (resumedWorld === undefined)
			throw new Error("Expected resumed World product");
		resumedWorld.users = 4;
		resumedWorld.servingDemand = 16;
		resumed = {
			...resumed,
			meta: { ...resumed.meta, week: 2 },
		};
		resumed.compute = withRecomputedCompute(resumed);

		const repeated = incidentsSystem(resumed, {
			phase: "incidents",
			week: 2,
			// Base 2 + unresolved recurrence bonus 10 = 12; World exposure
			// makes the effective probability 30, so this boundary roll hits.
			incidentRoll: 12,
		});
		expect(repeated.pending).toContainEqual(
			expect.objectContaining({ kind: "incident", incident: "outage" }),
		);
		expect(repeated.state.risk.memories).toContainEqual(
			expect.objectContaining({
				id: `risk_outage_${firstWorld.id}`,
				affectedModelId: "model_003",
				recurrenceCount: 2,
				unresolved: true,
			}),
		);
	});
});

describe("World validation, persistence, and immutability", () => {
	it("rejects malformed family and research definitions plus unavailable designs", () => {
		expect(() =>
			designModelDirect(multimodalWorldState(false), WORLD_SPEC),
		).toThrow(/completed research node world_simulation/i);

		const malformedFamilies = MODEL_FAMILIES.map((family) => ({
			...family,
			baseScoreProfile: { ...family.baseScoreProfile },
			dataMixRequirements: { ...family.dataMixRequirements },
		}));
		const world = malformedFamilies.find(
			(family) => family.id === WORLD_FAMILY_ID,
		);
		if (world === undefined)
			throw new Error("Expected World family definition");
		(world as { incidentExposurePercent: number }).incidentExposurePercent = 0;
		expect(() => assertModelFamilyDefinitions(malformedFamilies)).toThrow(
			/exposure.*positive/i,
		);

		const malformedResearch = RESEARCH_NODES.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})) as unknown as ResearchDefinition[];
		const unlock = malformedResearch.find(
			(node) => node.id === WORLD_UNLOCK_ID,
		);
		if (unlock === undefined) throw new Error("Expected World research node");
		(unlock.prerequisites as string[]).push("missing_world_prerequisite");
		expect(() => assertResearchDefinitions(malformedResearch)).toThrow(
			/unknown.*prerequisite/i,
		);
	});

	it("rejects unknown persisted World families and unexpected model fields", () => {
		const designed = designModelDirect(
			multimodalWorldState(true),
			WORLD_SPEC,
		).state;
		const unknownFamily = structuredClone(designed) as GameState;
		const familyModel = unknownFamily.models.items.at(-1);
		if (familyModel === undefined)
			throw new Error("Expected designed World model");
		(familyModel as unknown as Record<string, unknown>).family = "future_world";
		expect(() => assertGameState(unknownFamily)).toThrow(/model family/i);

		const unknownField = structuredClone(designed) as GameState;
		const fieldModel = unknownField.models.items.at(-1);
		if (fieldModel === undefined)
			throw new Error("Expected designed World model");
		(fieldModel as unknown as Record<string, unknown>).futureField = true;
		expect(() => assertGameState(unknownField)).toThrow(/unexpected field/i);
	});

	it("round-trips World saves without leaking hidden scores", () => {
		const state = launchedWorldState();
		const serialized = serializeGameState(state);
		const restored = deserializeGameState(serialized);
		expect(canonicalEqual(restored, state)).toBe(true);
		expect(serializeGameState(restored)).toBe(serialized);
		expect(JSON.stringify(selectVisibleModels(restored))).not.toContain(
			"trueScores",
		);
	});

	it("does not mutate the input while designing World", () => {
		const state = multimodalWorldState(true);
		const before = JSON.stringify(state);
		designModelDirect(state, WORLD_SPEC);
		expect(JSON.stringify(state)).toBe(before);
	});
});

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
	for (let guard = 0; guard < 256; guard += 1) {
		const decision =
			current.decisions.pending.find((candidate) => candidate.blocking) ??
			current.decisions.pending[0];
		if (decision === undefined) return current;
		current = applyDecision(current, choiceFor(decision)).state;
	}
	throw new Error("World replay fixture exceeded its decision guard");
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
		if (visiting.has(candidateId)) {
			throw new Error(`Research cycle at ${candidateId}`);
		}
		visiting.add(candidateId);
		let next = candidateState;
		for (const prerequisite of definition.prerequisites) {
			next = complete(next, prerequisite);
		}
		visiting.delete(candidateId);

		for (let guard = 0; guard < 256; guard += 1) {
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
	let current = designModelDirect(state, spec).state;
	for (let guard = 0; guard < 64; guard += 1) {
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

function worldReplayRun(): GameState {
	const textSpec: ModelDesignSpec = {
		name: "Text-Replay",
		family: "text",
		foundation: "fresh",
		tier: "lean",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: WORLD_SPEC.emphasis,
	};
	const assistantSpec: ModelDesignSpec = {
		name: "Assistant-Replay",
		family: "assistant",
		foundation: "fresh",
		tier: "lean",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: WORLD_SPEC.emphasis,
	};
	const worldSpec: ModelDesignSpec = {
		...WORLD_SPEC,
		name: "World-Replay",
	};

	let state = startRun({ companyName: "World Replay" }, 42);
	state.company.cash = 10_000;
	for (const node of RESEARCH_NODES.filter(
		(candidate) => candidate.era === "text",
	)) {
		state = completeResearchNode(state, node.id);
	}
	state = trainAndLaunch(state, textSpec);
	state = resolveAllDecisions(advanceWeek(state).state);
	state = completeResearchNode(state, "assistant_models_reasoning");
	state = trainAndLaunch(state, assistantSpec);
	state = resolveAllDecisions(advanceWeek(state).state);
	state = completeResearchNode(state, "assistant_models_keystone");
	state = completeResearchNode(state, WORLD_UNLOCK_ID);
	return trainAndLaunch(state, worldSpec);
}

describe("World save and replay", () => {
	it("replays the real World design and launch command without state drift", {
		timeout: 300_000,
	}, () => {
		const live = worldReplayRun();
		const world = live.models.items.find(
			(model) => model.family === WORLD_FAMILY_ID,
		);
		if (world === undefined)
			throw new Error("Expected World model in replay fixture");
		expect(world.status).toBe("launched");
		expect(live.commandLog).toContainEqual(
			expect.objectContaining({
				kind: "design_model",
				family: WORLD_FAMILY_ID,
			}),
		);
		expect(live.commandLog).toContainEqual(
			expect.objectContaining({
				kind: "apply_decision",
				choice: expect.objectContaining({
					kind: "launch",
					channel: "chat",
				}),
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
