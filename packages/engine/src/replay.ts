import { type AdvanceWeekOptions, advanceWeek } from "./advance-week.js";
import { applyDecision } from "./apply-decision.js";
import { canonicalEqual } from "./canonical.js";
import { assignProject, cancelProject } from "./commands/projects.js";
import { buyCompute, hireTeam } from "./commands/teams.js";
import { acquireData } from "./data-inventory.js";
import { runEvaluation } from "./evaluations.js";
import { designModel } from "./model-design.js";
import { applyProductResume, launchProduct } from "./products.js";
import { refreshModel } from "./refresh-model.js";
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
 */
export function replayCommandLog(
	commandLog: ReplayCommandLogInput,
	options: ReplayCommandLogOptions = {},
): GameState {
	const entries = normalizeCommandLog(commandLog);
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
	assertReplayedCommand(state.commandLog[0], first);

	for (const command of entries.slice(1)) {
		const result = replayCommand(state, command);
		const actual = result.state.commandLog.at(-1);
		assertReplayedCommand(actual, command);
		state = result.state;
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

function normalizeCommandLog(
	input: ReplayCommandLogInput,
): readonly CommandLogEntry[] {
	if (Array.isArray(input)) {
		validateReplayEntries(input);
		return input;
	}

	assertObject(input, "command log envelope");
	const envelope = input as Record<string, unknown>;
	assertSafeInteger(envelope.schemaVersion, "Command log schema version");
	if (envelope.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
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
	const entries = envelope[payloadKey] as unknown as CommandLogEntry[];
	validateReplayEntries(entries);
	return entries;
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
			return advanceWeek(state, options);
		}
		case "apply_decision":
			return applyDecision(state, command.choice);
		case "assign_project":
			return assignProject(state, command.teamId, command.projectId);
		case "cancel_project":
			return cancelProject(state, command.teamId, command.projectId);
		case "design_model":
			return designModel(state, {
				name: command.name,
				family: command.family,
				foundation: command.foundation,
				parentModelId: command.parentModelId,
				tier: command.tier,
				dataMix: command.dataMix,
				emphasis: command.emphasis,
				teamId: command.teamId,
			});
		case "refresh_model":
			return refreshModel(state, {
				modelId: command.modelId,
				teamId: command.teamId,
				dataMix: command.dataMix,
			});
		case "run_evaluation":
			return runEvaluation(state, command.modelId, command.evaluation);
		case "launch_product":
			return launchProduct(state, command.modelId, command.channel);
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
