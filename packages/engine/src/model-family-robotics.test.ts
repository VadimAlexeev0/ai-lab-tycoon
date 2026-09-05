import { describe, expect, it } from "vitest";

import { canonicalEqual } from "./canonical.js";
import type { PendingDecision } from "./components/decisions.js";
import type { Model } from "./components/models.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	assertModelFamilyDefinitions,
	MODEL_FAMILIES,
} from "./data/model-families.js";
import {
	assertResearchDefinitions,
	EMBODIED_CONTROL_ID,
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
	startRun,
} from "./index.js";
import {
	designModel as designModelDirect,
	generateTrueScores,
	type ModelDesignSpec,
} from "./model-design.js";
import {
	applyProductResume,
	launchProduct as launchProductDirect,
	servingDemandForModel,
} from "./products.js";
import { selectVisibleModels } from "./selectors.js";
import type { GameState } from "./state.js";
import { incidentsSystem } from "./systems/incidents.js";
import { productsSystem } from "./systems/products.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";
import { trainingSystem } from "./systems/training.js";

const ROBOTICS_FAMILY_ID = "robotics" as const;
const ROBOTICS_UNLOCK_ID = EMBODIED_CONTROL_ID;
const ROBOTICS_SPEC: ModelDesignSpec = {
	name: "Rover-1",
	family: ROBOTICS_FAMILY_ID,
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 15, code: 5, multimodal: 80 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

describe("robotics / embodied model family", () => {
	it("defines an embodied-control unlock and materially higher serving demand", () => {
		const family = MODEL_FAMILIES.find(
			(candidate) => (candidate.id as string) === "robotics",
		);
		const unlock = RESEARCH_NODES.find(
			(node) => (node.id as string) === EMBODIED_CONTROL_ID,
		);

		expect(family).toMatchObject({
			id: "robotics",
			allowedEras: ["multimodal"],
			unlockedByResearchNodeId: EMBODIED_CONTROL_ID,
			dataMixRequirements: {
				general: 10,
				code: 5,
				multimodal: 75,
			},
			servingComputePerUserPercent: 500,
			scoreCeilingAdjustment: -20,
			incidentExposurePercent: 300,
		});
		expect(unlock).toMatchObject({
			id: EMBODIED_CONTROL_ID,
			era: "multimodal",
			category: "multimodal_agents",
			branch: "models",
			status: "locked",
			insightCost: 4,
			prerequisites: expect.arrayContaining([
				"assistant_models_keystone",
				"world_simulation",
				"agent_runtime",
				"verification",
			]),
		});

		const demand = servingDemandForModel(
			{ family: ROBOTICS_FAMILY_ID },
			"chat",
			1,
		);
		expect(demand).toBe(5);
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
	const definition = RESEARCH_NODES.find((node) => node.id === nodeId);
	const node = state.research.nodes.find(
		(candidate) => candidate.id === nodeId,
	);
	if (definition === undefined || node === undefined) {
		throw new Error(`Expected research fixture node ${nodeId}`);
	}
	if (node.status === "completed") return;
	if (visiting.has(nodeId)) {
		throw new Error(`Research fixture cycle at ${nodeId}`);
	}
	visiting.add(nodeId);
	for (const prerequisite of definition.prerequisites) {
		completeResearchPrerequisites(state, prerequisite, visiting);
	}
	visiting.delete(nodeId);
	node.status = "completed";
}

function multimodalRoboticsState(unlocked: boolean): GameState {
	let state = startRun({ companyName: "Robotics Labs" }, 42);
	state.company.cash = 10_000;
	state.company.hype = 100;
	state.company.trust = 100;
	state.company.insight = 10;
	for (const node of state.research.nodes) {
		if (node.era === "text") node.status = "completed";
	}
	state.models.items = [scoredModel("model_001", "text")];
	state.counters.model = 2;
	state = launchProductDirect(state, "model_001", "chat").state;

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
	state = launchProductDirect(state, "model_002", "chat").state;

	state.meta.era = "multimodal";
	state.research.currentEra = "multimodal";
	completeResearchPrerequisites(state, ROBOTICS_UNLOCK_ID);
	if (!unlocked) {
		const unlock = state.research.nodes.find(
			(node) => node.id === ROBOTICS_UNLOCK_ID,
		);
		if (unlock === undefined) throw new Error("Expected Robotics unlock node");
		unlock.status = "locked";
	}
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

function designAndTrainRobotics(input: GameState): GameState {
	let state = designModelDirect(input, ROBOTICS_SPEC).state;
	for (const week of [2, 3, 4]) {
		state = trainingSystem(state, { phase: "training", week }).state;
	}
	return state;
}

function launchedRoboticsState(): GameState {
	const trained = designAndTrainRobotics(multimodalRoboticsState(true));
	const model = trained.models.items.at(-1);
	if (model === undefined) throw new Error("Expected trained Robotics model");
	// Keep launch eligibility deterministic while retaining the hidden scores
	// generated by the real training path.
	model.estimates = estimates(100);
	return launchProductDirect(trained, model.id, "chat").state;
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

describe("robotics research and training", () => {
	it("unlocks through the real research project lifecycle in the Multimodal era", () => {
		let state = multimodalRoboticsState(false);
		state = researchSystem(state, { phase: "research", week: 5 }).state;
		const project = state.projects.items.find(
			(candidate) =>
				candidate.kind === "research" &&
				candidate.nodeId === ROBOTICS_UNLOCK_ID &&
				candidate.status === "available",
		);
		const team = state.teams.items.find(
			(candidate) => candidate.activeProjectId === null,
		);
		if (project === undefined || team === undefined) {
			throw new Error("Expected an available Robotics project and idle team");
		}

		state = assignProject(state, team.id, project.id).state;
		state = projectsSystem(state, { phase: "projects", week: 5 }).state;
		const completed = researchSystem(state, { phase: "research", week: 5 });

		expect(completed.state.research.nodes).toContainEqual(
			expect.objectContaining({
				id: ROBOTICS_UNLOCK_ID,
				status: "completed",
			}),
		);
		expect(completed.state.projects.items).toContainEqual(
			expect.objectContaining({
				kind: "research",
				nodeId: ROBOTICS_UNLOCK_ID,
				status: "completed",
			}),
		);
		expect(completed.facts).toContainEqual(
			expect.objectContaining({
				kind: "research_completed",
				nodeId: ROBOTICS_UNLOCK_ID,
			}),
		);
	});

	it("requires the unlock and heavy multimodal data, then completes a real training run", () => {
		expect(() =>
			designModelDirect(multimodalRoboticsState(false), ROBOTICS_SPEC),
		).toThrow(/completed research node embodied_control/i);

		const state = multimodalRoboticsState(true);
		const before = JSON.stringify(state);
		const designed = designModelDirect(state, ROBOTICS_SPEC);
		const model = designed.state.models.items.at(-1);
		if (model === undefined)
			throw new Error("Expected designed Robotics model");

		expect(model).toMatchObject({
			family: ROBOTICS_FAMILY_ID,
			dataMix: ROBOTICS_SPEC.dataMix,
			status: "designing",
			scoreCeiling: BALANCE.modelTiers.standard.scoreCeiling - 20,
		});
		expect(model.dataAllocation).toEqual([
			{ recordId: "data_001", amount: 15 },
			{ recordId: "data_002", amount: 5 },
			{ recordId: "data_003", amount: 80 },
		]);
		expect(
			designed.state.dataInventory.items.map((item) => item.reservedAmount),
		).toEqual([15, 5, 80]);

		const trained = designAndTrainRobotics(state);
		const trainedModel = trained.models.items.at(-1);
		if (trainedModel === undefined)
			throw new Error("Expected trained Robotics model");
		expect(trainedModel.status).toBe("ready");
		expect(trainedModel.projectId).toBeNull();
		expect(trainedModel.trueScores).toBeDefined();
		expect(trainedModel.estimates).toBeDefined();
		expect(
			Math.max(...Object.values(trainedModel.trueScores ?? {})),
		).toBeLessThanOrEqual(trainedModel.scoreCeiling ?? 0);
		expect(
			trained.dataInventory.items.map((item) => item.consumedAmount),
		).toEqual([15, 5, 80]);
		expect(JSON.stringify(selectVisibleModels(trained))).not.toContain(
			"trueScores",
		);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("keeps the Robotics score ceiling in direct hidden-score generation", () => {
		const generated = generateTrueScores(
			startRun({ companyName: "Robotics Scores" }, 42).rng,
			{
				id: "model_001",
				name: ROBOTICS_SPEC.name,
				foundation: "fresh",
				status: "training",
				projectId: null,
				family: ROBOTICS_FAMILY_ID,
				tier: "standard",
				dataMix: ROBOTICS_SPEC.dataMix,
				emphasis: ROBOTICS_SPEC.emphasis,
			},
		);

		expect(
			Math.max(...Object.values(generated.trueScores)),
		).toBeLessThanOrEqual(BALANCE.modelTiers.standard.scoreCeiling - 20);
		expect(JSON.stringify(generated.estimates)).not.toContain("trueScores");
	});
});

describe("robotics serving and shared compute", () => {
	it("uses 500% serving demand through launch, resume, and weekly pressure", () => {
		const launched = launchedRoboticsState();
		const robotics = launched.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (robotics === undefined)
			throw new Error("Expected launched Robotics product");
		expect(robotics.servingDemand).toBe(50);
		expect(robotics.servingDemand).toBeGreaterThan(
			launched.products.items[0]?.servingDemand ?? 0,
		);
		expect(computeReservations(launched).servingDemand).toBe(
			launched.products.items.reduce(
				(total, product) => total + (product.servingDemand ?? 0),
				0,
			),
		);

		robotics.status = "paused";
		robotics.users = 12;
		robotics.servingDemand = 0;
		launched.compute = withRecomputedCompute(launched);
		const resumed = applyProductResume(launched, robotics.id).state;
		const resumedRobotics = resumed.products.items.find(
			(product) => product.id === robotics.id,
		);
		if (resumedRobotics === undefined)
			throw new Error("Expected resumed Robotics product");
		expect(resumedRobotics.servingDemand).toBe(60);

		const expanded = {
			...resumed,
			compute: { ...resumed.compute, capacity: 1_000 },
		};
		const pressured = productsSystem(
			{ ...expanded, compute: withRecomputedCompute(expanded) },
			{ phase: "products", week: 1 },
		);
		const pressuredRobotics = pressured.state.products.items.find(
			(product) => product.id === robotics.id,
		);
		if (pressuredRobotics === undefined)
			throw new Error("Expected pressured Robotics product");
		expect(pressuredRobotics.servingDemand).toBeGreaterThan(60);
		expect(pressured.state.compute.servingDemand).toBe(
			pressured.state.products.items.reduce(
				(total, product) => total + (product.servingDemand ?? 0),
				0,
			),
		);
	});

	it("reports Robotics demand in a shared compute conflict with active training", () => {
		const state = launchedRoboticsState();
		const robotics = state.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (robotics === undefined) throw new Error("Expected Robotics product");
		robotics.users = 100;
		robotics.servingDemand = 500;
		state.teams.items.push({
			id: "team_002",
			name: "Robotics Training",
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
});

describe("robotics risk memory and validation", () => {
	it("applies non-neutral Robotics incident exposure to unresolved recurrence", () => {
		const first = incidentsSystem(launchedRoboticsState(), {
			phase: "incidents",
			week: 1,
			// Outage base probability 2 * Robotics exposure 300% = 6.
			incidentRoll: 5,
		});
		const firstDecision = first.pending.find(
			(decision) => decision.kind === "incident",
		);
		if (firstDecision?.kind !== "incident") {
			throw new Error("Expected first Robotics incident");
		}
		expect(first.state.risk.memories).toContainEqual(
			expect.objectContaining({
				affectedModelId: "model_003",
				unresolved: true,
				recurrenceCount: 1,
			}),
		);

		const repaired = applyDecision(
			stateWithPending(first.state, first.pending),
			{
				kind: "incident",
				decisionId: firstDecision.id,
				response: "repair",
			},
		).state;
		const paused = repaired.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (paused === undefined)
			throw new Error("Expected paused Robotics product");
		let resumed = applyProductResume(repaired, paused.id).state;
		const resumedRobotics = resumed.products.items.find(
			(product) => product.id === paused.id,
		);
		if (resumedRobotics === undefined)
			throw new Error("Expected resumed Robotics product");
		resumedRobotics.users = 4;
		resumedRobotics.servingDemand = 20;
		resumed = {
			...resumed,
			meta: { ...resumed.meta, week: 2 },
		};
		resumed.compute = withRecomputedCompute(resumed);

		const repeated = incidentsSystem(resumed, {
			phase: "incidents",
			week: 2,
			// Base 2 + unresolved recurrence bonus 10 = 12; exposure makes
			// the effective probability 36, so this boundary roll triggers.
			incidentRoll: 12,
		});
		expect(repeated.pending).toContainEqual(
			expect.objectContaining({ kind: "incident", incident: "outage" }),
		);
		expect(repeated.state.risk.memories).toContainEqual(
			expect.objectContaining({
				id: "risk_outage_product_003",
				affectedModelId: "model_003",
				recurrenceCount: 2,
				unresolved: true,
			}),
		);
	});

	it("keeps existing exposure defaults neutral and rejects malformed or unavailable content", () => {
		expect(
			MODEL_FAMILIES.filter(
				(family) =>
					family.id !== "agent" &&
					family.id !== "world" &&
					family.id !== ROBOTICS_FAMILY_ID,
			).every((family) => family.incidentExposurePercent === 100),
		).toBe(true);
		expect(
			MODEL_FAMILIES.find((family) => family.id === ROBOTICS_FAMILY_ID)
				?.incidentExposurePercent,
		).toBe(300);
		expect(() => assertResearchDefinitions(RESEARCH_NODES)).not.toThrow();
		expect(() =>
			designModelDirect(multimodalRoboticsState(false), ROBOTICS_SPEC),
		).toThrow(/completed research node embodied_control/i);

		const malformedFamilies = MODEL_FAMILIES.map((family) => ({
			...family,
			baseScoreProfile: { ...family.baseScoreProfile },
			dataMixRequirements: { ...family.dataMixRequirements },
		}));
		const robotics = malformedFamilies.find(
			(family) => family.id === ROBOTICS_FAMILY_ID,
		);
		if (robotics === undefined)
			throw new Error("Expected Robotics family definition");
		(robotics as { incidentExposurePercent: number }).incidentExposurePercent =
			0;
		expect(() => assertModelFamilyDefinitions(malformedFamilies)).toThrow(
			/exposure.*positive/i,
		);

		const malformedResearch = RESEARCH_NODES.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})) as unknown as ResearchDefinition[];
		const unlock = malformedResearch.find(
			(node) => node.id === ROBOTICS_UNLOCK_ID,
		);
		if (unlock === undefined) throw new Error("Expected Robotics unlock node");
		(unlock.prerequisites as string[]).push("missing_robotics_prerequisite");
		expect(() => assertResearchDefinitions(malformedResearch)).toThrow(
			/unknown.*prerequisite/i,
		);

		const designed = designModelDirect(
			multimodalRoboticsState(true),
			ROBOTICS_SPEC,
		).state;
		const unknownFamily = structuredClone(designed) as GameState;
		const familyModel = unknownFamily.models.items.at(-1);
		if (familyModel === undefined)
			throw new Error("Expected designed Robotics model");
		(familyModel as unknown as Record<string, unknown>).family =
			"future_robotics";
		expect(() => assertGameState(unknownFamily)).toThrow(/model family/i);

		const unknownField = structuredClone(designed) as GameState;
		const fieldModel = unknownField.models.items.at(-1);
		if (fieldModel === undefined)
			throw new Error("Expected designed Robotics model");
		(fieldModel as unknown as Record<string, unknown>).futureField = true;
		expect(() => assertGameState(unknownField)).toThrow(/unexpected field/i);
	});
});

function choiceFor(decision: PendingDecision) {
	switch (decision.kind) {
		case "launch":
			return decision.channel === undefined || decision.channel === "chat"
				? {
						kind: "launch" as const,
						decisionId: decision.id,
						channel: "chat" as const,
						...(decision.price === undefined ? {} : { price: decision.price }),
					}
				: { kind: "shelve" as const, decisionId: decision.id };
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
			if (paradigmId === undefined)
				throw new Error("Expected a paradigm choice");
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
	throw new Error("Robotics replay fixture exceeded its decision guard");
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
			throw new Error(`Expected research fixture node ${candidateId}`);
		}
		if (node.status === "completed") return candidateState;
		if (visiting.has(candidateId)) {
			throw new Error(`Research fixture cycle at ${candidateId}`);
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

function roboticsReplayRun(): GameState {
	const textSpec: ModelDesignSpec = {
		name: "Text-Replay",
		family: "text",
		foundation: "fresh",
		tier: "lean",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: ROBOTICS_SPEC.emphasis,
	};
	const assistantSpec: ModelDesignSpec = {
		name: "Assistant-Replay",
		family: "assistant",
		foundation: "fresh",
		tier: "lean",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: ROBOTICS_SPEC.emphasis,
	};
	const roboticsSpec: ModelDesignSpec = {
		...ROBOTICS_SPEC,
		name: "Robotics-Replay",
	};

	let state = startRun({ companyName: "Robotics Replay" }, 42);
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
	state = completeResearchNode(state, ROBOTICS_UNLOCK_ID);
	return trainAndLaunch(state, roboticsSpec);
}

describe("robotics save and replay", () => {
	it("round-trips the Robotics state and real design/launch commands", {
		timeout: 300_000,
	}, () => {
		const live = roboticsReplayRun();
		const robotics = live.models.items.find(
			(model) => model.family === ROBOTICS_FAMILY_ID,
		);
		if (robotics === undefined)
			throw new Error("Expected Robotics replay model");
		expect(robotics.status).toBe("launched");
		expect(live.meta.schemaVersion).toBe(9);
		expect(live.commandLog).toContainEqual(
			expect.objectContaining({
				kind: "design_model",
				family: ROBOTICS_FAMILY_ID,
			}),
		);
		expect(live.products.items).toContainEqual(
			expect.objectContaining({ modelId: robotics.id, status: "operating" }),
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
