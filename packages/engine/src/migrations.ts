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

/**
 * Schema v1 is the first accepted persisted GameState format. Keep the
 * dispatcher explicit so future structural versions add a deliberate
 * migration instead of guessing at an older shape.
 */
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
	assertString(serialized, "Serialized game state");

	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		throw new Error("Serialized game state is not valid JSON");
	}
	return upgradeGameState(parsed, options);
}

/**
 * Upgrade a JSON-compatible value to the current validated GameState.
 *
 * The current dispatcher only has an identity migration because v1 is the
 * first accepted persisted format. The returned value is a JSON clone, so
 * future migrations can build new state without mutating their input.
 *
 * ponytail: Historical pre-v1 data is intentionally not modeled; add each
 * structural version here with a real fixture and deterministic migration.
 */
export function upgradeGameState(
	value: unknown,
	options: GameStateValidationOptions = {},
): GameState {
	assertJsonCompatible(value);
	const version = readSchemaVersion(value);

	if (version > GAME_STATE_SCHEMA_VERSION) {
		throw new Error(
			`Game state schema version ${version} is newer than supported version ${GAME_STATE_SCHEMA_VERSION}`,
		);
	}

	const migration = STATE_MIGRATIONS[version];
	if (migration === undefined) {
		throw new Error(`Unsupported game state schema version: ${version}`);
	}

	const migrated = migration(value);
	assertGameState(migrated, options, true);
	return migrated;
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
