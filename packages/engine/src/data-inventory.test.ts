import { describe, expect, it } from "vitest";
import { cancelProject } from "./commands/projects.js";
import { assertDataInventoryState } from "./components/data-inventory.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import {
	assertDataSourceDefinitions,
	DATA_SOURCE_DEFINITIONS,
} from "./data/data-sources.js";
import { acquireData, consumeDataAllocations } from "./data-inventory.js";
import {
	assertGameState,
	serializeGameState,
	startRun,
	upgradeGameStateWithMetadata,
} from "./index.js";
import { designModel } from "./model-design.js";
import { replayCommandLog } from "./replay.js";
import type { GameState } from "./state.js";
import { trainingSystem } from "./systems/training.js";

describe("strategic data inventory", () => {
	it("validates source content with explicit cost, time, risk, and restrictions", () => {
		expect(() =>
			assertDataSourceDefinitions(DATA_SOURCE_DEFINITIONS),
		).not.toThrow();
		expect(
			new Set(DATA_SOURCE_DEFINITIONS.map((source) => source.provenance)),
		).toEqual(
			new Set(["acquired", "licensed", "product_derived", "synthetic"]),
		);
		for (const source of DATA_SOURCE_DEFINITIONS) {
			expect(source.acquisitionTime).toBeGreaterThan(0);
			expect(source.acquisitionCost).toBeGreaterThanOrEqual(0);
			expect(source.usageRestrictions).toBeDefined();
		}
	});

	it("opens with serializable starter records for the summarized mix", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const inventory = (state as unknown as Record<string, unknown>)
			.dataInventory as {
			items: Array<Record<string, unknown>>;
		};

		expect(inventory.items).toHaveLength(3);
		expect(inventory.items.map((item) => item.modality)).toEqual([
			"general",
			"code",
			"multimodal",
		]);
		expect(inventory.items.every((item) => item.quantity === 300)).toBe(true);
	});

	it("acquires a licensed batch with a deterministic availability delay", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const result = acquireData(state, { sourceId: "licensed_code" });

		expect(result.state.company.cash).toBe(state.company.cash - 220);
		expect(result.state.dataInventory.items).toContainEqual(
			expect.objectContaining({
				id: "data_004",
				sourceId: "licensed_code",
				provenance: "licensed",
				modality: "code",
				quantity: 300,
				consumedAmount: 0,
				reservedAmount: 0,
				availableFromWeek: 3,
			}),
		);
		expect(result.state.commandLog.at(-1)).toMatchObject({
			kind: "acquire_data",
			dataId: "data_004",
			sourceId: "licensed_code",
			productId: null,
		});
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "data_acquired",
				dataId: "data_004",
				cost: 220,
				availableFromWeek: 3,
			}),
		);
		expect(state.dataInventory.items).toHaveLength(3);
		expect(state.company.cash).toBe(1_000);
	});

	it("rejects unknown or malformed acquisition requests without spending cash", () => {
		const unknownSource = startRun({ companyName: "Acme Labs" }, 42);
		expect(() =>
			acquireData(unknownSource, { sourceId: "unknown_source" }),
		).toThrow(/unknown data source/i);

		const unexpectedField = startRun({ companyName: "Acme Labs" }, 42);
		expect(() =>
			acquireData(unexpectedField, {
				sourceId: "licensed_code",
				unexpected: true,
			} as never),
		).toThrow(/unexpected/i);

		const insufficientCash = startRun({ companyName: "Acme Labs" }, 42);
		insufficientCash.company.cash = 219;
		const before = JSON.stringify(insufficientCash);
		expect(() =>
			acquireData(insufficientCash, { sourceId: "licensed_code" }),
		).toThrow(/cash|cost/i);
		expect(JSON.stringify(insufficientCash)).toBe(before);
	});

	it("reserves the summarized mix from available inventory at model design", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";

		const result = designModel(state, {
			name: "Aurora-1",
			family: "text",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		});
		const model = result.state.models.items[0];
		if (model === undefined) throw new Error("Expected designed model");

		expect(model.dataAllocation).toEqual([
			{ recordId: "data_001", amount: 60 },
			{ recordId: "data_002", amount: 30 },
			{ recordId: "data_003", amount: 10 },
		]);
		expect(
			result.state.dataInventory.items.map((record) => record.reservedAmount),
		).toEqual([60, 30, 10]);
	});

	it("consumes exactly the reserved mix when training completes", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		const designed = designModel(state, {
			name: "Aurora-1",
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

		const result = trainingSystem(designed, { phase: "training", week: 1 });

		expect(
			result.state.dataInventory.items.map((record) => ({
				consumedAmount: record.consumedAmount,
				reservedAmount: record.reservedAmount,
			})),
		).toEqual([
			{ consumedAmount: 60, reservedAmount: 0 },
			{ consumedAmount: 30, reservedAmount: 0 },
			{ consumedAmount: 10, reservedAmount: 0 },
		]);
	});

	it("releases a reserved mix when training is cancelled", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		const designed = designModel(state, {
			name: "Aurora-1",
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

		const result = cancelProject(designed, project.teamId ?? "", project.id);

		expect(
			result.state.dataInventory.items.map((record) => record.reservedAmount),
		).toEqual([0, 0, 0]);
	});

	it("rejects a persisted allocation that exceeds its record reservation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		const designed = designModel(state, {
			name: "Aurora-1",
			family: "text",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		}).state;
		const model = designed.models.items[0];
		if (model?.dataAllocation === undefined) {
			throw new Error("Expected model data allocation");
		}
		model.dataAllocation[0] = { recordId: "data_001", amount: 61 };

		expect(() => assertGameState(designed)).toThrow(/reservation|allocation/i);
	});

	it("rejects a persisted allocation that targets a restricted source", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		const designed = designModel(state, {
			name: "Aurora-1",
			family: "text",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		}).state;
		const record = designed.dataInventory.items[0];
		const model = designed.models.items[0];
		if (record === undefined || model?.dataAllocation === undefined) {
			throw new Error("Expected designed data allocation");
		}
		designed.dataInventory.items.push({
			id: "data_004",
			sourceId: "research_archive",
			provenance: "acquired",
			quality: 80,
			freshness: 85,
			modality: "general",
			usageRestrictions: ["research_only"],
			rightsRisk: 25,
			quantity: 300,
			consumedAmount: 0,
			reservedAmount: 60,
			availableFromWeek: 1,
			derivedFromProductId: null,
		});
		record.reservedAmount = 0;
		model.dataAllocation = [
			{ recordId: "data_004", amount: 60 },
			{ recordId: "data_002", amount: 30 },
			{ recordId: "data_003", amount: 10 },
		];

		expect(() => assertGameState(designed)).toThrow(
			/restricted|training data/i,
		);
	});

	it("emits a deterministic warning when a selected batch is stale", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		state.dataInventory.items[0] = {
			id: "data_001",
			sourceId: "legacy_forum_dump",
			provenance: "acquired",
			quality: 45,
			freshness: 20,
			modality: "general",
			usageRestrictions: ["no_external_release"],
			rightsRisk: 70,
			quantity: 300,
			consumedAmount: 0,
			reservedAmount: 0,
			availableFromWeek: 1,
			derivedFromProductId: null,
		};

		const result = designModel(state, {
			name: "Aurora-1",
			family: "text",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		});

		expect(result.state.warnings).toContainEqual({
			code: "stale_data",
			severity: "warning",
		});
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "data_stale_warning",
				dataIds: ["data_001"],
				threshold: 40,
			}),
		);
	});

	it("records a bounded quality and debt consequence for synthetic overuse", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		state.dataInventory.items[0] = {
			id: "data_001",
			sourceId: "synthetic_curriculum",
			provenance: "synthetic",
			quality: 65,
			freshness: 100,
			modality: "general",
			usageRestrictions: ["training_only"],
			rightsRisk: 0,
			quantity: 300,
			consumedAmount: 0,
			reservedAmount: 0,
			availableFromWeek: 1,
			derivedFromProductId: null,
		};

		const designed = designModel(state, {
			name: "Synthetic-1",
			family: "text",
			foundation: "fresh",
			tier: "standard",
			dataMix: { general: 100, code: 0, multimodal: 0 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		}).state;
		const project = designed.projects.items.at(-1);
		if (project === undefined || project.kind !== "training") {
			throw new Error("Expected training project");
		}
		project.duration = 1;

		const result = trainingSystem(designed, { phase: "training", week: 1 });
		const model = result.state.models.items.at(-1);

		expect(model?.dataDebt).toBe(50);
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "synthetic_data_overuse",
				modelId: model?.id,
				qualityPenalty: 50,
				debtAdded: 50,
			}),
		);
	});

	it("migrates a v4 save by adding the safe inventory and data counter defaults", () => {
		const fixture = JSON.parse(
			serializeGameState(startRun({ companyName: "Migration Labs" }, 42)),
		) as Record<string, unknown>;
		const meta = fixture.meta as Record<string, unknown>;
		const counters = fixture.counters as Record<string, unknown>;
		delete fixture.dataInventory;
		delete counters.data;
		meta.schemaVersion = 4;
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameStateWithMetadata(fixture);

		expect(upgraded.sourceSchemaVersion).toBe(4);
		expect(upgraded.currentSchemaVersion).toBe(5);
		expect(upgraded.state.dataInventory.items).toHaveLength(3);
		expect(upgraded.state.counters.data).toBe(4);
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("replays acquisition commands byte-for-byte", () => {
		const original = acquireData(startRun({ companyName: "Replay Labs" }, 42), {
			sourceId: "licensed_code",
		}).state;

		const replayed = replayCommandLog(original.commandLog);

		expect(JSON.stringify(replayed)).toBe(JSON.stringify(original));
		expect(replayed.dataInventory).toEqual(original.dataInventory);
	});

	it("requires an eligible operating product for product-derived data", () => {
		const noProduct = startRun({ companyName: "Acme Labs" }, 42);
		expect(() =>
			acquireData(noProduct, { sourceId: "product_feedback" }),
		).toThrow(/eligible operating product/i);

		const state = operatingProductState();
		const result = acquireData(state, { sourceId: "product_feedback" });
		const record = result.state.dataInventory.items.at(-1);
		if (record === undefined)
			throw new Error("Expected product-derived record");

		expect(record).toMatchObject({
			provenance: "product_derived",
			derivedFromProductId: "product_001",
			rightsRisk: 55,
		});
	});

	it("rejects a persisted product-derived record with an unknown product", () => {
		const state = operatingProductState();
		const acquired = acquireData(state, { sourceId: "product_feedback" });
		const record = acquired.state.dataInventory.items.at(-1);
		if (record === undefined)
			throw new Error("Expected product-derived record");
		record.derivedFromProductId = "product_404";
		const command = acquired.state.commandLog.at(-1);
		if (command === undefined || command.kind !== "acquire_data") {
			throw new Error("Expected acquire data command");
		}
		command.productId = "product_404";

		expect(() => assertGameState(acquired.state)).toThrow(
			/product.*unknown|product.*record/i,
		);
	});

	it("rejects locked and restricted records when compiling a model mix", () => {
		const state = startRun({ companyName: "Restricted Labs" }, 42);
		const node = state.research.nodes.find(
			(candidate) => candidate.id === "text_models_principles",
		);
		if (node === undefined)
			throw new Error("Expected text model research node");
		node.status = "completed";
		for (const record of state.dataInventory.items) {
			record.consumedAmount = record.quantity;
		}
		const acquired = acquireData(state, { sourceId: "research_archive" });

		expect(() =>
			designModel(acquired.state, {
				name: "Blocked-1",
				family: "text",
				foundation: "fresh",
				tier: "lean",
				dataMix: { general: 100, code: 0, multimodal: 0 },
				emphasis: {
					capability: 2,
					reliability: 2,
					safety: 1,
					efficiency: 1,
				},
			}),
		).toThrow(/locked or restricted/i);
	});

	it("rejects duplicate and over-consumption allocation attempts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const before = JSON.stringify(state.dataInventory);

		expect(() =>
			consumeDataAllocations(state.dataInventory, [
				{ recordId: "data_001", amount: 1 },
				{ recordId: "data_001", amount: 1 },
			]),
		).toThrow(/duplicate/i);
		expect(() =>
			consumeDataAllocations(state.dataInventory, [
				{ recordId: "data_001", amount: 1 },
			]),
		).toThrow(/reserved|allocation/i);
		expect(JSON.stringify(state.dataInventory)).toBe(before);
	});

	it("validates every persisted inventory field and rejects unknown fields", () => {
		const state = startRun({ companyName: "Contract Labs" }, 42);
		const valid = JSON.parse(
			JSON.stringify(state.dataInventory),
		) as GameState["dataInventory"];
		expect(() => assertDataInventoryState(valid)).not.toThrow();

		const invalidQuality = JSON.parse(JSON.stringify(valid));
		invalidQuality.items[0].quality = 101;
		expect(() => assertDataInventoryState(invalidQuality)).toThrow(/quality/i);

		const invalidUsage = JSON.parse(JSON.stringify(valid));
		invalidUsage.items[0].usageRestrictions = ["not_a_restriction"];
		expect(() => assertDataInventoryState(invalidUsage)).toThrow(
			/restriction/i,
		);

		const overConsumed = JSON.parse(JSON.stringify(valid));
		overConsumed.items[0].consumedAmount = 301;
		expect(() => assertDataInventoryState(overConsumed)).toThrow(
			/consumed|quantity/i,
		);

		const duplicate = JSON.parse(JSON.stringify(valid));
		duplicate.items[1].id = duplicate.items[0].id;
		expect(() => assertDataInventoryState(duplicate)).toThrow(/duplicate/i);

		const extended = JSON.parse(JSON.stringify(valid));
		extended.items[0].unexpected = true;
		expect(() => assertDataInventoryState(extended)).toThrow(/unexpected/i);
	});
});

function operatingProductState(): GameState {
	const state = startRun({ companyName: "Product Labs" }, 42);
	const node = state.research.nodes.find(
		(candidate) => candidate.id === "text_models_principles",
	);
	if (node === undefined) throw new Error("Expected text model research node");
	node.status = "completed";
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "launched",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 70,
				coding: 70,
				reliability: 70,
				safety: 70,
				efficiency: 70,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 70, lower: 60, upper: 80 },
				coding: { estimate: 70, lower: 60, upper: 80 },
				reliability: { estimate: 70, lower: 60, upper: 80 },
				safety: { estimate: 70, lower: 60, upper: 80 },
				efficiency: { estimate: 70, lower: 60, upper: 80 },
				multimodal: { estimate: 0, lower: 0, upper: 10 },
			},
		},
	];
	state.products.items = [
		{
			id: "product_001",
			channel: "chat",
			modelId: "model_001",
			status: "operating",
			users: 10,
			lastRevenue: 0,
			cumulativeRevenue: 0,
			servingDemand: 10,
			effectiveQuality: 70,
		},
	];
	state.counters.model = 2;
	state.counters.product = 2;
	state.compute = withRecomputedCompute(state);
	return state;
}
