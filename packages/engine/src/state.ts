import { type CompanyState, createCompanyState } from "./components/company.js";
import { type ComputeState, createComputeState } from "./components/compute.js";
import {
	createDataInventoryState,
	type DataInventoryState,
} from "./components/data-inventory.js";
import type {
	DecisionChoice,
	PendingDecision,
} from "./components/decisions.js";
import {
	createDecisionsState,
	type DecisionsState,
} from "./components/decisions.js";
import { createFundingState, type FundingState } from "./components/funding.js";
import type { ModelFoundation } from "./components/models.js";
import { createModelsState, type ModelsState } from "./components/models.js";
import {
	createProductsState,
	type ProductsState,
} from "./components/products.js";
import {
	createProjectsState,
	type ProjectsState,
} from "./components/projects.js";
import type { Fact } from "./components/reports.js";
import { createReportsState, type ReportsState } from "./components/reports.js";
import {
	createResearchState,
	type ResearchEra,
	type ResearchState,
} from "./components/research.js";
import { createRivalsState, type RivalsState } from "./components/rivals.js";
import { createRngState, type RngState } from "./components/rng.js";
import { createTeamsState, type TeamsState } from "./components/teams.js";
import {
	createTerminalState,
	type TerminalState,
} from "./components/terminal.js";
import type {
	DataMix,
	ModelEmphasis,
	ModelFamilyId,
	ModelTier,
} from "./data/model-families.js";
import { assertGameState } from "./invariants.js";
import {
	assertExactObject,
	assertString,
	assertUnsignedInteger,
} from "./validation.js";

export const GAME_STATE_SCHEMA_VERSION = 6 as const;

export type MetaState = {
	schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
	runId: string;
	week: number;
	era: ResearchEra;
};

export type CountersState = {
	team: number;
	project: number;
	model: number;
	product: number;
	rival: number;
	data: number;
	decision: number;
	report: number;
	command: number;
};

export type QueueState = {
	decisionIds: string[];
	reportIds: string[];
};

export type CommandKind =
	| "start_run"
	| "apply_decision"
	| "advance_week"
	| "assign_project"
	| "cancel_project"
	| "design_model"
	| "refresh_model"
	| "run_evaluation"
	| "launch_product"
	| "acquire_data"
	| "buy_compute"
	| "hire_team"
	| "product_resume";

type CommandLogBase = {
	id: string;
	week: number;
};

export type CommandLogEntry =
	| (CommandLogBase & {
			kind: "start_run";
			setup: RunSetup;
			seed: number;
	  })
	| (CommandLogBase & {
			kind: "apply_decision";
			choice: DecisionChoice;
	  })
	| (CommandLogBase & {
			kind: "advance_week";
			incidentRolls?: readonly number[];
			incidentRoll?: number;
	  })
	| (CommandLogBase & {
			kind: "assign_project";
			teamId: string;
			projectId: string;
	  })
	| (CommandLogBase & {
			kind: "cancel_project";
			teamId: string;
			projectId: string;
	  })
	| (CommandLogBase & {
			kind: "design_model";
			modelId: string;
			projectId: string;
			teamId: string;
			name: string;
			family: ModelFamilyId;
			foundation: ModelFoundation;
			parentModelId: string | null;
			tier: ModelTier;
			dataMix: DataMix;
			emphasis: ModelEmphasis;
	  })
	| (CommandLogBase & {
			kind: "refresh_model";
			modelId: string;
			projectId: string;
			teamId: string;
			dataMix: DataMix;
	  })
	| (CommandLogBase & {
			kind: "run_evaluation";
			modelId: string;
			evaluation: "capability" | "safety_reliability";
	  })
	| (CommandLogBase & {
			kind: "launch_product";
			productId: string;
			modelId: string;
			channel: "chat" | "developer_api" | "enterprise";
	  })
	| (CommandLogBase & {
			kind: "acquire_data";
			dataId: string;
			sourceId: string;
			productId: string | null;
	  })
	| (CommandLogBase & {
			kind: "buy_compute";
			amount: number;
	  })
	| (CommandLogBase & {
			kind: "hire_team";
			name: string;
	  })
	| (CommandLogBase & {
			kind: "product_resume";
			productId: string;
	  });

export type WarningCode =
	| "cash_low"
	| "compute_shortage"
	| "trust_low"
	| "stale_data"
	| "stale_model"
	| "blocking_decision";
export type WarningSeverity = "info" | "warning" | "critical";

export type Warning = {
	code: WarningCode;
	severity: WarningSeverity;
};

export type RunSetup = {
	companyName: string;
};

export type GameState = {
	meta: MetaState;
	rng: RngState;
	counters: CountersState;
	company: CompanyState;
	teams: TeamsState;
	projects: ProjectsState;
	compute: ComputeState;
	dataInventory: DataInventoryState;
	research: ResearchState;
	models: ModelsState;
	products: ProductsState;
	rivals: RivalsState;
	funding: FundingState;
	decisions: DecisionsState;
	reports: ReportsState;
	queue: QueueState;
	commandLog: CommandLogEntry[];
	warnings: Warning[];
	terminal: TerminalState;
};

export type EngineResult = {
	state: GameState;
	facts: Fact[];
	pending: PendingDecision[];
};

export function createInitialGameState(
	setup: RunSetup,
	seed: number,
): GameState {
	assertRunSetup(setup);
	assertUnsignedInteger(seed, "Seed");

	const state: GameState = {
		meta: {
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			runId: `run_${seed}`,
			week: 1,
			era: "text",
		},
		rng: createRngState(seed),
		counters: {
			team: 1,
			project: 1,
			model: 1,
			product: 1,
			rival: 1,
			data: 1,
			decision: 1,
			report: 1,
			command: 2,
		},
		company: createCompanyState(setup.companyName),
		teams: createTeamsState(),
		projects: createProjectsState(),
		compute: createComputeState(),
		dataInventory: createDataInventoryState(),
		research: createResearchState("text"),
		models: createModelsState(),
		products: createProductsState(),
		rivals: createRivalsState(),
		funding: createFundingState(),
		decisions: createDecisionsState(),
		reports: createReportsState(),
		queue: {
			decisionIds: [],
			reportIds: [],
		},
		commandLog: [
			{
				id: "command_001",
				kind: "start_run",
				week: 1,
				setup: { companyName: setup.companyName },
				seed,
			},
		],
		warnings: [],
		terminal: createTerminalState(),
	};

	assertGameState(state);
	return state;
}

export function assertRunSetup(value: unknown): asserts value is RunSetup {
	assertExactObject(value, ["companyName"], "run setup");
	assertString(value.companyName, "Run setup company name");
	if (value.companyName.trim().length === 0) {
		throw new Error("Run setup company name must not be empty");
	}
}

export type { RngState, RngStreams } from "./components/rng.js";
