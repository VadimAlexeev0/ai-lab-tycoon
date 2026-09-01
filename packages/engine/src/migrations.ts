import { canonicalSerialize } from "./canonical.js";
import { assertComputeState } from "./components/compute.js";
import { assertModelsState } from "./components/models.js";
import { assertProductsState } from "./components/products.js";
import { assertProjectsState } from "./components/projects.js";
import type { ResearchState } from "./components/research.js";
import { assertResearchState } from "./components/research.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import {
	assertGameState,
	type GameStateValidationOptions,
} from "./invariants.js";
import { GAME_STATE_SCHEMA_VERSION, type GameState } from "./state.js";
import {
	assertJsonCompatible,
	assertObject,
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
const STATE_MIGRATIONS: Readonly<Record<number, StateMigration>> = {
	[STATE_SCHEMA_VERSION_V1]: migrateV1ToV2,
	[STATE_SCHEMA_VERSION_V2]: migrateV2ToV3,
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
 * Spark discoveries. There is no deployed pre-v1 format to support.
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
	meta.schemaVersion = GAME_STATE_SCHEMA_VERSION;
	return migrated;
}

function assertLegacyResearchState(
	value: unknown,
	label: string,
): asserts value is ResearchState {
	assertObject(value, label);
	if (Object.hasOwn(value, "discoveredSparkIds")) {
		throw new Error(`${label} contains unexpected field: discoveredSparkIds`);
	}
	assertResearchState(value, { allowMissingDiscoveredSparkIds: true });
}

function cloneJsonValue(value: unknown): unknown {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		throw new Error("Game state migration produced no JSON value");
	}
	const cloned: unknown = JSON.parse(serialized);
	return cloned;
}
