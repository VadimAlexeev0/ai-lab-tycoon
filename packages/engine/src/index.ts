import { advanceWeek } from "./advance-week.js";
import { applyDecision } from "./apply-decision.js";
import { assignProject, cancelProject } from "./commands/projects.js";
import { acquireData } from "./data-inventory.js";
import { runEvaluation } from "./evaluations.js";
import { designModel } from "./model-design.js";
import { launchProduct } from "./products.js";
import { refreshModel } from "./refresh-model.js";
import { startRun } from "./start-run.js";

export const ENGINE_PACKAGE_NAME = "@ai-lab-tycoon/engine";

export type { AdvanceWeekOptions } from "./advance-week.js";
export { buyCompute, hireTeam } from "./commands/teams.js";
export type {
	DataInventoryRecord,
	DataInventoryState,
} from "./components/data-inventory.js";
export type {
	CrisisChoice,
	CrisisKind,
	DecisionChoice,
	IncidentResponse,
	IncidentType,
	PendingDecision,
} from "./components/decisions.js";
export type { FundingGateFactors, FundingRound } from "./components/funding.js";
export type {
	DataAllocation,
	Model,
	ModelEstimateBand,
	ModelEstimates,
	ModelFoundation,
	ModelStatus,
	ModelTrueScores,
} from "./components/models.js";
export type {
	Product,
	ProductChannel,
	ProductStatus,
	ProductsState,
} from "./components/products.js";
export type { Fact } from "./components/reports.js";
export type {
	Crisis,
	RiskCrisis,
	RiskCrisisKind,
	RiskCrisisStatus,
	RiskMemory,
	RiskMemoryState,
	RiskState,
} from "./components/risk.js";
export type {
	DataModality,
	DataProvenance,
	DataSourceDefinition,
	DataSourceId,
	DataUsageRestriction,
} from "./data/data-sources.js";
export type {
	DataMix,
	ModelDimension,
	ModelEmphasis,
	ModelFamilyId,
	ModelTier,
} from "./data/model-families.js";
export type {
	ArchitectureFoundation,
	MultimodalArchitecturePath,
	MultimodalArchitecturePathDefinition,
} from "./data/multimodal-architectures.js";
export {
	assertMultimodalArchitecturePathDefinitions,
	deriveMultimodalArchitectureDebt,
	getMultimodalArchitecturePath,
	MULTIMODAL_ARCHITECTURE_PATH_IDS,
	MULTIMODAL_ARCHITECTURE_PATHS,
} from "./data/multimodal-architectures.js";
export type {
	ResearchEffect,
	ResearchEvaluationKind,
	ResearchSpark,
	ResearchSparkTrigger,
} from "./data/research.js";
export type { DataAcquisitionRequest } from "./data-inventory.js";
export { assertGameState, setAssertionsEnabled } from "./invariants.js";
export type {
	KnowledgeFreshnessStatus,
	KnowledgePressure,
} from "./knowledge-cutoff.js";
export type { GameStateUpgradeResult } from "./migrations.js";
export {
	deserializeGameState,
	deserializeGameStateWithMetadata,
	serializeGameState,
	upgradeGameState,
	upgradeGameStateWithMetadata,
} from "./migrations.js";
export type { ModelDesignSpec } from "./model-design.js";
export type { ProductLaunchRequest } from "./products.js";
export {
	applyProductResume,
	retireProduct,
} from "./products.js";
export type { ModelRefreshRequest } from "./refresh-model.js";
export type {
	CommandLogEnvelope,
	ReplayCommandLogInput,
	ReplayCommandLogOptions,
} from "./replay.js";
export { replayCommandLog } from "./replay.js";
export type { ActiveResearchEffects } from "./research-effects.js";
export type {
	NextObjective,
	ResourceBarSummary,
	TeamStatus,
	TerminalObjective,
	VisibleAvailableProject,
	VisibleDataInventoryRecord,
	VisibleEstimateBand,
	VisibleFundingSummary,
	VisibleGameState,
	VisibleModelEstimate,
	VisiblePendingDecision,
	VisibleProductSummary,
	VisibleReport,
	VisibleResearchNode,
	VisibleResearchParadigm,
	VisibleResearchSpark,
	VisibleRival,
	VisibleTeam,
	VisibleTerminalProjection,
} from "./selectors.js";
export {
	selectAvailableProjects,
	selectDataInventory,
	selectFunding,
	selectNextObjective,
	selectPendingDecisions,
	selectProducts,
	selectRecentReports,
	selectResearchNodes,
	selectResearchParadigm,
	selectResourceBar,
	selectRivals,
	selectTeams,
	selectTerminalObjective,
	selectTerminalProjection,
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
export { fundingFactors } from "./systems/funding.js";
export {
	acquireData,
	advanceWeek,
	applyDecision,
	assignProject,
	cancelProject,
	designModel,
	launchProduct,
	refreshModel,
	runEvaluation,
	startRun,
};
