import { assertCompanyState } from "./components/company.js";
import { assertComputeState } from "./components/compute.js";
import { assertDecisionsState } from "./components/decisions.js";
import { assertFundingState } from "./components/funding.js";
import { assertModelsState } from "./components/models.js";
import { assertProductsState } from "./components/products.js";
import { assertProjectsState } from "./components/projects.js";
import { assertReportsState } from "./components/reports.js";
import { assertResearchState } from "./components/research.js";
import { assertRivalsState } from "./components/rivals.js";
import { assertTeamsState } from "./components/teams.js";
import { assertTerminalState } from "./components/terminal.js";
import {
	GAME_STATE_SCHEMA_VERSION,
	type GameState,
	type Warning,
} from "./state.js";

export function assertGameState(state: GameState): asserts state is GameState {
	assertJsonCompatible(state);
	assertMeta(state);
	assertRng(state);
	assertCounters(state);

	assertCompanyState(state.company);
	assertTeamsState(state.teams);
	assertProjectsState(state.projects);
	assertComputeState(state.compute);
	assertResearchState(state.research);
	assertModelsState(state.models);
	assertProductsState(state.products);
	assertRivalsState(state.rivals);
	assertFundingState(state.funding);
	assertDecisionsState(state.decisions);
	assertReportsState(state.reports);
	assertTerminalState(state.terminal);

	assertUniqueStateIds(state);
	assertComponentOwnership(state);
	assertQueue(state);
	assertCommandLog(state);
	assertWarnings(state.warnings);
}

function assertMeta(state: GameState): void {
	if (state.meta.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
		throw new Error("Unsupported game state schema version");
	}
	assertIdentifier(state.meta.runId, "run id");
	assertPositiveInteger(state.meta.week, "week");
	assertResearchEra(state.meta.era);
	if (state.research.currentEra !== state.meta.era) {
		throw new Error("Meta era must match the research component era");
	}
}

function assertRng(state: GameState): void {
	assertUnsignedInteger(state.rng.seed, "rng seed");
	assertUnsignedInteger(state.rng.streams.training, "training rng stream");
	assertUnsignedInteger(state.rng.streams.incidents, "incidents rng stream");
	assertUnsignedInteger(state.rng.streams.products, "products rng stream");
	assertUnsignedInteger(state.rng.streams.rivals, "rivals rng stream");
	assertUnsignedInteger(state.rng.streams.funding, "funding rng stream");
}

function assertCounters(state: GameState): void {
	for (const [name, value] of Object.entries(state.counters)) {
		assertPositiveInteger(value, `${name} counter`);
	}
}

function assertUniqueStateIds(state: GameState): void {
	const ids: string[] = [];

	for (const id of [
		...state.teams.items.map((team) => team.id),
		...state.projects.items.map((project) => project.id),
		...state.research.nodes.map((node) => node.id),
		...state.models.items.map((model) => model.id),
		...state.products.items.map((product) => product.id),
		...state.rivals.items.map((rival) => rival.id),
		...state.decisions.pending.map((decision) => decision.id),
		...state.reports.items.map((report) => report.id),
		...state.commandLog.map((entry) => entry.id),
	]) {
		if (ids.includes(id)) {
			throw new Error(`Duplicate state id: ${id}`);
		}
		ids.push(id);
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
		}

		if (project.kind !== "research" && project.kind !== "infrastructure") {
			const model = state.models.items.find(
				(item) => item.id === project.modelId,
			);
			if (model === undefined) {
				throw new Error(`Project ${project.id} references an unknown model`);
			}
		}
	}

	for (const model of state.models.items) {
		if (
			model.projectId !== null &&
			!state.projects.items.some((project) => project.id === model.projectId)
		) {
			throw new Error(`Model ${model.id} references an unknown project`);
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

function assertQueue(state: GameState): void {
	assertUniqueReferences(state.queue.decisionIds, "decision queue");
	assertUniqueReferences(state.queue.reportIds, "report queue");

	for (const decisionId of state.queue.decisionIds) {
		if (
			!state.decisions.pending.some((decision) => decision.id === decisionId)
		) {
			throw new Error(
				`Decision queue references an unknown decision: ${decisionId}`,
			);
		}
	}
	for (const reportId of state.queue.reportIds) {
		if (!state.reports.items.some((report) => report.id === reportId)) {
			throw new Error(`Report queue references an unknown report: ${reportId}`);
		}
	}
}

function assertCommandLog(state: GameState): void {
	for (const entry of state.commandLog) {
		assertIdentifier(entry.id, "command id");
		assertPositiveInteger(entry.week, "command week");
		if (entry.week > state.meta.week) {
			throw new Error(`Command ${entry.id} cannot be from a future week`);
		}
	}
}

function assertWarnings(warnings: Warning[]): void {
	for (const warning of warnings) {
		if (
			warning.code.trim().length === 0 ||
			warning.severity.trim().length === 0
		) {
			throw new Error("Warnings must have a code and severity");
		}
	}
}

function assertJsonCompatible(value: unknown, path = "state"): void {
	if (
		value === undefined ||
		typeof value === "function" ||
		typeof value === "symbol" ||
		typeof value === "bigint"
	) {
		throw new Error(`${path} contains a non-JSON value`);
	}
	if (typeof value === "number" && !Number.isFinite(value)) {
		throw new Error(`${path} contains a non-finite number`);
	}
	if (value === null || typeof value !== "object") {
		return;
	}
	const prototype = Object.getPrototypeOf(value);
	if (
		(Array.isArray(value) && prototype !== Array.prototype) ||
		(!Array.isArray(value) && prototype !== Object.prototype)
	) {
		throw new Error(`${path} must contain plain objects only`);
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertJsonCompatible(item, `${path}[${index}]`);
		}
		return;
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new Error(`${path} must not contain symbol keys`);
		}
		assertJsonCompatible(value[key as keyof typeof value], `${path}.${key}`);
	}
}

function assertResearchEra(value: string): void {
	if (value !== "text" && value !== "assistant" && value !== "multimodal") {
		throw new Error(`Unsupported research era: ${value}`);
	}
}

function assertUniqueReferences(values: string[], name: string): void {
	const seen: string[] = [];
	for (const value of values) {
		assertIdentifier(value, `${name} id`);
		if (seen.includes(value)) {
			throw new Error(`Duplicate ${name} reference: ${value}`);
		}
		seen.push(value);
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer`);
	}
}

function assertUnsignedInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) {
		throw new Error(`${name} must be an unsigned 32-bit integer`);
	}
}
