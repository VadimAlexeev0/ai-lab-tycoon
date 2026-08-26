import { describe, expect, it } from "vitest";

import { advanceWeek } from "./advance-week.js";
import type { Model } from "./components/models.js";
import { BALANCE } from "./data/balance.js";
import { TEXT_MODELS_KEYSTONE_ID } from "./data/research.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import {
	deriveEstimateBands,
	designModel,
	type ModelDesignSpec,
} from "./model-design.js";
import type { GameState } from "./state.js";
import { researchSystem } from "./systems/research.js";
import { trainingSystem } from "./systems/training.js";

const TEXT_SPEC: ModelDesignSpec = {
	name: "Aurora-1",
	family: "text",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function designableState(seed = 42): GameState {
	const state = startRun({ companyName: "Acme Labs" }, seed);
	const node = state.research.nodes.find(
		(item) => item.id === "text_models_principles",
	);
	if (node === undefined) {
		throw new Error("Expected the Text model research node");
	}
	node.status = "completed";
	return state;
}

function multimodalDesignableState(seed = 42): GameState {
	const state = designableState(seed);
	state.meta.era = "multimodal";
	state.research.currentEra = "multimodal";
	for (const node of state.research.nodes) {
		if (
			node.id === "assistant_models_tool_use" ||
			node.id === "multimodal_models_fusion"
		) {
			node.status = "completed";
		}
	}
	return state;
}

function train(state: GameState, spec: ModelDesignSpec): GameState {
	const designed = designModel(state, spec).state;
	const project = designed.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected an active training project");
	}
	project.duration = 1;
	return trainingSystem(designed, { phase: "training", week: 1 }).state;
}

function parentModel(trueScores: Model["trueScores"]): Model {
	if (trueScores === undefined) {
		throw new Error("Expected parent scores");
	}
	return {
		id: "model_001",
		name: "Parent-1",
		family: "text",
		foundation: "fresh",
		status: "ready",
		projectId: null,
		tier: "aggressive",
		scoreCeiling: 100,
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		trueScores,
	};
}

function cloneState(state: GameState): GameState {
	return JSON.parse(JSON.stringify(state)) as GameState;
}

describe("Task 6 review regressions", () => {
	it("stores a noisy estimate separately from every hidden true score", () => {
		const state = train(designableState(), TEXT_SPEC);
		const model = state.models.items.at(-1);
		if (model?.trueScores === undefined || model.estimates === undefined) {
			throw new Error("Expected trained scores and estimates");
		}
		expect(state.compute.trainingDemand).toBe(0);

		expect(
			Object.keys(model.trueScores).some(
				(dimension) =>
					model.estimates?.[dimension as keyof typeof model.trueScores]
						.estimate !==
					model.trueScores?.[dimension as keyof typeof model.trueScores],
			),
		).toBe(true);
	});

	it("keeps estimate bounds integral for fractional evaluation coverage", () => {
		const state = train(designableState(), TEXT_SPEC);
		const model = state.models.items.at(-1);
		if (model?.trueScores === undefined) {
			throw new Error("Expected trained scores");
		}

		const estimateScores = Object.fromEntries(
			Object.entries(model.estimates ?? {}).map(([dimension, band]) => [
				dimension,
				band.estimate,
			]),
		) as NonNullable<typeof model.trueScores>;
		const estimates = deriveEstimateBands(
			model.trueScores,
			0.1,
			estimateScores,
		);
		for (const band of Object.values(estimates)) {
			expect(Number.isInteger(band.estimate)).toBe(true);
			expect(Number.isInteger(band.lower)).toBe(true);
			expect(Number.isInteger(band.upper)).toBe(true);
		}
	});

	it("requires a scored ready parent for continued and distilled foundations", () => {
		const state = designableState();
		state.models.items.push(
			parentModel({
				capability: 80,
				coding: 80,
				reliability: 80,
				safety: 80,
				efficiency: 80,
				multimodal: 80,
			}),
		);
		state.counters.model = 2;

		const missingScores = cloneState(state);
		delete missingScores.models.items[0]?.trueScores;
		expect(() =>
			designModel(missingScores, {
				...TEXT_SPEC,
				foundation: "continued",
				parentModelId: "model_001",
			}),
		).toThrow(/true score|scored|parent/i);

		const continued = designModel(state, {
			...TEXT_SPEC,
			foundation: "continued",
			parentModelId: "model_001",
		}).state;
		const continuedProject = continued.projects.items.at(-1);
		if (
			continuedProject === undefined ||
			continuedProject.kind !== "training"
		) {
			throw new Error("Expected continued training project");
		}
		continuedProject.duration = 1;
		const continuedResult = trainingSystem(continued, {
			phase: "training",
			week: 1,
		}).state;
		const continuedScores = continuedResult.models.items.at(-1)?.trueScores;
		if (continuedScores === undefined) {
			throw new Error("Expected continued scores");
		}
		for (const score of Object.values(continuedScores)) {
			expect(score).toBeGreaterThanOrEqual(48);
		}

		const distilled = designModel(state, {
			...TEXT_SPEC,
			foundation: "distilled",
			parentModelId: "model_001",
		}).state;
		const distilledProject = distilled.projects.items.at(-1);
		if (
			distilledProject === undefined ||
			distilledProject.kind !== "training"
		) {
			throw new Error("Expected distilled training project");
		}
		distilledProject.duration = 1;
		const distilledResult = trainingSystem(distilled, {
			phase: "training",
			week: 1,
		}).state;
		const distilledScores = distilledResult.models.items.at(-1)?.trueScores;
		if (distilledScores === undefined) {
			throw new Error("Expected distilled scores");
		}
		for (const score of Object.values(distilledScores)) {
			expect(score).toBeGreaterThanOrEqual(24);
		}

		expect(BALANCE.modelFoundations.continued.cost).toBeGreaterThan(
			BALANCE.modelFoundations.fresh.cost,
		);
		expect(BALANCE.modelFoundations.distilled.cost).toBeGreaterThan(
			BALANCE.modelFoundations.continued.cost,
		);
		expect(BALANCE.modelFoundations.continued.duration).toBeGreaterThan(
			BALANCE.modelFoundations.fresh.duration,
		);
		expect(BALANCE.modelFoundations.distilled.duration).toBeGreaterThan(
			BALANCE.modelFoundations.continued.duration,
		);
	});

	it("makes multimodal recipes materially different instead of saturating standard tier", () => {
		const multimodalSpecs: ModelDesignSpec[] = [
			{
				name: "Vision-Low",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 75, code: 5, multimodal: 20 },
				emphasis: TEXT_SPEC.emphasis,
			},
			{
				name: "Vision-Mid",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 40, code: 20, multimodal: 40 },
				emphasis: TEXT_SPEC.emphasis,
			},
			{
				name: "Vision-High",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 20, code: 5, multimodal: 75 },
				emphasis: TEXT_SPEC.emphasis,
			},
		];
		const multimodalScores = multimodalSpecs.map((spec) => {
			const state = train(multimodalDesignableState(), spec);
			const score = state.models.items.at(-1)?.trueScores?.multimodal;
			if (score === undefined) {
				throw new Error("Expected multimodal score");
			}
			return score;
		});

		expect(
			Math.max(...multimodalScores) - Math.min(...multimodalScores),
		).toBeGreaterThan(15);
	});

	it("reaches the Multimodal era only through the Assistant keystone", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const textKeystone = state.research.nodes.find(
			(node) => node.id === TEXT_MODELS_KEYSTONE_ID,
		);
		if (textKeystone === undefined) {
			throw new Error("Expected Text keystone");
		}
		textKeystone.status = "completed";

		const assistantEra = researchSystem(state, {
			phase: "research",
			week: 2,
		}).state;
		expect(assistantEra.meta.era).toBe("assistant");

		const reasoning = assistantEra.research.nodes.find(
			(node) => node.id === "assistant_models_reasoning",
		);
		const toolUse = assistantEra.research.nodes.find(
			(node) => node.id === "assistant_models_tool_use",
		);
		const assistantKeystone = assistantEra.research.nodes.find(
			(node) => node.id === "assistant_models_keystone",
		);
		if (
			reasoning === undefined ||
			toolUse === undefined ||
			assistantKeystone === undefined
		) {
			throw new Error("Expected Assistant model research nodes");
		}
		reasoning.status = "completed";
		toolUse.status = "completed";

		const assistantReady = researchSystem(assistantEra, {
			phase: "research",
			week: 3,
		}).state;
		const readyKeystone = assistantReady.research.nodes.find(
			(node) => node.id === assistantKeystone.id,
		);
		if (readyKeystone === undefined) {
			throw new Error("Expected Assistant keystone state");
		}
		readyKeystone.status = "completed";

		const multimodal = researchSystem(assistantReady, {
			phase: "research",
			week: 4,
		}).state;
		expect(multimodal.meta.era).toBe("multimodal");
		expect(
			multimodal.research.nodes.find(
				(node) => node.id === "multimodal_models_fusion",
			)?.status,
		).toBe("available");
	});

	it("stalls training when active demand exceeds compute capacity", () => {
		const designed = designModel(designableState(), TEXT_SPEC).state;
		const project = designed.projects.items.at(-1);
		if (project === undefined || project.kind !== "training") {
			throw new Error("Expected active training project");
		}
		project.duration = 2;
		designed.compute.capacity = BALANCE.modelTiers.standard.trainingCompute - 1;
		designed.compute.allocated = designed.compute.capacity;

		const result = trainingSystem(designed, { phase: "training", week: 1 });
		expect(result.state.compute.trainingDemand).toBe(
			BALANCE.modelTiers.standard.trainingCompute,
		);
		expect(result.state.projects.items.at(-1)?.progress).toBe(0);
	});

	it("replays every logged design_model and advance_week command byte-for-byte", () => {
		const originalStart = designableState(42);
		let original = designModel(originalStart, TEXT_SPEC).state;
		for (let index = 0; index < 3; index += 1) {
			original = advanceWeek(original).state;
		}

		const startCommand = original.commandLog[0];
		if (startCommand === undefined || startCommand.kind !== "start_run") {
			throw new Error("Expected start_run replay anchor");
		}
		let replayed = startRun(startCommand.setup, startCommand.seed);
		const replayNode = replayed.research.nodes.find(
			(node) => node.id === "text_models_principles",
		);
		if (replayNode === undefined) {
			throw new Error("Expected the replay research node");
		}
		replayNode.status = "completed";
		for (const command of original.commandLog.slice(1)) {
			switch (command.kind) {
				case "design_model":
					replayed = designModel(replayed, {
						name: command.name,
						family: command.family,
						foundation: command.foundation,
						parentModelId: command.parentModelId,
						tier: command.tier,
						dataMix: command.dataMix,
						emphasis: command.emphasis,
						teamId: command.teamId,
					}).state;
					break;
				case "advance_week":
					replayed = advanceWeek(replayed).state;
					break;
				default:
					throw new Error(`Unexpected replay command: ${command.kind}`);
			}
		}

		expect(JSON.stringify(replayed)).toBe(JSON.stringify(original));
		expect(replayed).toEqual(original);
	});

	it("rejects design log IDs that do not reference state and payloads that drift", () => {
		const designed = designModel(designableState(), TEXT_SPEC).state;
		for (const mutate of [
			(entry: Record<string, unknown>) => {
				entry.modelId = "model_404";
			},
			(entry: Record<string, unknown>) => {
				entry.projectId = "project_001";
			},
			(entry: Record<string, unknown>) => {
				entry.teamId = "team_404";
			},
			(entry: Record<string, unknown>) => {
				entry.name = "Tampered";
			},
		]) {
			const invalid = cloneState(designed);
			const entry = invalid.commandLog.at(-1);
			if (entry === undefined || entry.kind !== "design_model") {
				throw new Error("Expected design command");
			}
			mutate(entry as unknown as Record<string, unknown>);
			expect(() => assertGameState(invalid)).toThrow(
				/design|model|project|team|payload/i,
			);
		}
	});
});
