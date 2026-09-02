import { canonicalSerialize } from "./canonical.js";
import { assertComputeState } from "./components/compute.js";
import {
	assertDataInventoryState,
	type DataInventoryState,
} from "./components/data-inventory.js";
import { assertModelsState } from "./components/models.js";
import { assertProductsState } from "./components/products.js";
import { assertProjectsState } from "./components/projects.js";
import type { ResearchState } from "./components/research.js";
import { assertResearchState } from "./components/research.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { PRODUCT_PRESSURE_BALANCE } from "./data/balance.js";
import { STARTING_DATA_INVENTORY } from "./data/data-sources.js";
import {
	assertGameState,
	type GameStateValidationOptions,
} from "./invariants.js";
import { GAME_STATE_SCHEMA_VERSION, type GameState } from "./state.js";
import {
	assertArray,
	assertExactObject,
	assertIdentifier,
	assertJsonCompatible,
	assertObject,
	assertPositiveInteger,
	assertSafeInteger,
	assertString,
} from "./validation.js";

/** Result of upgrading a persisted value through the current engine schema. */
export type GameStateUpgradeResult = Readonly<{
	state: GameState;
	sourceSchemaVersion: number;
	currentSchemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
}>;

type StateMigration = (value: unknown) => unknown;

const STATE_SCHEMA_VERSION_V1 = 1 as const;
const STATE_SCHEMA_VERSION_V2 = 2 as const;
const STATE_SCHEMA_VERSION_V3 = 3 as const;
const STATE_SCHEMA_VERSION_V4 = 4 as const;
const STATE_SCHEMA_VERSION_V5 = 5 as const;
const STATE_SCHEMA_VERSION_V6 = 6 as const;
const STATE_SCHEMA_VERSION_V7 = 7 as const;
const STATE_SCHEMA_VERSION_V8 = 8 as const;
const STATE_SCHEMA_VERSION_V9 = 9 as const;
const STATE_MIGRATIONS: Readonly<Record<number, StateMigration>> = {
	[STATE_SCHEMA_VERSION_V1]: migrateV1ToV2,
	[STATE_SCHEMA_VERSION_V2]: migrateV2ToV3,
	[STATE_SCHEMA_VERSION_V3]: migrateV3ToV4,
	[STATE_SCHEMA_VERSION_V4]: migrateV4ToV5,
	[STATE_SCHEMA_VERSION_V5]: migrateV5ToV6,
	[STATE_SCHEMA_VERSION_V6]: migrateV6ToV7,
	[STATE_SCHEMA_VERSION_V7]: migrateV7ToV8,
	[STATE_SCHEMA_VERSION_V8]: migrateV8ToV9,
};

/** Serialize a validated GameState using the engine's stable JSON contract. */
export function serializeGameState(
	state: GameState,
	options: GameStateValidationOptions = {},
): string {
	assertGameState(state, options, true);
	return canonicalSerialize(state);
}

/** Parse and migrate a serialized GameState through one validated boundary. */
export function deserializeGameState(
	serialized: string,
	options: GameStateValidationOptions = {},
): GameState {
	return deserializeGameStateWithMetadata(serialized, options).state;
}

/** Parse and migrate a serialized state while retaining source version metadata. */
export function deserializeGameStateWithMetadata(
	serialized: string,
	options: GameStateValidationOptions = {},
): GameStateUpgradeResult {
	assertString(serialized, "Serialized game state");

	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		throw new Error("Serialized game state is not valid JSON");
	}
	return upgradeGameStateWithMetadata(parsed, options);
}

/**
 * Upgrade a JSON-compatible value to the current validated GameState.
 *
 * State schema v2 is the first contract that includes the research effect
 * catalog. V1 persisted the compute reservation fields, but those fields were
 * derived under the pre-effect rules. Its explicit migration recomputes the
 * reservations before the current validator runs; it never treats a stale V1
 * reservation as authoritative. State schema v3 adds replay-safe Research
 * Spark discoveries. State schema v4 adds the unresolved/selected Era-1
 * research paradigm. State schema v5 adds the strategic data inventory and
 * its deterministic data ID counter. State schema v6 adds the model knowledge
 * cutoff/freshness contract and the explicit refresh project/command. V5
 * models that already have hidden scores derive their legacy cutoff from the
 * newest allocated inventory record and weighted source freshness. State
 * schema v7 adds the persistent incident risk component; v6 saves receive an
 * empty memory/crisis component. Schema v8 adds product operating pressure,
 * explicit pricing, and retirement. V7 saves receive deterministic defaults;
 * future-shaped V7 saves are rejected rather than silently downgraded. Schema v9
 * adds explicit brand/foundation identities and bounded foundation debt/risk;
 * V8 saves receive lineage defaults and design commands receive their brand id.
 * Future-shaped V8 lineage fields are rejected before defaults are applied.
 *
 * The returned value is a JSON clone, so migrations never mutate their input.
 * When another structural schema version is introduced, add a real migration
 * and fixture here and chain each intermediate version rather than skipping it.
 */
export function upgradeGameState(
	value: unknown,
	options: GameStateValidationOptions = {},
): GameState {
	return upgradeGameStateWithMetadata(value, options).state;
}

/**
 * Upgrade a value and return both the persisted source and current versions.
 *
 * `sourceSchemaVersion` describes the value before migration. The returned
 * state's metadata and `currentSchemaVersion` always describe the validated
 * current engine contract.
 */
export function upgradeGameStateWithMetadata(
	value: unknown,
	options: GameStateValidationOptions = {},
): GameStateUpgradeResult {
	assertJsonCompatible(value);
	const sourceSchemaVersion = readSchemaVersion(value);

	if (sourceSchemaVersion > GAME_STATE_SCHEMA_VERSION) {
		throw new Error(
			`Game state schema version ${sourceSchemaVersion} is newer than supported version ${GAME_STATE_SCHEMA_VERSION}`,
		);
	}

	let migrated = cloneJsonValue(value);
	let migratedVersion = sourceSchemaVersion;
	while (migratedVersion < GAME_STATE_SCHEMA_VERSION) {
		const migration = STATE_MIGRATIONS[migratedVersion];
		if (migration === undefined) {
			throw new Error(
				`Unsupported game state schema version: ${migratedVersion}`,
			);
		}
		migrated = migration(migrated);
		const nextVersion = readSchemaVersion(migrated);
		if (nextVersion !== migratedVersion + 1) {
			throw new Error(
				`Invalid game state migration chain from ${migratedVersion} to ${nextVersion}`,
			);
		}
		migratedVersion = nextVersion;
	}
	assertGameState(migrated, options, true);
	return {
		state: migrated,
		sourceSchemaVersion,
		currentSchemaVersion: GAME_STATE_SCHEMA_VERSION,
	};
}

function readSchemaVersion(value: unknown): number {
	assertObject(value, "game state");
	if (!Object.hasOwn(value, "meta")) {
		throw new Error("game state is missing required field: meta");
	}
	assertObject(value.meta, "game state meta");
	if (!Object.hasOwn(value.meta, "schemaVersion")) {
		throw new Error("game state meta is missing required field: schemaVersion");
	}
	assertSafeInteger(value.meta.schemaVersion, "Game state schema version");
	return value.meta.schemaVersion;
}

function migrateV1ToV2(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v1 game state");
	const meta = migrated.meta;
	assertObject(meta, "v1 game state meta");
	const compute = migrated.compute;
	const projects = migrated.projects;
	const models = migrated.models;
	const research = migrated.research;
	const products = migrated.products;
	assertComputeState(compute);
	assertProjectsState(projects);
	assertModelsState(models);
	assertLegacyResearchState(research, "v1 game state research");
	assertProductsState(products);

	meta.schemaVersion = STATE_SCHEMA_VERSION_V2;
	migrated.compute = withRecomputedCompute({
		compute,
		projects,
		models,
		research,
		products,
	});
	return migrated;
}

function migrateV2ToV3(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v2 game state");
	const meta = migrated.meta;
	assertObject(meta, "v2 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V2) {
		throw new Error("v2 game state has an invalid schema version");
	}
	const research = migrated.research;
	assertLegacyResearchState(research, "v2 game state research");
	if (
		research !== null &&
		typeof research === "object" &&
		!Object.hasOwn(research, "discoveredSparkIds")
	) {
		research.discoveredSparkIds = [];
	}
	meta.schemaVersion = STATE_SCHEMA_VERSION_V3;
	return migrated;
}

function migrateV3ToV4(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v3 game state");
	const meta = migrated.meta;
	assertObject(meta, "v3 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V3) {
		throw new Error("v3 game state has an invalid schema version");
	}
	const research = migrated.research;
	assertObject(research, "v3 game state research");
	if (Object.hasOwn(research, "paradigmId")) {
		throw new Error(
			"v3 game state research contains unexpected field: paradigmId",
		);
	}
	assertResearchState(research, { allowMissingParadigmId: true });
	research.paradigmId = null;
	meta.schemaVersion = STATE_SCHEMA_VERSION_V4;
	return migrated;
}

function migrateV4ToV5(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v4 game state");
	const meta = migrated.meta;
	assertObject(meta, "v4 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V4) {
		throw new Error("v4 game state has an invalid schema version");
	}
	if (Object.hasOwn(migrated, "dataInventory")) {
		throw new Error("v4 game state contains unexpected field: dataInventory");
	}
	const counters = migrated.counters;
	assertObject(counters, "v4 game state counters");
	if (Object.hasOwn(counters, "data")) {
		throw new Error("v4 game state counters contain unexpected field: data");
	}
	counters.data = STARTING_DATA_INVENTORY.length + 1;
	migrated.dataInventory = {
		items: STARTING_DATA_INVENTORY.map((record) => ({
			...record,
			usageRestrictions: [...record.usageRestrictions],
		})),
	};
	meta.schemaVersion = STATE_SCHEMA_VERSION_V5;
	return migrated;
}

function migrateV5ToV6(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v5 game state");
	const meta = migrated.meta;
	assertObject(meta, "v5 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V5) {
		throw new Error("v5 game state has an invalid schema version");
	}
	assertPositiveInteger(meta.week, "v5 game state week");
	const models = migrated.models;
	assertObject(models, "v5 game state models");
	assertArray(models.items, "v5 game state models items");
	const dataInventory = migrated.dataInventory;
	assertDataInventoryState(dataInventory);
	assertNoV6FieldsInV5(migrated);
	// Validate all pre-v6 model fields before deriving any new values. This
	// prevents malformed legacy data from being partially upgraded.
	assertModelsState(models);
	for (const item of models.items) {
		assertObject(item, "v5 model");
		if (
			Object.hasOwn(item, "knowledgeCutoff") ||
			Object.hasOwn(item, "knowledgeFreshness")
		) {
			throw new Error(
				"v5 model contains unexpected knowledge freshness fields",
			);
		}
		if (!Object.hasOwn(item, "trueScores")) continue;
		const knowledge = deriveLegacyKnowledge(item, dataInventory, meta.week);
		item.knowledgeCutoff = knowledge.knowledgeCutoff;
		item.knowledgeFreshness = knowledge.knowledgeFreshness;
	}
	meta.schemaVersion = STATE_SCHEMA_VERSION_V6;
	return migrated;
}

function migrateV6ToV7(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v6 game state");
	const meta = migrated.meta;
	assertObject(meta, "v6 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V6) {
		throw new Error("v6 game state has an invalid schema version");
	}
	if (Object.hasOwn(migrated, "risk")) {
		throw new Error("v6 game state contains unexpected field: risk");
	}
	migrated.risk = { memories: [], crises: [] };
	meta.schemaVersion = STATE_SCHEMA_VERSION_V7;
	return migrated;
}

function migrateV7ToV8(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v7 game state");
	const meta = migrated.meta;
	assertObject(meta, "v7 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V7) {
		throw new Error("v7 game state has an invalid schema version");
	}
	assertNoV8FieldsInV7(migrated);

	const products = migrated.products;
	assertProductsState(products);
	for (const product of products.items) {
		const pricing = PRODUCT_PRESSURE_BALANCE.channels[product.channel];
		product.price = pricing.defaultPrice;
		product.lastMargin = product.lastRevenue ?? 0;
		product.cumulativeMargin = product.cumulativeRevenue ?? 0;
		product.satisfaction = 100;
		product.churnRate = 0;
		product.retiredUsers = 0;
	}

	const commandLog = migrated.commandLog;
	assertArray(commandLog, "v7 command log");
	for (const command of commandLog) {
		assertObject(command, "v7 command log entry");
		if (command.kind !== "launch_product") continue;
		const product = products.items.find(
			(candidate) => candidate.id === command.productId,
		);
		if (product === undefined) {
			throw new Error(
				`v7 launch command references unknown product ${String(command.productId)}`,
			);
		}
		command.price = product.price;
	}
	meta.schemaVersion = STATE_SCHEMA_VERSION_V8;
	return migrated;
}

function migrateV8ToV9(value: unknown): unknown {
	const migrated = cloneJsonValue(value);
	assertObject(migrated, "v8 game state");
	const meta = migrated.meta;
	assertObject(meta, "v8 game state meta");
	if (meta.schemaVersion !== STATE_SCHEMA_VERSION_V8) {
		throw new Error("v8 game state has an invalid schema version");
	}
	assertNoV9FieldsInV8(migrated);

	const models = migrated.models;
	assertObject(models, "v8 game state models");
	assertModelsState(models);
	const modelItems = models.items as unknown as Record<string, unknown>[];
	const modelsById = new Map<string, Record<string, unknown>>();
	for (const item of modelItems) {
		assertObject(item, "v8 model");
		assertIdentifier(item.id, "v8 model id");
		modelsById.set(item.id, item);
	}

	const resolving = new Set<string>();
	const resolved = new Map<string, { brandId: string; foundationId: string }>();
	const resolveLineage = (
		item: Record<string, unknown>,
	): { brandId: string; foundationId: string } => {
		assertIdentifier(item.id, "v8 model id");
		const existing = resolved.get(item.id);
		if (existing !== undefined) return existing;
		if (resolving.has(item.id)) {
			throw new Error(`v8 model lineage contains a cycle at ${item.id}`);
		}
		resolving.add(item.id);
		let lineage: { brandId: string; foundationId: string };
		if (item.foundation === "fresh") {
			lineage = {
				brandId: `brand_${item.id}`,
				foundationId: `foundation_${item.id}`,
			};
		} else {
			if (typeof item.parentModelId !== "string") {
				throw new Error(
					`v8 ${String(item.foundation)} model ${item.id} must reference a parent`,
				);
			}
			const parent = modelsById.get(item.parentModelId);
			if (parent === undefined) {
				throw new Error(
					`v8 model ${item.id} references unknown parent ${item.parentModelId}`,
				);
			}
			const parentLineage = resolveLineage(parent);
			lineage = { ...parentLineage };
		}
		resolving.delete(item.id);
		resolved.set(item.id, lineage);
		return lineage;
	};

	for (const item of modelItems) {
		const lineage = resolveLineage(item);
		item.brandId = lineage.brandId;
		item.foundationId = lineage.foundationId;
		item.foundationDebt = 0;
		item.foundationRisk = 0;
	}

	const commandLog = migrated.commandLog;
	assertArray(commandLog, "v8 command log");
	for (const command of commandLog) {
		assertObject(command, "v8 command log entry");
		if (command.kind !== "design_model") continue;
		assertIdentifier(command.modelId, "v8 design model id");
		const model = modelsById.get(command.modelId);
		if (model === undefined) {
			throw new Error(
				`v8 design command references unknown model ${command.modelId}`,
			);
		}
		assertIdentifier(model.brandId, "v8 migrated model brand id");
		command.brandId = model.brandId;
	}

	meta.schemaVersion = STATE_SCHEMA_VERSION_V9;
	return migrated;
}

function assertNoV9FieldsInV8(state: Record<string, unknown>): void {
	const models = state.models;
	assertObject(models, "v8 models");
	assertArray(models.items, "v8 models items");
	for (const item of models.items) {
		assertObject(item, "v8 model");
		for (const field of [
			"brandId",
			"foundationId",
			"foundationDebt",
			"foundationRisk",
		]) {
			if (Object.hasOwn(item, field)) {
				throw new Error(`v8 model contains unexpected lineage field: ${field}`);
			}
		}
	}

	const commandLog = state.commandLog;
	assertArray(commandLog, "v8 command log");
	for (const command of commandLog) {
		assertObject(command, "v8 command log entry");
		if (command.kind === "design_model" && Object.hasOwn(command, "brandId")) {
			throw new Error(
				"v8 design command contains unexpected lineage field: brandId",
			);
		}
	}
}

function assertNoV8FieldsInV7(state: Record<string, unknown>): void {
	const products = state.products;
	assertObject(products, "v7 products");
	assertArray(products.items, "v7 products items");
	for (const item of products.items) {
		assertObject(item, "v7 product");
		for (const field of [
			"price",
			"lastMargin",
			"cumulativeMargin",
			"satisfaction",
			"churnRate",
			"retiredUsers",
		]) {
			if (Object.hasOwn(item, field)) {
				throw new Error(`v7 product contains unexpected field: ${field}`);
			}
		}
		if (item.status === "retired") {
			throw new Error("v7 product contains unexpected retired status");
		}
	}

	const decisions = state.decisions;
	assertObject(decisions, "v7 decisions");
	assertArray(decisions.pending, "v7 pending decisions");
	for (const decision of decisions.pending) {
		assertObject(decision, "v7 pending decision");
		if (decision.kind === "launch" && Object.hasOwn(decision, "price")) {
			throw new Error(
				"v7 pending launch decision contains unexpected price field",
			);
		}
	}

	const commandLog = state.commandLog;
	assertArray(commandLog, "v7 command log");
	for (const command of commandLog) {
		assertObject(command, "v7 command log entry");
		if (command.kind === "product_retire") {
			throw new Error(
				"v7 command log contains unexpected product_retire command",
			);
		}
		if (command.kind === "launch_product" && Object.hasOwn(command, "price")) {
			throw new Error("v7 launch command contains unexpected price field");
		}
		if (command.kind === "apply_decision") {
			const choice = command.choice;
			assertObject(choice, "v7 apply_decision choice");
			if (choice.kind === "launch" && Object.hasOwn(choice, "price")) {
				throw new Error(
					"v7 apply_decision launch choice contains unexpected price field",
				);
			}
		}
	}

	const reports = state.reports;
	assertObject(reports, "v7 reports");
	assertArray(reports.items, "v7 reports items");
	for (const report of reports.items) {
		assertObject(report, "v7 report");
		assertObject(report.fact, "v7 report fact");
		if (
			report.fact.kind === "product_pressure" ||
			report.fact.kind === "product_retired" ||
			report.fact.kind === "compute_conflict"
		) {
			throw new Error("v7 reports contain unexpected product pressure fact");
		}
	}

	const warnings = state.warnings;
	assertArray(warnings, "v7 warnings");
	for (const warning of warnings) {
		assertObject(warning, "v7 warning");
		if (warning.code === "compute_conflict") {
			throw new Error("v7 warnings contain unexpected compute conflict");
		}
	}
}

function assertNoV6FieldsInV5(state: Record<string, unknown>): void {
	const projects = state.projects;
	assertObject(projects, "v5 projects");
	assertArray(projects.items, "v5 projects items");
	for (const project of projects.items) {
		assertObject(project, "v5 project");
		if (project.kind === "refresh") {
			throw new Error("v5 game state contains unexpected refresh project");
		}
	}

	const commandLog = state.commandLog;
	assertArray(commandLog, "v5 command log");
	for (const command of commandLog) {
		assertObject(command, "v5 command log entry");
		if (command.kind === "refresh_model") {
			throw new Error("v5 game state contains unexpected refresh command");
		}
	}

	const reports = state.reports;
	assertObject(reports, "v5 reports");
	assertArray(reports.items, "v5 reports items");
	for (const report of reports.items) {
		assertObject(report, "v5 report");
		assertObject(report.fact, "v5 report fact");
		if (
			report.fact.kind === "knowledge_cutoff_recorded" ||
			report.fact.kind === "model_refresh_started" ||
			report.fact.kind === "model_refreshed" ||
			report.fact.kind === "model_staleness"
		) {
			throw new Error(
				"v5 game state contains unexpected knowledge report fact",
			);
		}
	}

	const warnings = state.warnings;
	assertArray(warnings, "v5 warnings");
	for (const warning of warnings) {
		assertObject(warning, "v5 warning");
		if (warning.code === "stale_model") {
			throw new Error("v5 game state contains unexpected stale-model warning");
		}
	}
}

function deriveLegacyKnowledge(
	model: Record<string, unknown>,
	inventory: DataInventoryState,
	fallbackWeek: number,
): { knowledgeCutoff: number; knowledgeFreshness: number } {
	if (!Object.hasOwn(model, "dataAllocation")) {
		return { knowledgeCutoff: fallbackWeek, knowledgeFreshness: 100 };
	}
	const allocations = model.dataAllocation;
	assertArray(allocations, "v5 model data allocation");
	let totalAmount = 0;
	let freshnessTotal = 0;
	let newestAvailableFromWeek: number | null = null;
	for (const allocation of allocations) {
		assertExactObject(allocation, ["recordId", "amount"], "v5 data allocation");
		assertIdentifier(allocation.recordId, "v5 data allocation record id");
		assertPositiveInteger(allocation.amount, "v5 data allocation amount");
		const record = inventory.items.find(
			(candidate) => candidate.id === allocation.recordId,
		);
		if (record === undefined) {
			throw new Error(
				`v5 model data allocation references unknown record ${allocation.recordId}`,
			);
		}
		totalAmount += allocation.amount;
		freshnessTotal += record.freshness * allocation.amount;
		newestAvailableFromWeek =
			newestAvailableFromWeek === null
				? record.availableFromWeek
				: Math.max(newestAvailableFromWeek, record.availableFromWeek);
	}
	return {
		knowledgeCutoff: newestAvailableFromWeek ?? fallbackWeek,
		knowledgeFreshness:
			totalAmount === 0 ? 100 : Math.trunc(freshnessTotal / totalAmount),
	};
}

function assertLegacyResearchState(
	value: unknown,
	label: string,
): asserts value is ResearchState {
	assertObject(value, label);
	if (Object.hasOwn(value, "discoveredSparkIds")) {
		throw new Error(`${label} contains unexpected field: discoveredSparkIds`);
	}
	if (Object.hasOwn(value, "paradigmId")) {
		throw new Error(`${label} contains unexpected field: paradigmId`);
	}
	assertResearchState(value, {
		allowMissingDiscoveredSparkIds: true,
		allowMissingParadigmId: true,
	});
}

function cloneJsonValue(value: unknown): unknown {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		throw new Error("Game state migration produced no JSON value");
	}
	const cloned: unknown = JSON.parse(serialized);
	return cloned;
}
