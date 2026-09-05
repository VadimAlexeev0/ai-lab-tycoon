import { describe, expect, it } from "vitest";

import { canonicalEqual } from "./canonical.js";
import currentV1FixtureJson from "./fixtures/game-state-v1.json";
import staleV1FixtureJson from "./fixtures/game-state-v1-stale-compute.json";
import {
	deserializeGameState,
	deserializeGameStateWithMetadata,
	serializeGameState,
	startRun,
	upgradeGameState,
	upgradeGameStateWithMetadata,
} from "./index.js";
import { designModel } from "./model-design.js";
import type { GameState } from "./state.js";
import { GAME_STATE_SCHEMA_VERSION } from "./state.js";
import { trainingSystem } from "./systems/training.js";

function jsonClone(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function asRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected a plain object fixture");
	}
	return value as Record<string, unknown>;
}

function stripV9LineageFields(state: Record<string, unknown>): void {
	const models = asRecord(state.models);
	if (Array.isArray(models.items)) {
		for (const item of models.items) {
			const model = asRecord(item);
			delete model.brandId;
			delete model.foundationId;
			delete model.foundationDebt;
			delete model.foundationRisk;
		}
	}
	const commandLog = state.commandLog;
	if (Array.isArray(commandLog)) {
		for (const entry of commandLog) {
			const command = asRecord(entry);
			if (command.kind === "design_model") delete command.brandId;
		}
	}
}

function stripV11RivalStrategyFields(state: Record<string, unknown>): void {
	const rivals = asRecord(state.rivals);
	if (!Array.isArray(rivals.items)) return;
	for (const item of rivals.items) {
		const rival = asRecord(item);
		delete rival.publishedNodeIds;
		delete rival.launchedFamilyIds;
		delete rival.eventCursor;
	}
}

function v8LineageDebtFixture(): Record<string, unknown> {
	const state = startRun({ companyName: "Migration Labs" }, 23);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) throw new Error("Expected model unlock");
	familyUnlock.status = "completed";

	const designed = designModel(state, {
		name: "Legacy-1",
		family: "text",
		foundation: "fresh",
		tier: "standard",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
	}).state;
	const project = designed.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected training project");
	}
	let trained = designed;
	for (let week = 1; week <= project.duration; week += 1) {
		trained = trainingSystem(trained, { phase: "training", week }).state;
	}
	const parent = trained.models.items.at(-1);
	if (parent === undefined || parent.status !== "ready") {
		throw new Error("Expected a ready parent model");
	}
	parent.dataDebt = 49;

	const successor = designModel(trained, {
		name: "Legacy-2",
		family: "text",
		foundation: "continued",
		parentModelId: parent.id,
		tier: "standard",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
	}).state;
	const fixture = JSON.parse(serializeGameState(successor)) as Record<
		string,
		unknown
	>;
	stripV9LineageFields(fixture);
	stripV11RivalStrategyFields(fixture);
	const models = asRecord(fixture.models);
	if (!Array.isArray(models.items) || models.items.length !== 2) {
		throw new Error("Expected a parent and successor model");
	}
	const migratedParent = asRecord(models.items[0]);
	const migratedSuccessor = asRecord(models.items[1]);
	migratedParent.dataDebt = 49;
	migratedSuccessor.dataDebt = 10;
	asRecord(fixture.meta).schemaVersion = 8;
	return fixture;
}

function v8ReverseOrderThreeGenerationFixture(): Record<string, unknown> {
	const state = startRun({ companyName: "Migration Labs" }, 23);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) throw new Error("Expected model unlock");
	familyUnlock.status = "completed";

	const designSpec = {
		family: "text" as const,
		tier: "standard" as const,
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
	};
	let trained = designModel(state, {
		...designSpec,
		name: "Legacy-1",
		foundation: "fresh",
	}).state;
	let project = trained.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected root training project");
	}
	for (let week = 1; week <= project.duration; week += 1) {
		trained = trainingSystem(trained, { phase: "training", week }).state;
	}

	const root = trained.models.items.at(-1);
	if (root === undefined || root.status !== "ready") {
		throw new Error("Expected a ready root model");
	}
	trained = designModel(trained, {
		...designSpec,
		name: "Legacy-2",
		foundation: "continued",
		parentModelId: root.id,
	}).state;
	project = trained.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected child training project");
	}
	for (let week = 1; week <= project.duration; week += 1) {
		trained = trainingSystem(trained, { phase: "training", week }).state;
	}

	const child = trained.models.items.at(-1);
	if (child === undefined || child.status !== "ready") {
		throw new Error("Expected a ready child model");
	}
	const designed = designModel(trained, {
		...designSpec,
		name: "Legacy-3",
		foundation: "continued",
		parentModelId: child.id,
	}).state;
	const fixture = JSON.parse(serializeGameState(designed)) as Record<
		string,
		unknown
	>;
	stripV9LineageFields(fixture);
	stripV11RivalStrategyFields(fixture);
	const models = asRecord(fixture.models);
	if (!Array.isArray(models.items) || models.items.length !== 3) {
		throw new Error("Expected a three-generation model chain");
	}
	const rootFixture = asRecord(
		models.items.find((item) => asRecord(item).id === root.id),
	);
	const childFixture = asRecord(
		models.items.find((item) => asRecord(item).id === child.id),
	);
	const grandchildFixture = asRecord(
		models.items.find(
			(item) => asRecord(item).id === designed.models.items.at(-1)?.id,
		),
	);
	rootFixture.dataDebt = 49;
	childFixture.dataDebt = 10;
	grandchildFixture.dataDebt = 1;
	models.items.reverse();
	asRecord(fixture.meta).schemaVersion = 8;
	return fixture;
}

function currentV1Fixture(): unknown {
	// Schema v1 is the first accepted persisted format. This fixture is a JSON
	// snapshot of the actual current startRun shape before the migration boundary;
	// there is no meaningful pre-v1 format to invent or translate.
	return jsonClone(currentV1FixtureJson);
}

function currentV2Fixture(): unknown {
	const state = JSON.parse(
		serializeGameState(startRun({ companyName: "Migration Labs" }, 23)),
	) as Record<string, unknown>;
	const meta = asRecord(state.meta);
	const research = asRecord(state.research);
	const counters = asRecord(state.counters);
	delete state.dataInventory;
	delete state.risk;
	delete counters.data;
	delete research.discoveredSparkIds;
	delete research.paradigmId;
	stripV11RivalStrategyFields(state);
	meta.schemaVersion = 2;
	return state;
}

function currentV3Fixture(): unknown {
	const state = JSON.parse(
		serializeGameState(startRun({ companyName: "Migration Labs" }, 23)),
	) as Record<string, unknown>;
	const meta = asRecord(state.meta);
	const research = asRecord(state.research);
	const counters = asRecord(state.counters);
	delete state.dataInventory;
	delete state.risk;
	delete counters.data;
	delete research.paradigmId;
	stripV11RivalStrategyFields(state);
	meta.schemaVersion = 3;
	return state;
}

function trainedV5Fixture(): unknown {
	const state = startRun({ companyName: "Migration Labs" }, 23);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) throw new Error("Expected model unlock");
	familyUnlock.status = "completed";
	const designed = designModel(state, {
		name: "Legacy-1",
		family: "text",
		foundation: "fresh",
		tier: "standard",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
	}).state;
	const project = designed.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected training project");
	}
	project.duration = 1;
	const trained = trainingSystem(designed, {
		phase: "training",
		week: 1,
	}).state;
	const fixture = JSON.parse(serializeGameState(trained)) as Record<
		string,
		unknown
	>;
	const meta = asRecord(fixture.meta);
	const models = asRecord(fixture.models);
	delete fixture.risk;
	const model = asRecord((models.items as unknown[])[0]);
	delete model.knowledgeCutoff;
	delete model.knowledgeFreshness;
	stripV9LineageFields(fixture);
	stripV11RivalStrategyFields(fixture);
	meta.schemaVersion = 5;
	return fixture;
}

function currentV7FixtureWithModel(): Record<string, unknown> {
	const state = startRun({ companyName: "Migration Labs" }, 23);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) throw new Error("Expected model unlock");
	familyUnlock.status = "completed";
	const designed = designModel(state, {
		name: "Legacy-1",
		family: "text",
		foundation: "fresh",
		tier: "standard",
		dataMix: { general: 60, code: 30, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
	}).state;
	const fixture = JSON.parse(serializeGameState(designed)) as Record<
		string,
		unknown
	>;
	stripV9LineageFields(fixture);
	stripV11RivalStrategyFields(fixture);
	asRecord(fixture.meta).schemaVersion = 7;
	return fixture;
}

describe("GameState migration and serialization", () => {
	it("migrates a v5 trained model by deriving its cutoff and freshness", () => {
		const fixture = trainedV5Fixture();
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameStateWithMetadata(fixture);
		const model = upgraded.state.models.items[0];
		if (model === undefined) throw new Error("Expected migrated model");

		expect(upgraded.sourceSchemaVersion).toBe(5);
		expect(upgraded.currentSchemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(model.knowledgeCutoff).toBe(1);
		expect(model.knowledgeFreshness).toBe(100);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("raises a v8 successor data debt to its inherited retention floor", () => {
		const fixture = v8LineageDebtFixture();
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameState(fixture);
		const parent = upgraded.models.items[0];
		const successor = upgraded.models.items[1];
		if (parent === undefined || successor === undefined) {
			throw new Error("Expected a migrated parent and successor");
		}

		expect(parent.dataDebt).toBe(49);
		expect(successor.dataDebt).toBe(49);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("normalizes reverse-ordered three-generation v8 data debt by parent floors", () => {
		const fixture = v8ReverseOrderThreeGenerationFixture();
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameState(fixture);
		const byId = new Map(
			upgraded.models.items.map((model) => [model.name, model]),
		);
		const root = byId.get("Legacy-1");
		const child = byId.get("Legacy-2");
		const grandchild = byId.get("Legacy-3");
		if (root === undefined || child === undefined || grandchild === undefined) {
			throw new Error("Expected all migrated generations");
		}

		expect(root.dataDebt).toBe(49);
		expect(child.dataDebt).toBe(49);
		expect(grandchild.dataDebt).toBe(49);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("rejects v5 knowledge fields instead of accepting a future-shaped save", () => {
		const fixture = trainedV5Fixture();
		const models = asRecord(asRecord(fixture).models);
		if (!Array.isArray(models.items)) throw new Error("Expected model items");
		const model = asRecord(models.items[0]);
		model.knowledgeCutoff = 1;

		expect(() => upgradeGameState(fixture)).toThrow(/unexpected|knowledge/i);
	});

	it("rejects v8 pricing nested in a v7 pending launch decision", () => {
		const fixture = currentV7FixtureWithModel();
		const decisions = asRecord(fixture.decisions);
		decisions.pending = [
			{
				kind: "launch",
				id: "decision_001",
				modelId: "model_001",
				channel: "chat",
				price: 10,
				blocking: true,
			},
		];
		asRecord(fixture.queue).decisionIds = ["decision_001"];

		expect(() => upgradeGameState(fixture)).toThrow(
			/v7.*launch.*price|unexpected.*price/i,
		);
	});

	it("rejects v8 pricing nested in a v7 apply_decision launch choice", () => {
		const fixture = currentV7FixtureWithModel();
		const decisions = asRecord(fixture.decisions);
		decisions.pending = [
			{
				kind: "launch",
				id: "decision_001",
				modelId: "model_001",
				channel: "chat",
				blocking: true,
			},
		];
		asRecord(fixture.queue).decisionIds = ["decision_001"];
		const commandLog = fixture.commandLog;
		if (!Array.isArray(commandLog)) throw new Error("Expected command log");
		commandLog.push({
			id: "command_003",
			kind: "apply_decision",
			week: 1,
			choice: {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
				price: 10,
			},
		});

		expect(() => upgradeGameState(fixture)).toThrow(
			/v7.*apply_decision.*price|unexpected.*price/i,
		);
	});

	it("migrates a v3 state to an unresolved paradigm without mutation", () => {
		const fixture = currentV3Fixture();
		const before = JSON.stringify(fixture);
		const upgraded = upgradeGameStateWithMetadata(fixture);

		expect(upgraded.sourceSchemaVersion).toBe(3);
		expect(upgraded.currentSchemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.meta.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.research.paradigmId).toBeNull();
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("rejects a v3 state that already contains the v4 paradigm field", () => {
		const fixture = currentV3Fixture();
		const research = asRecord(asRecord(fixture).research);
		research.paradigmId = "scale_maximalism";
		const before = JSON.stringify(fixture);

		expect(() => upgradeGameState(fixture)).toThrow(
			/unexpected.*paradigm|v3.*paradigm|unexpected field/i,
		);
		expect(JSON.stringify(fixture)).toBe(before);
	});
	it("serializes a startRun state with the current version and stable round trip", () => {
		const state = startRun({ companyName: "Migration Labs" }, 23);

		const serialized = serializeGameState(state);
		const parsed: unknown = JSON.parse(serialized);
		const meta = asRecord(asRecord(parsed).meta);

		expect(meta.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(canonicalEqual(deserializeGameState(serialized), state)).toBe(true);
		expect(serializeGameState(deserializeGameState(serialized))).toBe(
			serialized,
		);
	});

	it("migrates v1 stale compute reservations before current validation", () => {
		const fixture = jsonClone(staleV1FixtureJson);
		const before = JSON.stringify(fixture);
		const source = asRecord(fixture);
		const sourceMeta = asRecord(source.meta);
		const sourceCompute = asRecord(source.compute);
		expect(sourceMeta.schemaVersion).toBe(1);
		expect(sourceCompute.trainingDemand).toBe(5);
		expect(sourceCompute.allocated).toBe(5);

		const upgraded = upgradeGameStateWithMetadata(fixture);

		expect(upgraded.sourceSchemaVersion).toBe(1);
		expect(upgraded.currentSchemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.meta.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.research.discoveredSparkIds).toEqual([]);
		expect(upgraded.state.compute.trainingDemand).toBe(4);
		expect(upgraded.state.compute.allocated).toBe(4);
		expect(JSON.stringify(fixture)).toBe(before);
		expect(upgradeGameState(fixture)).toEqual(upgraded.state);
	});

	it("migrates a v2 state by adding an empty discovered Spark field", () => {
		const fixture = currentV2Fixture();
		const before = JSON.stringify(fixture);
		const source = asRecord(fixture);
		const sourceMeta = asRecord(source.meta);
		const sourceResearch = asRecord(source.research);
		expect(sourceMeta.schemaVersion).toBe(2);
		expect(Object.hasOwn(sourceResearch, "discoveredSparkIds")).toBe(false);

		const upgraded = upgradeGameStateWithMetadata(fixture);

		expect(upgraded.sourceSchemaVersion).toBe(2);
		expect(upgraded.currentSchemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.meta.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.research.discoveredSparkIds).toEqual([]);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("rejects a v2 state that already contains the v3 Spark field", () => {
		const fixture = currentV2Fixture();
		const research = asRecord(asRecord(fixture).research);
		if (!Array.isArray(research.nodes)) {
			throw new Error("Expected v2 research nodes");
		}
		const target = asRecord(
			research.nodes.find(
				(node) => asRecord(node).id === "inference_price_war",
			),
		);
		target.insightCost = 1;
		research.discoveredSparkIds = ["inference_optimization"];
		const before = JSON.stringify(fixture);

		expect(() => upgradeGameState(fixture)).toThrow(
			/unexpected.*spark|v2.*spark|unexpected field/i,
		);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("reports source and current versions separately at the migration boundary", () => {
		const fixture = currentV1Fixture();

		const upgraded = upgradeGameStateWithMetadata(fixture);
		expect(upgraded.sourceSchemaVersion).toBe(1);
		expect(upgraded.currentSchemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.meta.schemaVersion).toBe(
			upgraded.currentSchemaVersion,
		);
		expect(upgraded.state).not.toBe(fixture);

		const serialized = serializeGameState(upgraded.state);
		expect(JSON.parse(serialized).meta.schemaVersion).toBe(
			upgraded.currentSchemaVersion,
		);
		expect(deserializeGameStateWithMetadata(serialized)).toMatchObject({
			sourceSchemaVersion: upgraded.currentSchemaVersion,
			currentSchemaVersion: upgraded.currentSchemaVersion,
		});
	});
	it("migrates the representative V1 fixture deterministically", () => {
		const fixture = currentV1Fixture();
		const before = JSON.stringify(fixture);

		const first = upgradeGameState(fixture);
		const second = upgradeGameState(fixture);

		expect(first).toEqual(second);
		expect(first).not.toBe(fixture);
		expect(JSON.stringify(fixture)).toBe(before);
		expect(() => upgradeGameState(first)).not.toThrow();
	});

	it("rejects a missing or malformed schema version without mutating input", () => {
		const missing = currentV1Fixture();
		const missingMeta = asRecord(asRecord(missing).meta);
		delete missingMeta.schemaVersion;
		const missingBefore = JSON.stringify(missing);

		expect(() => upgradeGameState(missing)).toThrow(/schema.?version/i);
		expect(JSON.stringify(missing)).toBe(missingBefore);

		const malformed = currentV1Fixture();
		const malformedMeta = asRecord(asRecord(malformed).meta);
		malformedMeta.schemaVersion = "1";
		const malformedBefore = JSON.stringify(malformed);

		expect(() => upgradeGameState(malformed)).toThrow(/schema.?version/i);
		expect(JSON.stringify(malformed)).toBe(malformedBefore);
	});

	it("rejects malformed state fields before returning or mutating the fixture", () => {
		const malformed = currentV1Fixture();
		const company = asRecord(asRecord(malformed).company);
		company.cash = 1.5;
		const before = JSON.stringify(malformed);

		expect(() => upgradeGameState(malformed)).toThrow(/safe integer|cash/i);
		expect(JSON.stringify(malformed)).toBe(before);

		const extended = currentV1Fixture();
		asRecord(extended).futureMechanic = { enabled: true };
		const extendedBefore = JSON.stringify(extended);

		expect(() => upgradeGameState(extended)).toThrow(/unexpected field/i);
		expect(JSON.stringify(extended)).toBe(extendedBefore);
	});

	it("validates migration inputs before deriving reservations", () => {
		const malformed = jsonClone(staleV1FixtureJson);
		const models = asRecord(asRecord(malformed).models);
		if (!Array.isArray(models.items) || models.items.length === 0) {
			throw new Error("Expected a stale fixture model");
		}
		const model = asRecord(models.items[0]);
		model.tier = "invalid";
		const before = JSON.stringify(malformed);

		expect(() => upgradeGameState(malformed)).toThrow(
			/model.*tier|compute tier/i,
		);
		expect(JSON.stringify(malformed)).toBe(before);
	});

	it("rejects unknown future and unsupported prior schema versions clearly", () => {
		const future = currentV1Fixture();
		const futureMeta = asRecord(asRecord(future).meta);
		futureMeta.schemaVersion = GAME_STATE_SCHEMA_VERSION + 1;

		expect(() => upgradeGameState(future)).toThrow(
			/newer|future|unsupported.*version/i,
		);

		const prior = currentV1Fixture();
		const priorMeta = asRecord(asRecord(prior).meta);
		priorMeta.schemaVersion = 0;

		expect(() => upgradeGameState(prior)).toThrow(/unsupported.*version/i);
	});

	it("rejects malformed serialized JSON through the same load boundary", () => {
		expect(() => deserializeGameState("{not-json")).toThrow(/json/i);
	});

	it("preserves the canonical serializer contract across object key order", () => {
		const state = startRun({ companyName: "Migration Labs" }, 23);
		const reordered = reverseObjectKeys(state) as GameState;

		expect(serializeGameState(reordered)).toBe(serializeGameState(state));
	});
});

function reverseObjectKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseObjectKeys);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.reverse()
				.map(([key, child]) => [key, reverseObjectKeys(child)]),
		);
	}
	return value;
}
