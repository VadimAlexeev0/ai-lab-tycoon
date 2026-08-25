import { describe, expect, it } from "vitest";

import { BALANCE } from "./data/balance.js";
import { MODEL_FAMILIES } from "./data/model-families.js";
import { startRun } from "./index.js";
import { designModel, type ModelDesignSpec } from "./model-design.js";
import { selectVisibleModels } from "./selectors.js";
import type { GameState } from "./state.js";

const TEXT_NODE_ID = "text_models_principles";

const VALID_SPEC: ModelDesignSpec = {
	name: "Aurora-1",
	family: "text",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function designableState(seed = 42): GameState {
	const state = startRun({ companyName: "Acme Labs" }, seed);
	const node = state.research.nodes.find((item) => item.id === TEXT_NODE_ID);
	if (node === undefined) {
		throw new Error("Expected the Text model research node");
	}
	node.status = "completed";
	return state;
}

function spec(overrides: Partial<ModelDesignSpec> = {}): ModelDesignSpec {
	return { ...VALID_SPEC, ...overrides };
}

describe("model family data", () => {
	it("defines the three V1 model families with research gates and score hints", () => {
		expect(MODEL_FAMILIES.map((family) => family.id)).toEqual([
			"text",
			"assistant",
			"multimodal",
		]);
		for (const family of MODEL_FAMILIES) {
			expect(family.displayName.length).toBeGreaterThan(0);
			expect(family.allowedEras.length).toBeGreaterThan(0);
			expect(family.unlockedByResearchNodeId.length).toBeGreaterThan(0);
			expect(Object.keys(family.baseScoreProfile).length).toBeGreaterThan(0);
			expect(Object.keys(family.dataMixRequirements).length).toBe(3);
		}
	});
});

describe("model designer", () => {
	it.each([
		["blank name", { name: "   " }, /name.*empty|name.*required/i],
		[
			"data mix below 100",
			{ dataMix: { general: 60, code: 30, multimodal: 9 } },
			/data mix.*100|total.*100/i,
		],
		[
			"data mix above 100",
			{ dataMix: { general: 60, code: 30, multimodal: 11 } },
			/data mix.*100|total.*100/i,
		],
		[
			"emphasis below six",
			{ emphasis: { capability: 2, reliability: 1, safety: 1, efficiency: 1 } },
			/emphasis.*6|total.*6/i,
		],
		[
			"emphasis above six",
			{ emphasis: { capability: 3, reliability: 2, safety: 1, efficiency: 1 } },
			/emphasis.*6|total.*6/i,
		],
	] as const)("rejects %s", (_name, overrides, message) => {
		expect(() => designModel(designableState(), spec(overrides))).toThrow(
			message,
		);
	});

	it("rejects an unknown family, an unresearched family, and a wrong-era family", () => {
		expect(() =>
			designModel(designableState(), spec({ family: "unknown" as never })),
		).toThrow(/family.*unknown|unsupported.*family/i);

		expect(() =>
			designModel(startRun({ companyName: "Acme Labs" }, 42), spec()),
		).toThrow(/research|unlock/i);

		expect(() =>
			designModel(designableState(), spec({ family: "assistant" })),
		).toThrow(/era|available/i);
	});

	it("enforces a single active training run and requires an idle team", () => {
		const first = designModel(designableState(), spec()).state;
		expect(() => designModel(first, spec({ name: "Aurora-2" }))).toThrow(
			/one.*training|active.*training/i,
		);

		const noIdleTeam = designableState();
		const team = noIdleTeam.teams.items[0];
		if (team === undefined) {
			throw new Error("Expected the founding team");
		}
		team.activeProjectId = noIdleTeam.projects.items[0]?.id ?? "project_001";
		expect(() => designModel(noIdleTeam, spec())).toThrow(/idle team|team/i);
	});

	it("creates an active designing model and training project with deterministic IDs", () => {
		const state = designableState();
		const result = designModel(state, VALID_SPEC);
		const model = result.state.models.items.at(-1);
		const project = result.state.projects.items.at(-1);
		if (model === undefined || project === undefined) {
			throw new Error("Expected a model and training project");
		}

		expect(model).toMatchObject({
			id: "model_001",
			name: VALID_SPEC.name,
			family: VALID_SPEC.family,
			foundation: VALID_SPEC.foundation,
			tier: VALID_SPEC.tier,
			status: "designing",
			projectId: project.id,
			parentModelId: null,
			dataMix: VALID_SPEC.dataMix,
			emphasis: VALID_SPEC.emphasis,
		});
		expect(model).not.toHaveProperty("trueScores");
		expect(model).not.toHaveProperty("estimates");
		expect(project).toMatchObject({
			id: "project_004",
			kind: "training",
			modelId: model.id,
			teamId: "team_001",
			status: "active",
			progress: 0,
			duration: BALANCE.modelTiers.standard.duration,
		});
		expect(result.state.company.cash).toBe(
			state.company.cash - BALANCE.modelTiers.standard.cost,
		);
		expect(result.state.commandLog.at(-1)).toMatchObject({
			id: "command_002",
			kind: "design_model",
			week: 1,
			modelId: model.id,
			projectId: project.id,
			teamId: "team_001",
			name: VALID_SPEC.name,
			family: VALID_SPEC.family,
			foundation: VALID_SPEC.foundation,
			tier: VALID_SPEC.tier,
			dataMix: VALID_SPEC.dataMix,
			emphasis: VALID_SPEC.emphasis,
		});
		expect(selectVisibleModels(result.state)).toEqual([
			{ id: "model_001", name: "Aurora-1", family: "text" },
		]);
	});

	it("uses balance tiers for duration, cost, compute demand, and score ceiling", () => {
		const results = (["lean", "standard", "aggressive"] as const).map((tier) =>
			designModel(designableState(), spec({ name: tier, tier })),
		);

		expect(results.map((result) => result.state.company.cash)).toEqual(
			(["lean", "standard", "aggressive"] as const).map(
				(tier) => BALANCE.startingCash - BALANCE.modelTiers[tier].cost,
			),
		);
		expect(
			results.map((result) => result.state.projects.items.at(-1)?.duration),
		).toEqual(
			(["lean", "standard", "aggressive"] as const).map(
				(tier) => BALANCE.modelTiers[tier].duration,
			),
		);
		expect(
			results.map((result) => result.state.models.items.at(-1)?.scoreCeiling),
		).toEqual(
			(["lean", "standard", "aggressive"] as const).map(
				(tier) => BALANCE.modelTiers[tier].scoreCeiling,
			),
		);
	});

	it("requires compatible ready parents for continued and distilled foundations", () => {
		const missingParent = designableState();
		expect(() =>
			designModel(missingParent, spec({ foundation: "continued" })),
		).toThrow(/continued.*parent|compatible.*parent/i);

		const incompatible = designableState();
		incompatible.models.items.push({
			id: "model_001",
			name: "Unready",
			family: "text",
			foundation: "fresh",
			status: "shelved",
			projectId: null,
		});
		expect(() =>
			designModel(
				incompatible,
				spec({ foundation: "continued", parentModelId: "model_001" }),
			),
		).toThrow(/ready|compatible|parent/i);

		const compatible = designableState();
		compatible.models.items.push({
			id: "model_001",
			name: "Text Parent",
			family: "text",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			trueScores: {
				capability: 70,
				coding: 70,
				reliability: 70,
				safety: 70,
				efficiency: 70,
				multimodal: 70,
			},
		});
		compatible.counters.model = 2;
		const continued = designModel(
			compatible,
			spec({ foundation: "continued", parentModelId: "model_001" }),
		);
		expect(continued.state.models.items.at(-1)).toMatchObject({
			foundation: "continued",
			parentModelId: "model_001",
		});
		const distilled = designModel(
			compatible,
			spec({ foundation: "distilled", parentModelId: "model_001" }),
		);
		expect(distilled.state.models.items.at(-1)).toMatchObject({
			foundation: "distilled",
			parentModelId: "model_001",
		});
	});

	it("rejects insufficient cash without mutating the input state", () => {
		const state = designableState();
		state.company.cash = BALANCE.modelTiers.standard.cost - 1;
		expect(() => designModel(state, VALID_SPEC)).toThrow(/cash|cost/i);
		expect(state.models.items).toEqual([]);
		expect(state.commandLog).toHaveLength(1);
	});
});
