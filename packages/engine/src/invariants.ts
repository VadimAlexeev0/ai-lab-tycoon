import { assertCompanyState } from "./components/company.js";
import { assertComputeState } from "./components/compute.js";
import {
	assertDecisionChoice,
	assertDecisionsState,
} from "./components/decisions.js";
import { assertFundingState } from "./components/funding.js";
import { assertModelsState } from "./components/models.js";
import { assertProductsState } from "./components/products.js";
import { assertProjectsState, type Project } from "./components/projects.js";
import { assertReportsState } from "./components/reports.js";
import { assertResearchState } from "./components/research.js";
import { assertRivalsState } from "./components/rivals.js";
import { assertRngState } from "./components/rng.js";
import { assertTeamsState } from "./components/teams.js";
import { assertTerminalState } from "./components/terminal.js";
import {
	assertRunSetup,
	GAME_STATE_SCHEMA_VERSION,
	type GameState,
	type Warning,
} from "./state.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertJsonCompatible,
	assertObject,
	assertPositiveInteger,
	assertUnsignedInteger,
} from "./validation.js";

const RESEARCH_ERAS = ["text", "assistant", "multimodal"] as const;
const COMMAND_KINDS = ["start_run", "apply_decision", "advance_week"] as const;
const WARNING_CODES = [
	"cash_low",
	"compute_shortage",
	"trust_low",
	"blocking_decision",
] as const;
const WARNING_SEVERITIES = ["info", "warning", "critical"] as const;
const GAME_STATE_KEYS = [
	"meta",
	"rng",
	"counters",
	"company",
	"teams",
	"projects",
	"compute",
	"research",
	"models",
	"products",
	"rivals",
	"funding",
	"decisions",
	"reports",
	"queue",
	"commandLog",
	"warnings",
	"terminal",
] as const;

export function assertGameState(value: unknown): asserts value is GameState {
	assertJsonCompatible(value);
	assertExactObject(value, GAME_STATE_KEYS, "game state");

	assertMeta(value.meta, value.research);
	assertRngState(value.rng);
	assertCounters(value.counters);
	assertCompanyState(value.company);
	assertTeamsState(value.teams);
	assertProjectsState(value.projects);
	assertComputeState(value.compute);
	assertResearchState(value.research);
	assertModelsState(value.models);
	assertProductsState(value.products);
	assertRivalsState(value.rivals);
	assertFundingState(value.funding);
	assertDecisionsState(value.decisions);
	assertReportsState(value.reports);
	assertTerminalState(value.terminal);
	assertQueueShape(value.queue);
	assertCommandLog(value.commandLog, value.meta);
	assertWarnings(value.warnings);

	const state = value as unknown as GameState;
	assertUniqueStateIds(state);
	assertComponentOwnership(state);
	assertQueueConsistency(state);
}

function assertMeta(value: unknown, research: unknown): void {
	assertExactObject(value, ["schemaVersion", "runId", "week", "era"], "meta");
	if (value.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
		throw new Error("Unsupported game state schema version");
	}
	assertIdentifier(value.runId, "Run id");
	assertPositiveInteger(value.week, "Meta week");
	assertEnum(value.era, RESEARCH_ERAS, "Meta era");
	assertExactObject(research, ["currentEra", "nodes"], "research");
	if (research.currentEra !== value.era) {
		throw new Error("Meta era must match the research component era");
	}
}

function assertCounters(value: unknown): void {
	const keys = [
		"team",
		"project",
		"model",
		"product",
		"rival",
		"decision",
		"report",
		"command",
	] as const;
	assertExactObject(value, keys, "counters");
	for (const key of keys) {
		assertPositiveInteger(value[key], `Counter ${key}`);
	}
}

function assertQueueShape(value: unknown): void {
	assertExactObject(value, ["decisionIds", "reportIds"], "queue");
	assertArray(value.decisionIds, "Decision queue");
	assertArray(value.reportIds, "Report queue");
	assertUniqueReferences(value.decisionIds, "decision queue");
	assertUniqueReferences(value.reportIds, "report queue");
}

function assertUniqueStateIds(state: GameState): void {
	const ids = new Set<string>();
	const allIds = [
		...state.teams.items.map((team) => team.id),
		...state.projects.items.map((project) => project.id),
		...state.research.nodes.map((node) => node.id),
		...state.models.items.map((model) => model.id),
		...state.products.items.map((product) => product.id),
		...state.rivals.items.map((rival) => rival.id),
		...state.decisions.pending.map((decision) => decision.id),
		...state.reports.items.map((report) => report.id),
		...state.commandLog.map((entry) => entry.id),
	];
	for (const id of allIds) {
		if (ids.has(id)) {
			throw new Error(`Duplicate state id: ${id}`);
		}
		ids.add(id);
	}
}

function assertComponentOwnership(state: GameState): void {
	for (const team of state.teams.items) {
		if (team.activeProjectId === null) {
			continue;
		}
		const project = state.projects.items.find(
			(item) => item.id === team.activeProjectId,
		);
		if (project === undefined) {
			throw new Error(`Team ${team.id} references an unknown active project`);
		}
		if (project.teamId !== team.id || project.status !== "active") {
			throw new Error(`Team ${team.id} does not own its active project`);
		}
	}

	for (const project of state.projects.items) {
		if (project.teamId !== null) {
			const team = state.teams.items.find((item) => item.id === project.teamId);
			if (team === undefined) {
				throw new Error(`Project ${project.id} references an unknown team`);
			}
			if (project.status === "active" && team.activeProjectId !== project.id) {
				throw new Error(
					`Active project ${project.id} is not owned by its team`,
				);
			}
			if (project.status !== "active" && team.activeProjectId === project.id) {
				throw new Error(
					`Non-active project ${project.id} cannot remain its team's active project`,
				);
			}
		}

		if (isModelRelatedProject(project)) {
			const model = state.models.items.find(
				(item) => item.id === project.modelId,
			);
			if (model === undefined) {
				throw new Error(`Project ${project.id} references an unknown model`);
			}
			if (project.status === "active" && model.projectId !== project.id) {
				throw new Error(
					`Active model project ${project.id} must be reciprocal with its model`,
				);
			}
		}
	}

	for (const model of state.models.items) {
		if (model.projectId === null) {
			continue;
		}
		const project = state.projects.items.find(
			(item) => item.id === model.projectId,
		);
		if (project === undefined) {
			throw new Error(`Model ${model.id} references an unknown project`);
		}
		if (!isModelRelatedProject(project)) {
			throw new Error(
				`Model ${model.id} project must be a compatible model-related project`,
			);
		}
		if (project.modelId !== model.id || project.status !== "active") {
			throw new Error(
				`Model ${model.id} project ownership must be reciprocal and active`,
			);
		}
	}

	for (const product of state.products.items) {
		if (!state.models.items.some((model) => model.id === product.modelId)) {
			throw new Error(`Product ${product.id} references an unknown model`);
		}
	}

	for (const decision of state.decisions.pending) {
		if (
			(decision.kind === "launch" || decision.kind === "evaluation") &&
			!state.models.items.some((model) => model.id === decision.modelId)
		) {
			throw new Error(`Decision ${decision.id} references an unknown model`);
		}
	}
}

function isModelRelatedProject(
	project: Project,
): project is Extract<Project, { modelId: string }> {
	return (
		project.kind === "model" ||
		project.kind === "training" ||
		project.kind === "evaluation" ||
		project.kind === "product"
	);
}

function assertQueueConsistency(state: GameState): void {
	for (const decision of state.decisions.pending) {
		const occurrences = state.queue.decisionIds.filter(
			(id) => id === decision.id,
		).length;
		if (occurrences !== 1) {
			throw new Error(
				`Decision ${decision.id} must appear exactly once in the decision queue`,
			);
		}
	}
	for (const decisionId of state.queue.decisionIds) {
		if (
			!state.decisions.pending.some((decision) => decision.id === decisionId)
		) {
			throw new Error(
				`Decision queue references an unknown or resolved decision: ${decisionId}`,
			);
		}
	}

	for (const report of state.reports.items) {
		const occurrences = state.queue.reportIds.filter(
			(id) => id === report.id,
		).length;
		const expected = report.acknowledged ? 0 : 1;
		if (occurrences !== expected) {
			throw new Error(
				`Report ${report.id} must appear ${expected} time(s) in the report queue`,
			);
		}
	}
	for (const reportId of state.queue.reportIds) {
		const report = state.reports.items.find((item) => item.id === reportId);
		if (report === undefined) {
			throw new Error(`Report queue references an unknown report: ${reportId}`);
		}
		if (report.acknowledged) {
			throw new Error(
				`Acknowledged report ${reportId} cannot be in the report queue`,
			);
		}
	}
}

function assertCommandLog(value: unknown, meta: unknown): void {
	assertArray(value, "Command log");
	assertExactObject(meta, ["schemaVersion", "runId", "week", "era"], "meta");
	assertPositiveInteger(meta.week, "Meta week");
	for (const item of value) {
		assertObject(item, "command log entry");
		assertEnum(item.kind, COMMAND_KINDS, "Command log kind");
		assertIdentifier(item.id, "Command id");
		assertPositiveInteger(item.week, "Command week");
		if (item.week > meta.week) {
			throw new Error(`Command ${item.id} cannot be from a future week`);
		}

		switch (item.kind) {
			case "start_run":
				assertExactObject(
					item,
					["id", "kind", "week", "setup", "seed"],
					"start_run command",
				);
				assertRunSetup(item.setup);
				assertUnsignedInteger(item.seed, "Start command seed");
				break;
			case "apply_decision":
				assertExactObject(
					item,
					["id", "kind", "week", "choice"],
					"apply_decision command",
				);
				assertDecisionChoice(item.choice);
				break;
			case "advance_week":
				assertExactObject(item, ["id", "kind", "week"], "advance_week command");
				break;
		}
	}
}

function assertWarnings(value: unknown): asserts value is Warning[] {
	assertArray(value, "Warnings");
	for (const item of value) {
		assertExactObject(item, ["code", "severity"], "warning");
		assertEnum(item.code, WARNING_CODES, "Warning code");
		assertEnum(item.severity, WARNING_SEVERITIES, "Warning severity");
	}
}

function assertUniqueReferences(values: unknown[], name: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		assertIdentifier(value, `${name} id`);
		if (seen.has(value)) {
			throw new Error(`Duplicate ${name} reference: ${value}`);
		}
		seen.add(value);
	}
}
