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
} from "./data/model-families.js";
import {
	assertResearchDefinitions,
	RESEARCH_NODES,
	type ResearchDefinition,
	VIDEO_WORLD_MODELS_ID,
} from "./data/research.js";
import { runEvaluation } from "./evaluations.js";
import {
	advanceWeek,
	applyDecision,
	buyCompute,
	deserializeGameState,
	replayCommandLog,
	serializeGameState,
} from "./index.js";
import type { ModelDesignSpec } from "./model-design.js";
import { designModel } from "./model-design.js";
import { applyProductResume, launchProduct } from "./products.js";
import { selectVisibleModels } from "./selectors.js";
import { startRun } from "./start-run.js";
import type { GameState } from "./state.js";
import { productsSystem } from "./systems/products.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";
import { trainingSystem } from "./systems/training.js";

const VIDEO_SPEC: ModelDesignSpec = {
	name: "Motion-1",
	family: "video",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 20, code: 10, multimodal: 70 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

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

const VIDEO_REPLAY_SPEC: ModelDesignSpec = {
	...VIDEO_SPEC,
	name: "Video-Replay",
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

function multimodalVideoState(unlocked: boolean): GameState {
	let state = startRun({ companyName: "Video Labs" }, 42);
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
	completeResearchPrerequisites(state, VIDEO_WORLD_MODELS_ID);
	if (!unlocked) {
		const unlock = state.research.nodes.find(
			(node) => node.id === VIDEO_WORLD_MODELS_ID,
		);
		if (unlock === undefined) throw new Error("Expected Video unlock node");
		unlock.status = "locked";
	}
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

describe("video model family", () => {
	it("defines a multimodal video family with a research unlock and real serving tradeoff", () => {
		const family = MODEL_FAMILIES.find(
			(candidate) => (candidate.id as string) === "video",
		);
		expect(family).toMatchObject({
			id: "video",
			allowedEras: ["multimodal"],
			unlockedByResearchNodeId: VIDEO_WORLD_MODELS_ID,
			dataMixRequirements: {
				general: 15,
				code: 5,
				multimodal: 40,
			},
			servingComputePerUserPercent: 250,
			scoreCeilingAdjustment: -8,
		});

		const unlock = RESEARCH_NODES.find(
			(node) => (node.id as string) === VIDEO_WORLD_MODELS_ID,
		);
		expect(unlock).toMatchObject({
			era: "multimodal",
			category: "multimodal_agents",
			branch: "models",
			status: "locked",
			prerequisites: expect.arrayContaining([
				"assistant_models_keystone",
				"multimodal_models_fusion",
				"vision_encoders",
			]),
		});
	});

	it("unlocks Video through the real research project path", () => {
		let state = multimodalVideoState(false);
		state = researchSystem(state, { phase: "research", week: 5 }).state;
		const project = state.projects.items.find(
			(candidate) =>
				candidate.kind === "research" &&
				candidate.nodeId === VIDEO_WORLD_MODELS_ID &&
				candidate.status === "available",
		);
		const team = state.teams.items.find(
			(candidate) => candidate.activeProjectId === null,
		);
		if (project === undefined || team === undefined) {
			throw new Error(
				"Expected an available Video unlock project and idle team",
			);
		}
		state = assignProject(state, team.id, project.id).state;
		state = projectsSystem(state, { phase: "projects", week: 5 }).state;
		const completed = researchSystem(state, { phase: "research", week: 5 });
		expect(completed.state.research.nodes).toContainEqual(
			expect.objectContaining({
				id: VIDEO_WORLD_MODELS_ID,
				status: "completed",
			}),
		);
		expect(completed.facts).toContainEqual(
			expect.objectContaining({
				kind: "research_completed",
				nodeId: VIDEO_WORLD_MODELS_ID,
			}),
		);
	});

	it("rejects a Video design until its defining research node is complete", () => {
		expect(() => designModel(multimodalVideoState(false), VIDEO_SPEC)).toThrow(
			/completed research node video_world_models/i,
		);
	});

	it("requires multimodal training data and applies the Video score ceiling", () => {
		const lockedMix = multimodalVideoState(true);
		expect(() =>
			designModel(lockedMix, {
				...VIDEO_SPEC,
				dataMix: { general: 51, code: 10, multimodal: 39 },
			}),
		).toThrow(/at least 40 multimodal/i);

		const state = multimodalVideoState(true);
		const designed = designModel(state, VIDEO_SPEC);
		const model = designed.state.models.items.at(-1);
		const family = MODEL_FAMILIES.find((candidate) => candidate.id === "video");
		if (model === undefined || family === undefined) {
			throw new Error("Expected the designed Video model");
		}
		expect(model).toMatchObject({
			family: "video",
			dataMix: VIDEO_SPEC.dataMix,
			status: "designing",
			scoreCeiling: 80,
		});
		expect(model.scoreCeiling).toBe(88 + family.scoreCeilingAdjustment);
		expect(model.dataAllocation).toEqual([
			{ recordId: "data_001", amount: 20 },
			{ recordId: "data_002", amount: 10 },
			{ recordId: "data_003", amount: 70 },
		]);
		expect(
			designed.state.dataInventory.items.map((item) => item.reservedAmount),
		).toEqual([20, 10, 70]);
	});

	it("trains Video through the shared data and score paths without exposing hidden scores", () => {
		let state = designModel(multimodalVideoState(true), VIDEO_SPEC).state;
		for (const week of [2, 3, 4]) {
			state = trainingSystem(state, { phase: "training", week }).state;
		}
		const model = state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected trained Video model");
		expect(model.status).toBe("ready");
		expect(model.projectId).toBeNull();
		expect(model.trueScores).toBeDefined();
		expect(model.estimates).toBeDefined();
		expect(
			Math.max(...Object.values(model.trueScores ?? {})),
		).toBeLessThanOrEqual(model.scoreCeiling ?? 0);
		expect(
			state.dataInventory.items.map((item) => item.consumedAmount),
		).toEqual([20, 10, 70]);
		const visible = selectVisibleModels(state);
		expect(JSON.stringify(visible)).not.toContain("trueScores");
		expect(visible.find((item) => item.id === "model_003")?.family).toBe(
			"video",
		);
	});

	it("validates malformed family definitions and invalid research unlock references", () => {
		expect(() => assertModelFamilyDefinitions(MODEL_FAMILIES)).not.toThrow();

		const malformed = MODEL_FAMILIES.map((family) => ({
			...family,
			baseScoreProfile: { ...family.baseScoreProfile },
			dataMixRequirements: { ...family.dataMixRequirements },
		}));
		const video = malformed.find((family) => family.id === "video");
		if (video === undefined)
			throw new Error("Expected Video family definition");
		(video as { unlockedByResearchNodeId: string }).unlockedByResearchNodeId =
			"missing_video_unlock";
		expect(() => assertModelFamilyDefinitions(malformed)).toThrow(
			/unknown research unlock/i,
		);

		const unknownFamily = MODEL_FAMILIES.map((family) => ({ ...family }));
		const unknown = unknownFamily.find((family) => family.id === "video");
		if (unknown === undefined)
			throw new Error("Expected Video family definition");
		(unknown as { id: string }).id = "future_family";
		expect(() => assertModelFamilyDefinitions(unknownFamily)).toThrow(
			/unsupported.*value/i,
		);

		const malformedResearch = RESEARCH_NODES.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})) as unknown as ResearchDefinition[];
		const videoUnlock = malformedResearch.find(
			(node) => node.id === VIDEO_WORLD_MODELS_ID,
		);
		if (videoUnlock === undefined)
			throw new Error("Expected Video unlock node");
		(videoUnlock.prerequisites as string[]).push("missing_video_prerequisite");
		expect(() => assertResearchDefinitions(malformedResearch)).toThrow(
			/unknown.*prerequisite/i,
		);
	});

	it("does not mutate the input while designing Video", () => {
		const state = multimodalVideoState(true);
		const before = JSON.stringify(state);
		designModel(state, VIDEO_SPEC);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("serves Video through the broad chat channel and creates viral shared-compute pressure", () => {
		let state = multimodalVideoState(true);
		state = designAndTrainVideo(state);
		state = launchProduct(state, "model_003", "chat").state;
		state = runEvaluation(state, "model_003", "capability").state;
		const video = state.products.items.find(
			(product) => product.modelId === "model_003",
		);
		if (video === undefined) throw new Error("Expected launched Video product");
		video.users = 100;
		video.servingDemand = 250;
		state.compute.capacity = 100;
		state.compute = withRecomputedCompute(state);
		const result = productsSystem(state, { phase: "products", week: 5 });
		const conflict = result.facts.find(
			(fact) => fact.kind === "compute_conflict",
		);
		expect(conflict).toMatchObject({
			viral: true,
			choice: "serving_throttled",
		});
		expect(result.state.compute.servingDemand).toBeGreaterThan(150);
	});

	it("recomputes the high Video serving demand when resuming a paused product", () => {
		let state = designAndTrainVideo(multimodalVideoState(true));
		state = launchProduct(state, "model_003", "chat").state;
		const product = state.products.items.find(
			(item) => item.modelId === "model_003",
		);
		if (product === undefined) throw new Error("Expected the Video product");
		product.status = "paused";
		product.users = 12;
		product.servingDemand = 0;
		state.compute = withRecomputedCompute(state);

		const resumed = applyProductResume(state, product.id).state;
		const resumedProduct = resumed.products.items.find(
			(item) => item.id === product.id,
		);
		if (resumedProduct === undefined)
			throw new Error("Expected resumed Video product");
		expect(resumedProduct.servingDemand).toBe(30);
		expect(resumed.compute.servingDemand).toBe(
			resumed.products.items.reduce(
				(total, item) => total + (item.servingDemand ?? 0),
				0,
			),
		);
	});

	it("round-trips Video model data without leaking hidden scores", () => {
		const state = designAndTrainVideo(multimodalVideoState(true));
		const serialized = serializeGameState(state);
		const restored = deserializeGameState(serialized);
		expect(canonicalEqual(restored, state)).toBe(true);
		expect(serializeGameState(restored)).toBe(serialized);
		expect(JSON.stringify(selectVisibleModels(restored))).not.toContain(
			"trueScores",
		);
	});

	it("replays a command log containing the real Video design and launch", {
		timeout: 300_000,
	}, () => {
		const live = videoReplayRun();
		const video = live.models.items.find((model) => model.family === "video");
		if (video === undefined)
			throw new Error("Expected a Video model in replay fixture");
		expect(video.status).toBe("launched");
		expect(live.commandLog).toContainEqual(
			expect.objectContaining({ kind: "design_model", family: "video" }),
		);

		const replayed = replayCommandLog(live.commandLog, {
			initialCash: 10_000,
			expectedState: live,
		});
		expect(canonicalEqual(replayed, live)).toBe(true);
		expect(replayed.commandLog).toEqual(live.commandLog);
	});
});

function designAndTrainVideo(input: GameState): GameState {
	let state = designModel(input, VIDEO_SPEC).state;
	for (const week of [2, 3, 4]) {
		state = trainingSystem(state, { phase: "training", week }).state;
	}
	return state;
}

function choiceFor(decision: PendingDecision) {
	switch (decision.kind) {
		case "launch":
			return decision.channel === undefined || decision.channel === "chat"
				? applyDecisionChoice(decision, "chat")
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

function applyDecisionChoice(
	decision: Extract<PendingDecision, { kind: "launch" }>,
	channel: "chat",
) {
	return {
		kind: "launch" as const,
		decisionId: decision.id,
		channel,
		...(decision.price === undefined ? {} : { price: decision.price }),
	};
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
	throw new Error("Video replay fixture exceeded its decision guard");
}

function completeResearchNode(state: GameState, nodeId: string): GameState {
	let current = state;
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

	current = complete(current, nodeId);
	return current;
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

function videoReplayRun(): GameState {
	let state = startRun({ companyName: "Video Replay" }, 42);
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
	state = completeResearchNode(state, VIDEO_WORLD_MODELS_ID);
	return trainAndLaunch(state, VIDEO_REPLAY_SPEC);
}
