import { canonicalSerialize } from "./canonical.js";
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

const STATE_MIGRATIONS: Readonly<Record<number, StateMigration>> = {
	[GAME_STATE_SCHEMA_VERSION]: cloneJsonValue,
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
 * The current dispatcher only has an identity migration because v1 is the
 * first accepted persisted format. The returned value is a JSON clone, so
 * future migrations can build new state without mutating their input.
 *
 * When a second structural schema version is introduced, replace this
 * direct-to-current lookup with explicit stepwise chaining through each
 * intermediate version; do not skip migrations.
 *
 * ponytail: Historical pre-v1 data is intentionally not modeled; add each
 * structural version here with a real fixture and deterministic migration.
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

	const migration = STATE_MIGRATIONS[sourceSchemaVersion];
	if (migration === undefined) {
		throw new Error(
			`Unsupported game state schema version: ${sourceSchemaVersion}`,
		);
	}

	const migrated = migration(value);
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

function cloneJsonValue(value: unknown): unknown {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		throw new Error("Game state migration produced no JSON value");
	}
	const cloned: unknown = JSON.parse(serialized);
	return cloned;
}
