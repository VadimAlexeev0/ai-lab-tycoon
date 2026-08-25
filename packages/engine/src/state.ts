import { type CompanyState, createCompanyState } from "./components/company.js";
import { type ComputeState, createComputeState } from "./components/compute.js";
import type { PendingDecision } from "./components/decisions.js";
import {
	createDecisionsState,
	type DecisionsState,
} from "./components/decisions.js";
import { createFundingState, type FundingState } from "./components/funding.js";
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
import { createTeamsState, type TeamsState } from "./components/teams.js";
import {
	createTerminalState,
	type TerminalState,
} from "./components/terminal.js";

export const GAME_STATE_SCHEMA_VERSION = 1 as const;

export type MetaState = {
	schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
	runId: string;
	week: number;
	era: ResearchEra;
};

export type RngStreams = {
	training: number;
	incidents: number;
	products: number;
	rivals: number;
	funding: number;
};

export type RngState = {
	seed: number;
	streams: RngStreams;
};

export type CountersState = {
	team: number;
	project: number;
	model: number;
	product: number;
	rival: number;
	decision: number;
	report: number;
	command: number;
};

export type QueueState = {
	decisionIds: string[];
	reportIds: string[];
};

export type CommandKind = "start_run" | "apply_decision" | "advance_week";

export type CommandLogEntry = {
	id: string;
	kind: CommandKind;
	week: number;
};

export type WarningCode =
	| "cash_low"
	| "compute_shortage"
	| "trust_low"
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
	assertSeed(seed);

	return {
		meta: {
			schemaVersion: GAME_STATE_SCHEMA_VERSION,
			runId: `run_${seed}`,
			week: 1,
			era: "text",
		},
		rng: {
			seed,
			streams: {
				training: seed,
				incidents: seed,
				products: seed,
				rivals: seed,
				funding: seed,
			},
		},
		counters: {
			team: 1,
			project: 1,
			model: 1,
			product: 1,
			rival: 1,
			decision: 1,
			report: 1,
			command: 1,
		},
		company: createCompanyState(setup.companyName),
		teams: createTeamsState(),
		projects: createProjectsState(),
		compute: createComputeState(),
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
		commandLog: [],
		warnings: [],
		terminal: createTerminalState(),
	};
}

function assertSeed(seed: number): void {
	if (!Number.isInteger(seed) || seed < 0 || seed > 4_294_967_295) {
		throw new Error("Seed must be an unsigned 32-bit integer");
	}
}
