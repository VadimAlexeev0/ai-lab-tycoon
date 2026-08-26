import { advanceWeek } from "./advance-week.js";
import { applyDecision } from "./apply-decision.js";
import { assignProject, cancelProject } from "./commands/projects.js";
import { runEvaluation } from "./evaluations.js";
import { designModel } from "./model-design.js";
import { launchProduct } from "./products.js";
import { startRun } from "./start-run.js";

export const ENGINE_PACKAGE_NAME = "@ai-lab-tycoon/engine";

export type { AdvanceWeekOptions } from "./advance-week.js";
export type {
	DecisionChoice,
	PendingDecision,
} from "./components/decisions.js";
export type { FundingGateFactors, FundingRound } from "./components/funding.js";
export type {
	Model,
	ModelEstimateBand,
	ModelEstimates,
	ModelFoundation,
	ModelStatus,
	ModelTrueScores,
} from "./components/models.js";
export type { ProductChannel } from "./components/products.js";
export type { Fact } from "./components/reports.js";
export type {
	DataMix,
	ModelDimension,
	ModelEmphasis,
	ModelFamilyId,
	ModelTier,
} from "./data/model-families.js";
export { assertGameState } from "./invariants.js";
export type { ModelDesignSpec } from "./model-design.js";
export type {
	NextObjective,
	ResourceBarSummary,
	TeamStatus,
	VisibleAvailableProject,
	VisibleEstimateBand,
	VisibleGameState,
	VisibleModelEstimate,
	VisibleRival,
	VisibleTeam,
} from "./selectors.js";
export {
	selectAvailableProjects,
	selectNextObjective,
	selectResourceBar,
	selectRivals,
	selectTeams,
	selectVisibleModels,
	selectVisibleState,
} from "./selectors.js";
export type {
	CommandKind,
	CommandLogEntry,
	EngineResult,
	GameState,
	RunSetup,
} from "./state.js";
export { GAME_STATE_SCHEMA_VERSION } from "./state.js";
export {
	advanceWeek,
	applyDecision,
	assignProject,
	cancelProject,
	designModel,
	launchProduct,
	runEvaluation,
	startRun,
};
