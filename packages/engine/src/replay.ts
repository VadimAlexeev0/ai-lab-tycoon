import {
	type AdvanceWeekOptions,
	advanceWeek,
	advanceWeekForLegacyV10Replay,
} from "./advance-week.js";
import { applyDecision } from "./apply-decision.js";
import { canonicalEqual } from "./canonical.js";
import { assignProject, cancelProject } from "./commands/projects.js";
import { buyCompute, hireTeam } from "./commands/teams.js";
import {
	isLegacyV9MultimodalDataMix,
	LEGACY_V9_UNIFIED_ARCHITECTURE_PROVENANCE,
} from "./data/multimodal-architectures.js";
import { getRivalStrategyActions } from "./data/rivals.js";
import { acquireData } from "./data-inventory.js";
import { runEvaluation } from "./evaluations.js";
import { designModel, designModelForLegacyReplay } from "./model-design.js";
import {
	applyProductResume,
	launchProduct,
	retireProduct,
} from "./products.js";
import { refreshModel } from "./refresh-model.js";
import { LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH } from "./replay-compatibility.js";
import { startRun } from "./start-run.js";
import type { CommandLogEntry, EngineResult, GameState } from "./state.js";
import { GAME_STATE_SCHEMA_VERSION } from "./state.js";
import {
	assertArray,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertObject,
	assertSafeInteger,
} from "./validation.js";

/**
 * Versioned transport shape for command logs. The engine state keeps the
 * backwards-compatible command entry array; exports and persisted forks can
 * wrap it in this envelope before replaying it.
 */
export type CommandLogEnvelope = Readonly<{
	schemaVersion: number;
}> &
	(
		| Readonly<{ commands: readonly CommandLogEntry[] }>
		| Readonly<{ entries: readonly CommandLogEntry[] }>
		| Readonly<{ commandLog: readonly CommandLogEntry[] }>
	);

export type ReplayCommandLogInput =
	| readonly CommandLogEntry[]
	| CommandLogEnvelope;

export type ReplayCommandLogOptions = Readonly<{
	expectedState?: GameState;
	/** Optional deterministic fixture override for a seeded replay. */
	initialCash?: number;
}>;

/**
 * Replay a complete command log through the same public state transitions used
 * by a live run. The generated command entry is compared structurally after
 * every step so key insertion order cannot hide a malformed or drifted log.
 * Versioned v9/v10 envelopes and migrated raw logs scope their legacy rival
 * semantics to the source-command boundary; later v11 commands use current
 * rival strategy behavior.
 */
export function replayCommandLog(
	commandLog: ReplayCommandLogInput,
	options: ReplayCommandLogOptions = {},
): GameState {
	const normalizedLog = normalizeCommandLog(commandLog);
	const entries = normalizedLog.entries;
	const first = entries[0];
	if (first === undefined || first.kind !== "start_run") {
		throw new Error("Replay requires a command log beginning with start_run");
	}

	let state = startRun(first.setup, first.seed);
	if (options.initialCash !== undefined) {
		assertNonNegativeInteger(options.initialCash, "Replay initial cash");
		state = {
			...state,
			company: { ...state.company, cash: options.initialCash },
		};
	}
	const replayedStartCommand = state.commandLog[0];
	if (replayedStartCommand === undefined) {
		throw new Error("Replay generated state without a start command");
	}
	assertReplayedCommand(
		withoutLegacyV10RivalStrategyMarker(replayedStartCommand),
		withoutLegacyV10RivalStrategyMarker(first),
	);

	for (const command of entries.slice(1)) {
		const result = replayCommand(
			state,
			command,
			normalizedLog.legacyArchitectureDefaultCommandIds.has(command.id),
			normalizedLog.legacyV10RivalStrategyCommandIds.has(command.id),
		);
		const actual = result.state.commandLog.at(-1);
		assertReplayedCommand(actual, command);
		state = result.state;
	}

	const expectedStateHasLegacyBoundary =
		options.expectedState !== undefined &&
		options.expectedState.commandLog[0] !== undefined &&
		Object.hasOwn(
			options.expectedState.commandLog[0],
			LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH,
		);
	const shouldPersistLegacyBoundary =
		normalizedLog.persistLegacyV10RivalStrategyBoundary ||
		expectedStateHasLegacyBoundary ||
		(normalizedLog.legacyV10RivalStrategyCommandIds.size > 0 &&
			shouldPersistLegacyV10RivalBoundary(state));
	if (
		normalizedLog.legacyV10RivalStrategyBoundaryCommandId !== undefined &&
		shouldPersistLegacyBoundary
	) {
		const generatedStartCommand = state.commandLog[0];
		if (generatedStartCommand === undefined) {
			throw new Error("Replay generated state without a start command");
		}
		const markedStartCommand = {
			...generatedStartCommand,
			[LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH]:
				normalizedLog.legacyV10RivalStrategyBoundaryCommandId,
		} as unknown as CommandLogEntry;
		state = {
			...state,
			commandLog: [markedStartCommand, ...state.commandLog.slice(1)],
		};
	}

	if (
		options.expectedState !== undefined &&
		!canonicalEqual(state, options.expectedState)
	) {
		throw new Error(
			"Replay state mismatch: reconstructed state does not equal expectedState",
		);
	}
	return state;
}

/** Alias with a verb that reads naturally for callers holding a state log. */
export const replay = replayCommandLog;

type NormalizedCommandLog = Readonly<{
	entries: readonly CommandLogEntry[];
	legacyArchitectureDefaultCommandIds: ReadonlySet<string>;
	legacyV10RivalStrategyCommandIds: ReadonlySet<string>;
	legacyV10RivalStrategyBoundaryCommandId?: string;
	persistLegacyV10RivalStrategyBoundary: boolean;
}>;

function normalizeCommandLog(
	input: ReplayCommandLogInput,
): NormalizedCommandLog {
	if (Array.isArray(input)) {
		const normalized = normalizeLegacyCommandEntries(input);
		validateReplayEntries(normalized.entries);
		const boundaryCommandId = readLegacyV10RivalStrategyBoundary(
			normalized.entries,
		);
		return {
			...normalized,
			legacyV10RivalStrategyCommandIds: legacyV10RivalStrategyCommandIds(
				normalized.entries,
				boundaryCommandId,
			),
			legacyV10RivalStrategyBoundaryCommandId: boundaryCommandId,
			persistLegacyV10RivalStrategyBoundary: boundaryCommandId !== undefined,
		};
	}

	assertObject(input, "command log envelope");
	const envelope = input as Record<string, unknown>;
	assertSafeInteger(envelope.schemaVersion, "Command log schema version");
	if (
		envelope.schemaVersion !== GAME_STATE_SCHEMA_VERSION &&
		envelope.schemaVersion !== GAME_STATE_SCHEMA_VERSION - 1 &&
		envelope.schemaVersion !== GAME_STATE_SCHEMA_VERSION - 2
	) {
		throw new Error(
			`Unsupported command log schema version: ${String(envelope.schemaVersion)}`,
		);
	}

	const payloadKeys = ["commands", "entries", "commandLog"].filter((key) =>
		Object.hasOwn(envelope, key),
	);
	if (payloadKeys.length !== 1) {
		throw new Error(
			"Command log envelope must contain exactly one commands, entries, or commandLog field",
		);
	}
	const payloadKey = payloadKeys[0];
	if (payloadKey === undefined) {
		throw new Error("Command log envelope payload is missing");
	}
	assertExactObject(
		envelope,
		["schemaVersion", payloadKey],
		"command log envelope",
	);
	assertArray(envelope[payloadKey], "Command log envelope commands");
	const rawEntries = envelope[payloadKey] as unknown as CommandLogEntry[];
	const normalized =
		envelope.schemaVersion === GAME_STATE_SCHEMA_VERSION - 2
			? normalizeLegacyCommandEntries(rawEntries, true)
			: {
					entries: rawEntries,
					legacyArchitectureDefaultCommandIds:
						legacyArchitectureCommandIds(rawEntries),
					legacyV10RivalStrategyCommandIds: new Set<string>(),
				};
	validateReplayEntries(normalized.entries);
	const persistedBoundaryCommandId = readLegacyV10RivalStrategyBoundary(
		normalized.entries,
	);
	const boundaryCommandId =
		envelope.schemaVersion === GAME_STATE_SCHEMA_VERSION - 1 ||
		envelope.schemaVersion === GAME_STATE_SCHEMA_VERSION - 2
			? normalized.entries.at(-1)?.id
			: persistedBoundaryCommandId;
	return {
		...normalized,
		legacyV10RivalStrategyCommandIds: legacyV10RivalStrategyCommandIds(
			normalized.entries,
			boundaryCommandId,
		),
		legacyV10RivalStrategyBoundaryCommandId: boundaryCommandId,
		persistLegacyV10RivalStrategyBoundary:
			persistedBoundaryCommandId !== undefined,
	};
}

/** Add only the v10 default needed to replay a legacy v9 design command. */
function normalizeLegacyCommandEntries(
	entries: readonly CommandLogEntry[],
	rejectFutureArchitectureFields = false,
): NormalizedCommandLog {
	if (rejectFutureArchitectureFields) {
		for (const entry of entries) {
			if (entry === null || typeof entry !== "object") continue;
			for (const field of [
				"architecturePath",
				"architectureDebt",
				"architectureProvenance",
			]) {
				if (Object.hasOwn(entry, field)) {
					throw new Error(
						`v9 command contains unexpected architecture field: ${field}`,
					);
				}
			}
		}
	}
	let changed = false;
	const legacyArchitectureDefaultCommandIds = new Set<string>();
	const normalized = entries.map((entry) => {
		if (entry.kind !== "design_model" || entry.family !== "multimodal") {
			return entry;
		}
		if (
			entry.architectureProvenance === LEGACY_V9_UNIFIED_ARCHITECTURE_PROVENANCE
		) {
			legacyArchitectureDefaultCommandIds.add(entry.id);
			return entry;
		}
		if (entry.architecturePath !== undefined) return entry;
		changed = true;
		legacyArchitectureDefaultCommandIds.add(entry.id);
		const architectureProvenance = isLegacyV9MultimodalDataMix(entry.dataMix)
			? LEGACY_V9_UNIFIED_ARCHITECTURE_PROVENANCE
			: undefined;
		return {
			...entry,
			architecturePath: "unified" as const,
			...(architectureProvenance === undefined
				? {}
				: { architectureProvenance }),
		};
	});
	return {
		entries: changed ? normalized : entries,
		legacyArchitectureDefaultCommandIds,
		legacyV10RivalStrategyCommandIds: new Set<string>(),
		persistLegacyV10RivalStrategyBoundary: false,
	};
}

function legacyArchitectureCommandIds(
	entries: readonly CommandLogEntry[],
): Set<string> {
	return new Set(
		entries
			.filter(
				(entry) =>
					entry.kind === "design_model" &&
					entry.architectureProvenance ===
						LEGACY_V9_UNIFIED_ARCHITECTURE_PROVENANCE,
			)
			.map((entry) => entry.id),
	);
}

function readLegacyV10RivalStrategyBoundary(
	entries: readonly CommandLogEntry[],
): string | undefined {
	const first = entries[0];
	if (first === undefined || first.kind !== "start_run") return undefined;
	const marker = (first as unknown as Record<string, unknown>)[
		LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH
	];
	if (marker === undefined) return undefined;
	assertIdentifier(marker, "Legacy rival replay boundary command id");
	return marker;
}

function legacyV10RivalStrategyCommandIds(
	entries: readonly CommandLogEntry[],
	boundaryCommandId: string | undefined,
): Set<string> {
	if (boundaryCommandId === undefined) return new Set<string>();
	const boundaryIndex = entries.findIndex(
		(entry) => entry.id === boundaryCommandId,
	);
	if (boundaryIndex < 0) {
		throw new Error("Legacy rival replay marker references an unknown command");
	}
	return new Set(entries.slice(0, boundaryIndex + 1).map((entry) => entry.id));
}

function shouldPersistLegacyV10RivalBoundary(state: GameState): boolean {
	return state.rivals.items.some((rival) => {
		const active = state.meta.era === "text" ? rival.active : true;
		const firstAction = getRivalStrategyActions(rival.archetype)[0];
		return (
			active &&
			firstAction !== undefined &&
			rival.progress >= firstAction.threshold
		);
	});
}

function withoutLegacyV10RivalStrategyMarker(
	entry: CommandLogEntry,
): CommandLogEntry {
	const copy = { ...(entry as unknown as Record<string, unknown>) };
	delete copy[LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH];
	return copy as unknown as CommandLogEntry;
}

function validateReplayEntries(entries: readonly unknown[]): void {
	if (entries.length === 0) {
		throw new Error(
			"Replay requires a non-empty command log beginning with start_run",
		);
	}

	let previousWeek: number | undefined;
	for (const [index, entry] of entries.entries()) {
		assertObject(entry, "command log entry");
		assertIdentifier(entry.id, "Command id");
		assertSafeInteger(entry.week, "Command week");
		if (entry.week < 1) {
			throw new Error("Command week must be positive");
		}
		const expectedId = `command_${String(index + 1).padStart(3, "0")}`;
		if (entry.id !== expectedId) {
			throw new Error(
				`Command ids must be sequential; expected ${expectedId} but received ${entry.id}`,
			);
		}
		if (previousWeek !== undefined && entry.week < previousWeek) {
			throw new Error("Command weeks must be non-decreasing");
		}
		previousWeek = entry.week;
	}
}

function replayCommand(
	state: GameState,
	command: CommandLogEntry,
	legacyArchitectureReplay = false,
	legacyV10RivalStrategyReplay = false,
): EngineResult {
	switch (command.kind) {
		case "start_run":
			throw new Error("A replay log may contain only one start_run command");
		case "advance_week": {
			const options: AdvanceWeekOptions = {
				...(command.incidentRolls === undefined
					? {}
					: { incidentRolls: command.incidentRolls }),
				...(command.incidentRoll === undefined
					? {}
					: { incidentRoll: command.incidentRoll }),
			};
			return legacyV10RivalStrategyReplay
				? advanceWeekForLegacyV10Replay(state, options)
				: advanceWeek(state, options);
		}
		case "apply_decision":
			return applyDecision(state, command.choice);
		case "assign_project":
			return assignProject(state, command.teamId, command.projectId);
		case "cancel_project":
			return cancelProject(state, command.teamId, command.projectId);
		case "design_model": {
			const spec = {
				name: command.name,
				family: command.family,
				foundation: command.foundation,
				...(command.architecturePath === undefined
					? {}
					: { architecturePath: command.architecturePath }),
				parentModelId: command.parentModelId,
				brandId: command.brandId,
				tier: command.tier,
				dataMix: command.dataMix,
				emphasis: command.emphasis,
				teamId: command.teamId,
			};
			return legacyArchitectureReplay
				? designModelForLegacyReplay(state, spec)
				: designModel(state, spec);
		}
		case "refresh_model":
			return refreshModel(state, {
				modelId: command.modelId,
				teamId: command.teamId,
				dataMix: command.dataMix,
			});
		case "run_evaluation":
			return runEvaluation(state, command.modelId, command.evaluation);
		case "launch_product":
			return launchProduct(
				state,
				command.modelId,
				command.channel,
				command.price,
			);
		case "acquire_data":
			return acquireData(state, {
				sourceId: command.sourceId,
				productId: command.productId,
			});
		case "buy_compute":
			return buyCompute(state);
		case "hire_team":
			return hireTeam(state, command.name);
		case "product_resume":
			return applyProductResume(state, command.productId);
		case "product_retire":
			return retireProduct(state, command.productId);
	}
}

function assertReplayedCommand(
	actual: CommandLogEntry | undefined,
	expected: CommandLogEntry,
): void {
	if (actual === undefined || !canonicalEqual(actual, expected)) {
		throw new Error(
			`Replay command mismatch for ${expected.id}: generated command does not match the log`,
		);
	}
}
