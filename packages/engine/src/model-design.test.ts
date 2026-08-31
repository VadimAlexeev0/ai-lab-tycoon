import { describe, expect, it } from "vitest";

import { BALANCE } from "./data/balance.js";
import { MODEL_FAMILIES } from "./data/model-families.js";
import { startRun } from "./index.js";
import {
	deriveEstimateBands,
	designModel,
	generateTrueScores,
	type ModelDesignSpec,
} from "./model-design.js";
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
	// The keystone's own prerequisite must be complete for the graph invariant.
	const principles = state.research.nodes.find(
		(item) => item.id === "text_models_principles",
	);
	if (principles !== undefined) principles.status = "completed";
	return state;
}

function nodeOnlyEraState(era: "assistant" | "multimodal"): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.meta.era = era;
	state.research.currentEra = era;
	for (const node of state.research.nodes) {
		if (era === "assistant" && node.era === "multimodal") continue;
		node.status = "completed";
	}
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

	it.each(["assistant", "multimodal"] as const)(
		"rejects a future-era design from a node-only %s save",
		(era) => {
			expect(() =>
				designModel(
					nodeOnlyEraState(era),
					spec({
						family: era,
						...(era === "multimodal"
							? { dataMix: { general: 50, code: 30, multimodal: 20 } }
							: {}),
					}),
				),
			).toThrow(/shipped.*proof|proof/i);
		},
	);

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
			tier: "lean",
			trueScores: {
				capability: 50,
				coding: 50,
				reliability: 50,
				safety: 50,
				efficiency: 50,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 50, lower: 40, upper: 60 },
				coding: { estimate: 50, lower: 40, upper: 60 },
				reliability: { estimate: 50, lower: 40, upper: 60 },
				safety: { estimate: 50, lower: 40, upper: 60 },
				efficiency: { estimate: 50, lower: 40, upper: 60 },
				multimodal: { estimate: 0, lower: 0, upper: 10 },
			},
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
			tier: "lean",
			trueScores: {
				capability: 70,
				coding: 70,
				reliability: 70,
				safety: 70,
				efficiency: 70,
				multimodal: 70,
			},
			estimates: {
				capability: { estimate: 70, lower: 50, upper: 90 },
				coding: { estimate: 70, lower: 50, upper: 90 },
				reliability: { estimate: 70, lower: 50, upper: 90 },
				safety: { estimate: 70, lower: 50, upper: 90 },
				efficiency: { estimate: 70, lower: 50, upper: 90 },
				multimodal: { estimate: 0, lower: 0, upper: 10 },
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

	it("accepts documented field aliases and normalizes them identically", () => {
		const aliasSpec: ModelDesignSpec = {
			name: "Aurora-1",
			modelFamily: "text",
			foundation: "fresh",
			computeTier: "lean",
			assignedTeamId: "team_001",
			parentId: null,
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		};
		const viaAliases = designModel(designableState(), aliasSpec);
		expect(viaAliases.state.models.items.at(-1)).toMatchObject({
			family: "text",
			tier: "lean",
			parentModelId: null,
		});
		expect(viaAliases.state.projects.items.at(-1)).toMatchObject({
			teamId: "team_001",
		});

		const legacyFields = designModel(
			designableState(),
			spec({ parentModelId: null }),
		);
		expect(legacyFields.state.models.items.at(-1)?.parentModelId).toBeNull();
	});

	it("rejects conflicting alias fields and unexpected spec keys", () => {
		expect(() =>
			designModel(designableState(), spec({ modelFamily: "assistant" })),
		).toThrow(/agree/i);
		expect(() =>
			designModel(designableState(), spec({ computeTier: "aggressive" })),
		).toThrow(/agree/i);
		expect(() =>
			designModel(
				designableState(),
				spec({ parentModelId: "model_001", parentId: null }),
			),
		).toThrow(/agree/i);
		expect(() =>
			designModel(
				designableState(),
				spec({ teamId: "team_001", assignedTeamId: "team_002" }),
			),
		).toThrow(/agree/i);
		expect(() =>
			designModel(designableState(), spec({ unexpected: true } as never)),
		).toThrow(/unexpected/i);
	});

	it("rejects a parent model on a fresh foundation", () => {
		expect(() =>
			designModel(designableState(), spec({ parentModelId: "model_001" })),
		).toThrow(/fresh.*parent|parent.*fresh/i);
	});

	it("rejects an unknown or busy requested team", () => {
		expect(() =>
			designModel(designableState(), spec({ teamId: "team_404" })),
		).toThrow(/unknown team/i);

		const busy = designableState();
		const team = busy.teams.items[0];
		const project = busy.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}
		team.activeProjectId = project.id;
		project.teamId = team.id;
		project.status = "active";
		expect(() => designModel(busy, spec({ teamId: "team_001" }))).toThrow(
			/idle/i,
		);
	});

	it("rejects fractional or negative data mix and emphasis values", () => {
		expect(() =>
			designModel(
				designableState(),
				spec({ dataMix: { general: 60.5, code: 30, multimodal: 9.5 } }),
			),
		).toThrow(/non-negative integer|integer/i);
		expect(() =>
			designModel(
				designableState(),
				spec({ dataMix: { general: 60, code: 30, multimodal: -10 } }),
			),
		).toThrow(/non-negative/i);
		expect(() =>
			designModel(
				designableState(),
				spec({
					emphasis: {
						capability: 2,
						reliability: 2,
						safety: -1,
						efficiency: 3,
					},
				}),
			),
		).toThrow(/non-negative/i);
		expect(() =>
			designModel(
				designableState(),
				spec({ dataMix: { general: 60, code: 25, multimodal: 10 } }),
			),
		).toThrow(/total/i);
	});
});

describe("score generation contract", () => {
	it("generates the exact golden hidden scores and estimates for seed 42", () => {
		const generated = generateTrueScores(designableState().rng, {
			id: "model_001",
			name: "Aurora-1",
			family: "text",
			foundation: "fresh",
			tier: "standard",
			scoreCeiling: BALANCE.modelTiers.standard.scoreCeiling,
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			status: "training",
			projectId: null,
		});

		expect(generated.trueScores).toEqual({
			capability: 59,
			coding: 41,
			reliability: 62,
			safety: 43,
			efficiency: 61,
			multimodal: 41,
		});
		expect(generated.estimates).toEqual({
			capability: { estimate: 49, lower: 29, upper: 69 },
			coding: { estimate: 38, lower: 18, upper: 58 },
			reliability: { estimate: 65, lower: 45, upper: 85 },
			safety: { estimate: 35, lower: 15, upper: 55 },
			efficiency: { estimate: 66, lower: 46, upper: 86 },
			multimodal: { estimate: 35, lower: 15, upper: 55 },
		});
		expect(generated.rng.streams.training).toEqual([
			811944827, 419055407, 1571840862, -1732192921,
		]);
	});

	it("derives default-width bands at zero coverage and minimum width at high coverage", () => {
		const trueScores = {
			capability: 59,
			coding: 41,
			reliability: 62,
			safety: 43,
			efficiency: 61,
			multimodal: 41,
		};
		const estimateScores = {
			capability: 49,
			coding: 38,
			reliability: 65,
			safety: 35,
			efficiency: 66,
			multimodal: 35,
		};

		const wide = deriveEstimateBands(trueScores, 0, estimateScores);
		expect(wide.capability).toEqual({ estimate: 49, lower: 29, upper: 69 });

		const narrow = deriveEstimateBands(trueScores, 35, estimateScores);
		expect(narrow.capability).toEqual({
			estimate: 49,
			lower: 48,
			upper: 50,
		});
		for (const band of Object.values(narrow)) {
			expect(band.upper - band.lower).toBe(
				2 * BALANCE.modelScore.minimumEstimateBandWidth,
			);
		}
	});

	it("rejects malformed scores, estimates, and coverage", () => {
		const trueScores = {
			capability: 59,
			coding: 41,
			reliability: 62,
			safety: 43,
			efficiency: 61,
			multimodal: 41,
		};
		const estimateScores = {
			capability: 49,
			coding: 38,
			reliability: 65,
			safety: 35,
			efficiency: 66,
			multimodal: 35,
		};
		expect(() =>
			deriveEstimateBands(
				{ ...trueScores, capability: 59.5 },
				0,
				estimateScores,
			),
		).toThrow(/integer/i);
		expect(() =>
			deriveEstimateBands({ ...trueScores, coding: -1 }, 0, estimateScores),
		).toThrow(/between 0 and 100/i);
		expect(() =>
			deriveEstimateBands(trueScores, 0, {
				...estimateScores,
				reliability: Number.NaN,
			}),
		).toThrow(/finite/i);
		expect(() =>
			deriveEstimateBands(trueScores, Number.NaN, estimateScores),
		).toThrow(/finite/i);
		expect(() =>
			deriveEstimateBands(trueScores, 0, estimateScores),
		).not.toThrow();
	});
});
