import { describe, expect, it } from "vitest";

import { canonicalEqual } from "./canonical.js";
import { assertModelsState, type Model } from "./components/models.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "./compute-reservations.js";
import {
	assertMultimodalArchitecturePathDefinitions,
	MULTIMODAL_ARCHITECTURE_PATHS,
} from "./data/multimodal-architectures.js";
import { RESEARCH_NODES } from "./data/research.js";
import {
	assertGameState,
	deserializeGameState,
	GAME_STATE_SCHEMA_VERSION,
	launchProduct,
	designModel as publicDesignModel,
	serializeGameState,
	upgradeGameState,
} from "./index.js";
import {
	designModel,
	designModelForLegacyReplay,
	generateTrueScores,
} from "./model-design.js";
import { applyProductResume, servingDemandForModel } from "./products.js";
import { replayCommandLog } from "./replay.js";
import { selectVisibleModels } from "./selectors.js";
import { startRun } from "./start-run.js";
import type { GameState } from "./state.js";
import { incidentsSystem } from "./systems/incidents.js";
import { productsSystem } from "./systems/products.js";
import { trainingSystem } from "./systems/training.js";

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
		brandId: `brand_${id}`,
		foundationId: `foundation_${id}`,
		foundationDebt: 0,
		foundationRisk: 0,
		status: "ready",
		projectId: null,
		family,
		tier: "standard",
		scoreCeiling: 88,
		trueScores: scores(),
		estimates: estimates(),
	};
}

function multimodalState(): GameState {
	let state = startRun({ companyName: "Architecture Labs" }, 42);
	state.company.cash = 10_000;
	state.company.hype = 100;
	state.company.trust = 100;
	state.company.insight = 20;
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
	for (const node of RESEARCH_NODES) {
		if (node.era === "multimodal") {
			const saved = state.research.nodes.find(
				(candidate) => candidate.id === node.id,
			);
			if (saved !== undefined) saved.status = "completed";
		}
	}
	state.compute.capacity = 100;
	state.compute = withRecomputedCompute(state);
	return state;
}

function legacyV9MultimodalFixture(
	dataMix = { general: 30, code: 20, multimodal: 50 },
): Record<string, unknown> {
	const designed = designModel(multimodalState(), {
		name: "Legacy Multimodal",
		family: "multimodal",
		foundation: "fresh",
		tier: "standard",
		dataMix: { general: 30, code: 20, multimodal: 50 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		architecturePath: "unified",
	}).state;
	const fixture = JSON.parse(serializeGameState(designed)) as Record<
		string,
		unknown
	>;
	const models = fixture.models as { items: Record<string, unknown>[] };
	for (const model of models.items) {
		if (model.family === "multimodal") {
			model.dataMix = { ...dataMix };
			delete model.architecturePath;
			delete model.architectureDebt;
		}
	}
	const commandLog = fixture.commandLog as Record<string, unknown>[];
	for (const command of commandLog) {
		if (command.kind === "design_model") {
			command.dataMix = { ...dataMix };
			delete command.architecturePath;
		}
	}
	(fixture.meta as Record<string, unknown>).schemaVersion = 9;
	return fixture;
}

function trainedPathState(
	architecturePath:
		| "unified"
		| "encoder_bolt_on"
		| "specialist_ensemble"
		| "clean_rebuild",
): GameState {
	let state = multimodalState();
	const parent = state.models.items.find(
		(model) => model.family === "assistant",
	);
	if (architecturePath === "encoder_bolt_on" && parent === undefined) {
		throw new Error("Expected an assistant parent");
	}
	state = designModel(state, {
		name: `Trained ${architecturePath}`,
		family: "multimodal",
		foundation: architecturePath === "encoder_bolt_on" ? "continued" : "fresh",
		...(architecturePath === "encoder_bolt_on" && parent !== undefined
			? { parentModelId: parent.id }
			: {}),
		tier: "standard",
		dataMix: { general: 30, code: 20, multimodal: 50 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		architecturePath,
	}).state;
	const project = state.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected a training project");
	}
	for (let index = 0; index < project.duration; index += 1) {
		state = trainingSystem(state, { phase: "training", week: index + 2 }).state;
	}
	return state;
}

function launchedPathState(
	architecturePath:
		| "unified"
		| "encoder_bolt_on"
		| "specialist_ensemble"
		| "clean_rebuild",
): GameState {
	const state = trainedPathState(architecturePath);
	const model = state.models.items.at(-1);
	if (model === undefined) throw new Error("Expected a trained model");
	model.estimates = estimates(100);
	return launchProduct(state, model.id, "chat").state;
}

function incidentPathState(
	architecturePath:
		| "unified"
		| "encoder_bolt_on"
		| "specialist_ensemble"
		| "clean_rebuild",
): GameState {
	const state = launchedPathState(architecturePath);
	const model = state.models.items.at(-1);
	if (model === undefined) throw new Error("Expected an incident model");
	const product = state.products.items.find(
		(item) => item.modelId === model.id,
	);
	if (product === undefined) throw new Error("Expected an incident product");
	for (const candidate of state.products.items) {
		if (candidate.id === product.id) continue;
		candidate.status = "paused";
		candidate.servingDemand = 0;
	}
	product.users = 20;
	product.servingDemand = servingDemandForModel(model, product.channel, 20);
	state.compute = withRecomputedCompute(state);
	return state;
}

describe("multimodal successor architecture paths", () => {
	it("requires an explicit architecture path for multimodal design", () => {
		const state = multimodalState();

		expect(() =>
			designModel(state, {
				name: "Aurora-M",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			} as never),
		).toThrow(/architecture.*path|architecture.*choice/i);
	});

	it("persists the selected unified architecture on the model and command", () => {
		const state = multimodalState();
		const result = designModel(state, {
			name: "Aurora-M",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		} as never);
		const model = result.state.models.items.at(-1);
		const command = result.state.commandLog.at(-1);

		expect(model).toMatchObject({
			family: "multimodal",
			architecturePath: "unified",
		});
		expect(command).toMatchObject({
			kind: "design_model",
			architecturePath: "unified",
		});
	});

	it("defines and applies four materially different architecture paths", () => {
		expect(MULTIMODAL_ARCHITECTURE_PATHS.map((path) => path.id)).toEqual([
			"unified",
			"encoder_bolt_on",
			"specialist_ensemble",
			"clean_rebuild",
		]);
		const designs = [
			designModel(multimodalState(), {
				name: "Unified",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "unified",
			}),
			designModel(multimodalState(), {
				name: "Specialists",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "specialist_ensemble",
			}),
			designModel(multimodalState(), {
				name: "Clean",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "clean_rebuild",
			}),
		];
		const models = designs.map((result) => result.state.models.items.at(-1));
		const projects = designs.map((result) =>
			result.state.projects.items.at(-1),
		);

		expect(models.map((model) => model?.architecturePath)).toEqual([
			"unified",
			"specialist_ensemble",
			"clean_rebuild",
		]);
		expect(models.map((model) => model?.architectureDebt)).toEqual([0, 10, 0]);
		expect(models[0]?.scoreCeiling).toBeGreaterThan(
			models[1]?.scoreCeiling ?? 0,
		);
		expect(models[0]?.scoreCeiling).toBeGreaterThan(
			models[2]?.scoreCeiling ?? 0,
		);
		expect(
			projects.map((project) =>
				project?.kind === "training" ? project.duration : null,
			),
		).toEqual([5, 4, 6]);
		expect(designs.map((result) => result.state.company.cash)).toEqual([
			9540, 9740, 9620,
		]);
	});

	it("constrains encoder bolt-ons and clean rebuilds independently of foundation lineage", () => {
		const state = multimodalState();
		const parent = state.models.items.find(
			(model) => model.family === "assistant",
		);
		if (parent === undefined) throw new Error("Expected an assistant parent");

		expect(() =>
			designModel(state, {
				name: "Invalid Bolt-On",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "encoder_bolt_on",
			}),
		).toThrow(/foundation|parent|compatible/i);
		expect(() =>
			designModel(state, {
				name: "Invalid Clean",
				family: "multimodal",
				foundation: "continued",
				tier: "standard",
				parentModelId: parent.id,
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "clean_rebuild",
			}),
		).toThrow(/foundation|fresh|parent/i);

		const boltOn = designModel(state, {
			name: "Valid Bolt-On",
			family: "multimodal",
			foundation: "continued",
			tier: "standard",
			parentModelId: parent.id,
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "encoder_bolt_on",
		});
		expect(boltOn.state.models.items.at(-1)).toMatchObject({
			architecturePath: "encoder_bolt_on",
			architectureDebt: 25,
			foundation: "continued",
			parentModelId: parent.id,
		});
	});

	it("rejects an architecture choice while the multimodal family unlock is locked", () => {
		const state = multimodalState();
		for (const node of state.research.nodes) {
			if (node.era === "multimodal") node.status = "locked";
		}
		expect(() =>
			designModel(state, {
				name: "Locked Path",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "unified",
			}),
		).toThrow(/research|unlock|locked/i);
	});

	it("enforces path-owned data requirements and rejects unknown or malformed content", () => {
		for (const [path, minimum] of [
			["unified", 45],
			["encoder_bolt_on", 20],
			["specialist_ensemble", 35],
			["clean_rebuild", 30],
		] as const) {
			const parent =
				path === "encoder_bolt_on"
					? multimodalState().models.items.find(
							(model) => model.family === "assistant",
						)
					: undefined;
			expect(() =>
				designModel(multimodalState(), {
					name: `Low-${path}`,
					family: "multimodal",
					foundation: path === "encoder_bolt_on" ? "continued" : "fresh",
					...(parent === undefined ? {} : { parentModelId: parent.id }),
					tier: "standard",
					dataMix: {
						general: 100 - (minimum - 1),
						code: 0,
						multimodal: minimum - 1,
					},
					emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
					architecturePath: path,
				}),
			).toThrow(/data|at least/i);
		}
		expect(() =>
			designModel(multimodalState(), {
				name: "Unknown",
				family: "multimodal",
				foundation: "fresh",
				tier: "standard",
				dataMix: { general: 30, code: 20, multimodal: 50 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				architecturePath: "unknown" as never,
			}),
		).toThrow(/unsupported|architecture/i);

		const malformed = MULTIMODAL_ARCHITECTURE_PATHS.map((path) => ({
			...path,
			minimumDataMix: { ...path.minimumDataMix },
		}));
		const unified = malformed.find((path) => path.id === "unified");
		if (unified === undefined) throw new Error("Expected unified path");
		(unified as { costAdjustment: number }).costAdjustment = 1.5;
		expect(() =>
			assertMultimodalArchitecturePathDefinitions(malformed),
		).toThrow(/integer/i);
	});

	it("uses path ceilings and reliability tradeoffs without exposing true scores", () => {
		const baseModel: Model = {
			id: "model_999",
			name: "Path Score Fixture",
			family: "multimodal",
			foundation: "fresh",
			status: "training",
			projectId: null,
			tier: "standard",
			scoreCeiling: 96,
			architecturePath: "unified",
			architectureDebt: 0,
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		};
		const unified = generateTrueScores(multimodalState().rng, baseModel);
		const parent = {
			...baseModel,
			status: "ready" as const,
			trueScores: scores(70),
			estimates: estimates(70),
		};
		const boltOn = generateTrueScores(
			multimodalState().rng,
			{
				...baseModel,
				foundation: "continued",
				architecturePath: "encoder_bolt_on",
				architectureDebt: 25,
			},
			parent,
		);

		expect(Math.max(...Object.values(unified.trueScores))).toBeLessThanOrEqual(
			96,
		);
		expect(boltOn.trueScores.reliability).toBeLessThan(
			unified.trueScores.reliability,
		);
		expect(
			JSON.stringify(selectVisibleModels(multimodalState())),
		).not.toContain("trueScores");
	});

	it("applies the selected path through real training completion", () => {
		let state = multimodalState();
		const design = designModel(state, {
			name: "Unified Training",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		});
		state = design.state;
		const project = state.projects.items.at(-1);
		if (project === undefined || project.kind !== "training") {
			throw new Error("Expected a training project");
		}
		for (let week = 2; week <= project.duration + 1; week += 1) {
			state = trainingSystem(state, { phase: "training", week }).state;
		}
		const model = state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected a trained model");
		expect(model.status).toBe("ready");
		expect(
			Math.max(...Object.values(model.trueScores ?? {})),
		).toBeLessThanOrEqual(model.scoreCeiling ?? 0);
		expect(
			selectVisibleModels(state).find((item) => item.id === model.id),
		).not.toHaveProperty("trueScores");
	});

	it("migrates legacy v9 multimodal saves and command logs with a deterministic default", () => {
		const fixture = legacyV9MultimodalFixture();
		const before = JSON.stringify(fixture);
		const upgraded = upgradeGameState(fixture);
		const model = upgraded.models.items.find(
			(item) => item.family === "multimodal",
		);
		const command = upgraded.commandLog.find(
			(entry) => entry.kind === "design_model",
		);

		expect(GAME_STATE_SCHEMA_VERSION).toBe(10);
		expect(upgraded.meta.schemaVersion).toBe(10);
		expect(model).toMatchObject({
			architecturePath: "unified",
			architectureDebt: 0,
		});
		expect(command).toMatchObject({ architecturePath: "unified" });
		expect(JSON.stringify(fixture)).toBe(before);
		expect(upgradeGameState(fixture)).toEqual(upgraded);
	});

	it("durably upgrades a v9 multimodal save at the exact 20% legacy minimum", () => {
		const legacyDataMix = { general: 50, code: 30, multimodal: 20 };
		const fixture = legacyV9MultimodalFixture(legacyDataMix);
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameState(fixture);
		const model = upgraded.models.items.find(
			(item) => item.family === "multimodal",
		);
		const command = upgraded.commandLog.find(
			(entry) => entry.kind === "design_model",
		);
		if (model === undefined || command?.kind !== "design_model") {
			throw new Error("Expected a migrated multimodal model and command");
		}

		expect(model).toMatchObject({
			architecturePath: "unified",
			architectureDebt: 0,
			architectureProvenance: "legacy_v9_unified",
			dataMix: legacyDataMix,
		});
		expect(command).toMatchObject({
			architecturePath: "unified",
			architectureProvenance: "legacy_v9_unified",
			dataMix: legacyDataMix,
		});
		expect(() => assertGameState(upgraded)).not.toThrow();

		const serialized = serializeGameState(upgraded);
		const restored = deserializeGameState(serialized);
		expect(canonicalEqual(restored, upgraded)).toBe(true);
		expect(() => assertGameState(restored)).not.toThrow();
		expect(serializeGameState(restored)).toBe(serialized);
		expect(upgradeGameState(fixture)).toEqual(upgraded);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("recomputes architecture-derived demand while migrating active v9 training", () => {
		const fixture = legacyV9MultimodalFixture();
		const compute = fixture.compute as Record<string, unknown>;
		compute.trainingDemand = 4;
		compute.allocated = 4;
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameState(fixture);

		expect(upgraded.compute.trainingDemand).toBe(7);
		expect(upgraded.compute.allocated).toBe(27);
		expect(JSON.stringify(fixture)).toBe(before);
		expect(upgradeGameState(fixture)).toEqual(upgraded);
	});

	it("rejects partial or future-shaped v9 architecture fields before applying defaults", () => {
		const fixture = legacyV9MultimodalFixture();
		const models = fixture.models as { items: Record<string, unknown>[] };
		const model = models.items.find((item) => item.family === "multimodal");
		if (model === undefined) throw new Error("Expected a multimodal model");
		model.architecturePath = "unified";
		const before = JSON.stringify(fixture);

		expect(() => upgradeGameState(fixture)).toThrow(
			/architecture|future|unexpected/i,
		);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("round-trips the selected path without mutation or hidden-score leakage", () => {
		const state = designModel(multimodalState(), {
			name: "Round Trip",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "specialist_ensemble",
		}).state;
		const before = JSON.stringify(state);
		const serialized = serializeGameState(state);
		const restored = deserializeGameState(serialized);

		expect(canonicalEqual(restored, state)).toBe(true);
		expect(serializeGameState(restored)).toBe(serialized);
		expect(JSON.stringify(state)).toBe(before);
		expect(JSON.stringify(selectVisibleModels(restored))).not.toContain(
			"trueScores",
		);
	});

	it("keeps the legacy v9 command-log envelope replayable", () => {
		const state = startRun({ companyName: "Legacy Replay" }, 7);
		const log = state.commandLog.map((entry) => ({ ...entry }));
		const replayed = replayCommandLog({ schemaVersion: 9, commands: log });

		expect(replayed.commandLog).toEqual(log);
		expect(replayed).toEqual(state);
	});

	it("keeps schema v9 unified defaults inside the private replay adapter", () => {
		const result = designModelForLegacyReplay(multimodalState(), {
			name: "Legacy Adapter Data Mix",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 50, code: 30, multimodal: 20 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		});
		const model = result.state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected a legacy adapter model");

		expect(model).toMatchObject({
			architecturePath: "unified",
			architectureDebt: 0,
			architectureProvenance: "legacy_v9_unified",
			dataMix: { general: 50, code: 30, multimodal: 20 },
		});
		expect(() => assertGameState(result.state)).not.toThrow();
		const restored = deserializeGameState(serializeGameState(result.state));
		expect(canonicalEqual(restored, result.state)).toBe(true);
	});

	it("does not expose a public bypass for the unified path data minimum", () => {
		const spec = {
			name: "Legacy Data Mix",
			family: "multimodal" as const,
			foundation: "fresh" as const,
			tier: "standard" as const,
			dataMix: { general: 50, code: 30, multimodal: 20 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified" as const,
		};
		expect(() => designModel(multimodalState(), spec)).toThrow(/at least 45/);
		expect(() =>
			Reflect.apply(publicDesignModel, undefined, [
				multimodalState(),
				spec,
				{ allowLegacyArchitectureDefaults: true },
			]),
		).toThrow(/at least 45/);
		expect(() =>
			designModel(multimodalState(), {
				...spec,
				architectureProvenance: "legacy_v9_unified",
			} as never),
		).toThrow(/unexpected/i);
	});

	it("rejects a forged current multimodal model and matching command below its path minimum", () => {
		const state = designModel(multimodalState(), {
			name: "Forged Minimum",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		}).state;
		const model = state.models.items.at(-1);
		const command = state.commandLog.at(-1);
		if (model === undefined || command?.kind !== "design_model") {
			throw new Error("Expected a multimodal design and command");
		}
		const forgedMix = { general: 50, code: 30, multimodal: 20 };
		model.dataMix = forgedMix;
		command.dataMix = forgedMix;

		expect(() => assertGameState(state)).toThrow(
			/architecture.*data|data.*minimum|at least/i,
		);
	});

	it("rejects a current design command below its path minimum even when the model differs", () => {
		const state = designModel(multimodalState(), {
			name: "Forged Command Minimum",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		}).state;
		const command = state.commandLog.at(-1);
		if (command?.kind !== "design_model") {
			throw new Error("Expected a design command");
		}
		command.dataMix = { general: 50, code: 30, multimodal: 20 };

		expect(() => assertGameState(state)).toThrow(
			/architecture.*data|data.*minimum|at least/i,
		);
	});

	it("rejects v9 replay envelopes containing future architecture fields", () => {
		const fixture = legacyV9MultimodalFixture();
		const commandLog = fixture.commandLog as Record<string, unknown>[];
		const start = commandLog[0];
		const design = commandLog.find((entry) => entry.kind === "design_model");
		if (start === undefined || design === undefined) {
			throw new Error("Expected a legacy start and design command");
		}
		const entries = [
			{ ...start, id: "command_001" },
			{
				...design,
				id: "command_002",
				architecturePath: "unified",
				architectureDebt: 0,
				architectureProvenance: "legacy_v9_unified",
			},
		];
		const before = JSON.stringify(entries);

		expect(() =>
			replayCommandLog({
				schemaVersion: 9,
				commands: entries as never,
			}),
		).toThrow(/future-shaped|unexpected.*architecture|v9.*architecture/i);
		expect(JSON.stringify(entries)).toBe(before);
	});

	it("consumes architecture compute and serving tradeoffs through launch, resume, and weekly demand", () => {
		const designed = designModel(multimodalState(), {
			name: "Compute Path",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		}).state;
		expect(designed.compute.trainingDemand).toBeGreaterThan(5);
		expect(
			servingDemandForModel(
				{ family: "multimodal", architecturePath: "unified" },
				"chat",
				10,
			),
		).toBe(12);

		const launched = launchedPathState("unified");
		const model = launched.models.items.at(-1);
		const product = launched.products.items.find(
			(item) => item.modelId === model?.id,
		);
		if (model === undefined || product === undefined) {
			throw new Error("Expected a launched multimodal product");
		}
		expect(product.servingDemand).toBe(12);
		product.status = "paused";
		product.users = 12;
		product.servingDemand = 0;
		launched.compute = withRecomputedCompute(launched);
		const resumed = applyProductResume(launched, product.id).state;
		const resumedProduct = resumed.products.items.find(
			(item) => item.id === product.id,
		);
		if (resumedProduct === undefined)
			throw new Error("Expected resumed product");
		expect(resumedProduct.servingDemand).toBe(15);

		const weekly = productsSystem(resumed, { phase: "products", week: 1 });
		const weeklyProduct = weekly.state.products.items.find(
			(item) => item.id === product.id,
		);
		if (weeklyProduct === undefined) throw new Error("Expected weekly product");
		expect(weeklyProduct.servingDemand).toBeGreaterThan(15);
		expect(computeReservations(weekly.state).servingDemand).toBe(
			weekly.state.products.items.reduce(
				(total, item) => total + (item.servingDemand ?? 0),
				0,
			),
		);
	});

	it("inherits encoder debt separately from foundation debt and resets it on clean rebuild", () => {
		let state = trainedPathState("encoder_bolt_on");
		const first = state.models.items.at(-1);
		if (first === undefined) throw new Error("Expected first encoder model");
		expect(first.architectureDebt).toBe(25);
		expect(first.foundationDebt).toBe(0);

		state = designModel(state, {
			name: "Encoder Child",
			family: "multimodal",
			foundation: "continued",
			parentModelId: first.id,
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "encoder_bolt_on",
		}).state;
		const child = state.models.items.at(-1);
		if (child === undefined) throw new Error("Expected encoder child");
		expect(child.architectureDebt).toBe(40);
		expect(child.foundationDebt).toBe(first.foundationDebt);

		const childProject = state.projects.items.at(-1);
		if (childProject === undefined || childProject.kind !== "training") {
			throw new Error("Expected encoder child training project");
		}
		for (let index = 0; index < childProject.duration; index += 1) {
			state = trainingSystem(state, {
				phase: "training",
				week: index + 2,
			}).state;
		}
		const rebuilt = designModel(state, {
			name: "Clean Child",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "clean_rebuild",
		}).state.models.items.at(-1);
		expect(rebuilt).toMatchObject({
			architecturePath: "clean_rebuild",
			architectureDebt: 0,
		});
	});

	it("makes encoder debt part of incident exposure while unified remains lower risk", () => {
		const unified = incidentsSystem(incidentPathState("unified"), {
			phase: "incidents",
			week: 1,
			incidentRoll: 3,
		});
		const encoder = incidentsSystem(incidentPathState("encoder_bolt_on"), {
			phase: "incidents",
			week: 1,
			incidentRoll: 3,
		});

		expect(
			unified.pending.some((decision) => decision.kind === "incident"),
		).toBe(false);
		expect(encoder.pending).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "incident", incident: "outage" }),
			]),
		);
	});

	it("rejects forged persisted path debt and partial architecture tuples", () => {
		const state = designModel(multimodalState(), {
			name: "Forged Path",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		}).state;
		const model = state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected a model");
		model.architectureDebt = 1;
		expect(() => assertGameState(state)).toThrow(
			/architecture debt|inheritance/i,
		);

		const partial = designModel(multimodalState(), {
			name: "Partial Path",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "clean_rebuild",
		}).state;
		const partialModel = partial.models.items.at(-1);
		if (partialModel === undefined) throw new Error("Expected a partial model");
		delete partialModel.architectureDebt;
		expect(() => assertGameState(partial)).toThrow(
			/path and debt|architecture/i,
		);
	});

	it("rejects a current multimodal model missing its architecture tuple", () => {
		const state = designModel(multimodalState(), {
			name: "Missing Tuple",
			family: "multimodal",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 30, code: 20, multimodal: 50 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			architecturePath: "unified",
		}).state;
		const model = state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected a model");
		const malformedModel = { ...model };
		delete malformedModel.architecturePath;
		delete malformedModel.architectureDebt;
		delete malformedModel.dataAllocation;

		expect(() =>
			assertModelsState({
				...state.models,
				items: [...state.models.items.slice(0, -1), malformedModel],
			}),
		).toThrow(/persisted architecture path|architecture/i);
	});
});
