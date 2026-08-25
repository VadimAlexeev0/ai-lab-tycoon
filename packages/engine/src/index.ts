import {
	assertDecisionChoice,
	type DecisionChoice,
	type PendingDecision,
} from "./components/decisions.js";
import { assertGameState } from "./invariants.js";
import { startRun } from "./start-run.js";
import type { EngineResult, GameState } from "./state.js";

export const ENGINE_PACKAGE_NAME = "@ai-lab-tycoon/engine";

export { startRun };

export function applyDecision(
	state: GameState,
	choice: DecisionChoice,
): EngineResult {
	assertGameState(state);
	assertDecisionChoice(choice);
	const pending = state.decisions.pending.find(
		(decision) => decision.id === choice.decisionId,
	);
	if (pending === undefined) {
		throw new Error(`Cannot apply unknown decision: ${choice.decisionId}`);
	}
	if (!isChoiceCompatible(pending, choice)) {
		throw new Error(
			`Decision choice ${choice.kind} is not compatible with ${pending.kind} decision ${pending.id}`,
		);
	}

	throw new Error("applyDecision is not implemented until Task 7");
}

export function advanceWeek(state: GameState): EngineResult {
	assertGameState(state);
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		throw new Error("Cannot advance week while a blocking decision is pending");
	}

	throw new Error("advanceWeek is not implemented until Task 5");
}

function isChoiceCompatible(
	decision: PendingDecision,
	choice: DecisionChoice,
): boolean {
	if (choice.kind === "shelve") {
		return decision.kind === "launch" || decision.kind === "evaluation";
	}

	switch (decision.kind) {
		case "launch":
			return choice.kind === "launch";
		case "evaluation":
			return (
				choice.kind === "evaluate" && choice.evaluation === decision.evaluation
			);
		case "funding":
			return choice.kind === "funding" && choice.round === decision.round;
		case "incident":
			return choice.kind === "incident";
	}
}

export type {
	DecisionChoice,
	PendingDecision,
} from "./components/decisions.js";
export type { Fact } from "./components/reports.js";
export { assertGameState } from "./invariants.js";
export type {
	NextObjective,
	ResourceBarSummary,
	TeamStatus,
	VisibleAvailableProject,
	VisibleGameState,
	VisibleRival,
	VisibleTeam,
} from "./selectors.js";
export {
	selectAvailableProjects,
	selectNextObjective,
	selectResourceBar,
	selectRivals,
	selectTeams,
	selectVisibleState,
} from "./selectors.js";
export type {
	EngineResult,
	GameState,
	RunSetup,
} from "./state.js";
export { GAME_STATE_SCHEMA_VERSION } from "./state.js";
