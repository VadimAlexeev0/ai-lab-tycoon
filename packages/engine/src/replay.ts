import { type AdvanceWeekOptions, advanceWeek } from "./advance-week.js";
import { applyDecision } from "./apply-decision.js";
import { assignProject, cancelProject } from "./commands/projects.js";
import { runEvaluation } from "./evaluations.js";
import { designModel } from "./model-design.js";
import { launchProduct } from "./products.js";
import { startRun } from "./start-run.js";
import type { CommandLogEntry, EngineResult, GameState } from "./state.js";

/**
 * Replay a complete command log through the same public state transitions used
 * by a live run. The generated command entry is compared after every step so
 * a malformed or drifted log cannot silently produce a different run.
 */
export function replayCommandLog(
	commandLog: readonly CommandLogEntry[],
): GameState {
	const first = commandLog[0];
	if (first === undefined || first.kind !== "start_run") {
		throw new Error("Replay requires a command log beginning with start_run");
	}

	let state = startRun(first.setup, first.seed);
	assertReplayedCommand(state.commandLog[0], first);

	for (const command of commandLog.slice(1)) {
		const result = replayCommand(state, command);
		const actual = result.state.commandLog.at(-1);
		assertReplayedCommand(actual, command);
		state = result.state;
	}
	return state;
}

/** Alias with a verb that reads naturally for callers holding a state log. */
export const replay = replayCommandLog;

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
		case "run_evaluation":
			return runEvaluation(state, command.modelId, command.evaluation);
		case "launch_product":
			return launchProduct(state, command.modelId, command.channel);
	}
}

function assertReplayedCommand(
	actual: CommandLogEntry | undefined,
	expected: CommandLogEntry,
): void {
	if (
		actual === undefined ||
		JSON.stringify(actual) !== JSON.stringify(expected)
	) {
		throw new Error(
			`Replay command mismatch for ${expected.id}: generated command does not match the log`,
		);
	}
}
