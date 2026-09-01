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
import type { GameState } from "./state.js";
import { GAME_STATE_SCHEMA_VERSION } from "./state.js";

function jsonClone(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function asRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected a plain object fixture");
	}
	return value as Record<string, unknown>;
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
	delete counters.data;
	delete research.discoveredSparkIds;
	delete research.paradigmId;
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
	delete counters.data;
	delete research.paradigmId;
	meta.schemaVersion = 3;
	return state;
}

describe("GameState migration and serialization", () => {
	it("migrates a v3 state to an unresolved paradigm without mutation", () => {
		const fixture = currentV3Fixture();
		const before = JSON.stringify(fixture);
		const upgraded = upgradeGameStateWithMetadata(fixture);

		expect(upgraded.sourceSchemaVersion).toBe(3);
		expect(upgraded.currentSchemaVersion).toBe(5);
		expect(upgraded.state.meta.schemaVersion).toBe(5);
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
		expect(upgraded.currentSchemaVersion).toBe(5);
		expect(upgraded.state.meta.schemaVersion).toBe(5);
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
		expect(upgraded.currentSchemaVersion).toBe(5);
		expect(upgraded.state.meta.schemaVersion).toBe(5);
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
