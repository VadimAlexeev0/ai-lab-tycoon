import { describe, expect, it } from "vitest";
import { advanceWeek } from "./advance-week.js";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";
import { designModel, type ModelDesignSpec } from "./model-design.js";
import { selectVisibleModels } from "./selectors.js";
import type { GameState } from "./state.js";
import { trainingSystem } from "./systems/training.js";

const SPEC: ModelDesignSpec = {
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

function completedRun(seed = 42): { state: GameState; facts: unknown[] } {
	let state = designModel(designableState(seed), SPEC).state;
	const facts: unknown[] = [];
	const duration = BALANCE.modelTiers.standard.duration;
	for (let index = 0; index < duration; index += 1) {
		const result = advanceWeek(state);
		state = result.state;
		facts.push(...result.facts);
	}
	return { state, facts };
}

describe("training system", () => {
	it("progresses the active training project and leaves a designing model unfinished", () => {
		const designed = designModel(designableState(), SPEC).state;
		const result = trainingSystem(designed, { phase: "training", week: 1 });

		expect(result.state.projects.items.at(-1)).toMatchObject({
			kind: "training",
			status: "active",
			progress: BALANCE.projectProgressPerWeek.training,
		});
		expect(result.state.models.items.at(-1)?.status).toBe("training");
		expect(result.state.models.items.at(-1)).not.toHaveProperty("trueScores");
		expect(result.state.models.items.at(-1)).not.toHaveProperty("estimates");
		expect(result.facts).toContainEqual({
			kind: "project_progressed",
			projectId: "project_004",
			amount: BALANCE.projectProgressPerWeek.training,
			week: 1,
		});
	});

	it("completes training with bounded hidden scores and derived initial estimates", () => {
		const designed = designModel(designableState(), SPEC).state;
		const trainingProject = designed.projects.items.at(-1);
		if (trainingProject === undefined || trainingProject.kind !== "training") {
			throw new Error("Expected an active training project");
		}
		trainingProject.duration = 1;

		const result = trainingSystem(designed, { phase: "training", week: 1 });
		const model = result.state.models.items.at(-1);
		if (model === undefined) {
			throw new Error("Expected the trained model");
		}

		expect(model.status).toBe("ready");
		expect(model.projectId).toBeNull();
		expect(result.state.projects.items.at(-1)).toMatchObject({
			status: "completed",
			teamId: null,
			progress: 1,
		});
		expect(model.trueScores).toBeDefined();
		expect(model.estimates).toBeDefined();
		for (const score of Object.values(model.trueScores ?? {})) {
			expect(Number.isInteger(score)).toBe(true);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(
				BALANCE.modelTiers.standard.scoreCeiling,
			);
		}
		for (const [dimension, band] of Object.entries(model.estimates ?? {})) {
			expect(band.lower).toBeGreaterThanOrEqual(0);
			expect(band.upper).toBeLessThanOrEqual(100);
			expect(band.lower).toBeLessThanOrEqual(band.estimate);
			expect(band.estimate).toBeLessThanOrEqual(band.upper);
			expect(band.upper - band.lower).toBeLessThanOrEqual(
				2 * BALANCE.defaultEstimateBandWidth,
			);
			expect(
				band.upper - band.lower,
				`band width for ${dimension}`,
			).toBeGreaterThan(0);
		}
		expect(result.facts).toContainEqual({
			kind: "model_trained",
			modelId: model.id,
			week: 1,
		});
		expect(selectVisibleModels(result.state)).toEqual([
			{
				id: "model_001",
				name: SPEC.name,
				family: SPEC.family,
				estimates: model.estimates,
			},
		]);
		expect(JSON.stringify(selectVisibleModels(result.state))).not.toContain(
			"trueScores",
		);
	});

	it("wires training after research in advanceWeek and is byte deterministic", () => {
		const first = completedRun(42);
		const second = completedRun(42);
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
		expect(first.state.models.items.at(-1)?.status).toBe("ready");
		expect(first.state.models.items.at(-1)?.trueScores).toBeDefined();
		expect(first.state.commandLog.at(-1)).toEqual({
			id: "command_005",
			kind: "advance_week",
			week: 3,
		});
		expect(first.facts).toContainEqual({
			kind: "model_trained",
			modelId: "model_001",
			week: 3,
		});
	});

	it("does not generate scores at design time and isolates the training RNG stream", () => {
		const designed = designModel(designableState(), SPEC).state;
		const model = designed.models.items.at(-1);
		expect(model).toBeDefined();
		expect(model).not.toHaveProperty("trueScores");
		expect(model).not.toHaveProperty("estimates");
		const trainingProject = designed.projects.items.at(-1);
		if (trainingProject === undefined || trainingProject.kind !== "training") {
			throw new Error("Expected an active training project");
		}
		trainingProject.duration = 1;
		const before = JSON.stringify(designed.rng.streams.training);
		const result = trainingSystem(designed, { phase: "training", week: 1 });
		expect(JSON.stringify(designed.rng.streams.training)).toBe(before);
		expect(result.state.rng.streams.training).not.toEqual(
			designed.rng.streams.training,
		);
		expect(result.state.rng.streams.incidents).toEqual(
			designed.rng.streams.incidents,
		);
	});
});
