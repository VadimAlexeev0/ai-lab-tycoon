import { assertDecisionChoice } from "./components/decisions.js";
import { assertGameState } from "./invariants.js";
import {
	createInitialGameState,
	type EngineResult,
	type GameState,
	type RunSetup,
} from "./state.js";

export const ENGINE_PACKAGE_NAME = "@ai-lab-tycoon/engine";

export function startRun(setup: RunSetup, seed: number): GameState {
	return createInitialGameState(setup, seed);
}

export function applyDecision(
	state: GameState,
	choice: import("./components/decisions.js").DecisionChoice,
): EngineResult {
	assertGameState(state);
	assertDecisionChoice(choice);
	if (
		!state.decisions.pending.some(
			(decision) => decision.id === choice.decisionId,
		)
	) {
		throw new Error(`Cannot apply unknown decision: ${choice.decisionId}`);
	}

	return {
		state,
		facts: [],
		pending: [...state.decisions.pending],
	};
}

export function advanceWeek(state: GameState): EngineResult {
	assertGameState(state);
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		throw new Error("Cannot advance week while a blocking decision is pending");
	}

	return {
		state,
		facts: [],
		pending: [...state.decisions.pending],
	};
}

export type {
	CompanyResources,
	CompanyState,
} from "./components/company.js";
export {
	assertCompanyState,
	createCompanyState,
} from "./components/company.js";
export type { ComputeState } from "./components/compute.js";
export {
	assertComputeState,
	createComputeState,
} from "./components/compute.js";
export type {
	DecisionChoice,
	DecisionsState,
	EvaluationKind,
	IncidentResponse,
	IncidentType,
	PendingDecision,
} from "./components/decisions.js";
export {
	assertDecisionChoice,
	assertDecisionsState,
	createDecisionsState,
} from "./components/decisions.js";
export type {
	FundingRound,
	FundingRoundState,
	FundingState,
	FundingStatus,
} from "./components/funding.js";
export {
	assertFundingState,
	createFundingState,
} from "./components/funding.js";
export type {
	Model,
	ModelFoundation,
	ModelStatus,
	ModelsState,
} from "./components/models.js";
export { assertModelsState, createModelsState } from "./components/models.js";
export type {
	Product,
	ProductChannel,
	ProductStatus,
	ProductsState,
} from "./components/products.js";
export {
	assertProductsState,
	createProductsState,
} from "./components/products.js";
export type {
	Project,
	ProjectBase,
	ProjectStatus,
	ProjectsState,
} from "./components/projects.js";
export {
	assertProjectsState,
	createProjectsState,
} from "./components/projects.js";
export type {
	Fact,
	Report,
	ReportPriority,
	ReportsState,
	ResourceName,
} from "./components/reports.js";
export {
	assertFact,
	assertReportsState,
	createReportsState,
} from "./components/reports.js";
export type {
	ResearchBranch,
	ResearchEra,
	ResearchNode,
	ResearchNodeStatus,
	ResearchState,
} from "./components/research.js";
export {
	assertResearchState,
	createResearchState,
} from "./components/research.js";
export type {
	Rival,
	RivalArchetype,
	RivalFocus,
	RivalsState,
} from "./components/rivals.js";
export { assertRivalsState, createRivalsState } from "./components/rivals.js";
export type { Team, TeamsState } from "./components/teams.js";
export { assertTeamsState, createTeamsState } from "./components/teams.js";
export type {
	TerminalReason,
	TerminalState,
	TerminalStatus,
} from "./components/terminal.js";
export {
	assertTerminalState,
	createTerminalState,
} from "./components/terminal.js";
export { assertGameState } from "./invariants.js";
export type {
	CommandKind,
	CommandLogEntry,
	CountersState,
	EngineResult,
	GameState,
	MetaState,
	QueueState,
	RngState,
	RngStreams,
	RunSetup,
	Warning,
	WarningCode,
	WarningSeverity,
} from "./state.js";
export { createInitialGameState, GAME_STATE_SCHEMA_VERSION } from "./state.js";
export type {
	GameSystem,
	SystemContext,
	SystemPhase,
	SystemResult,
} from "./systems/types.js";
