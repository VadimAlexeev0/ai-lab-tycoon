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
import { BALANCE } from "./data/balance.js";
import {
	DATA_MIX_DIMENSIONS,
	MODEL_EMPHASIS_DIMENSIONS,
	MODEL_FAMILY_IDS,
	MODEL_TIERS,
} from "./data/model-families.js";
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
	assertInteger,
	assertJsonCompatible,
	assertNonNegativeInteger,
	assertNullableString,
	assertObject,
	assertPositiveInteger,
	assertString,
	assertUnsignedInteger,
} from "./validation.js";

const RESEARCH_ERAS = ["text", "assistant", "multimodal"] as const;
const COMMAND_KINDS = [
	"start_run",
	"apply_decision",
	"advance_week",
	"assign_project",
	"cancel_project",
	"design_model",
	"run_evaluation",
	"launch_product",
] as const;
const MODEL_FOUNDATIONS = ["fresh", "continued", "distilled"] as const;
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

export type GameStateValidationOptions = Readonly<{
	/** Permit a negative cash balance while a weekly loss is being finalized. */
	allowNegativeCash?: boolean;
}>;

export function assertGameState(
	value: unknown,
	options: GameStateValidationOptions = {},
): asserts value is GameState {
	assertJsonCompatible(value);
	assertExactObject(value, GAME_STATE_KEYS, "game state");

	const state = value as unknown as GameState;
	assertMeta(state.meta, state.research);
	assertRngState(state.rng);
	assertCounters(state.counters);
	assertCompanyState(
		state.company,
		options.allowNegativeCash === true ||
			(state.terminal.status === "lost" &&
				state.terminal.reason === "cash_depleted"),
	);
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
	assertQueueShape(state.queue);
	assertCommandLog(state.commandLog, state);
	assertWarnings(state.warnings);

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

function assertCommandLog(
	value: unknown,
	state: Pick<
		GameState,
		"meta" | "rng" | "company" | "models" | "projects" | "teams" | "products"
	>,
): void {
	assertArray(value, "Command log");
	if (value.length === 0) {
		throw new Error("Command log must be non-empty");
	}

	assertPositiveInteger(state.meta.week, "Meta week");
	let previousWeek: number | undefined;
	let startRunSeen = false;
	for (const [index, item] of value.entries()) {
		assertObject(item, "command log entry");
		assertEnum(item.kind, COMMAND_KINDS, "Command log kind");
		assertIdentifier(item.id, "Command id");
		assertPositiveInteger(item.week, "Command week");
		if (item.week > state.meta.week) {
			throw new Error(`Command ${item.id} cannot be from a future week`);
		}
		if (previousWeek !== undefined && item.week < previousWeek) {
			throw new Error("Command weeks must be non-decreasing");
		}
		previousWeek = item.week;

		switch (item.kind) {
			case "start_run":
				if (startRunSeen) {
					throw new Error("Only one start_run command is allowed");
				}
				if (index !== 0) {
					throw new Error("start_run command must be the first command");
				}
				if (item.week !== 1) {
					throw new Error("start_run command must be from week 1");
				}
				startRunSeen = true;
				assertExactObject(
					item,
					["id", "kind", "week", "setup", "seed"],
					"start_run command",
				);
				assertRunSetup(item.setup);
				assertUnsignedInteger(item.seed, "Start command seed");
				if (item.seed !== state.rng.seed) {
					throw new Error("Start command seed must match the state RNG seed");
				}
				if (item.setup.companyName !== state.company.name) {
					throw new Error(
						"Start command setup company name must match the company name",
					);
				}
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
				assertAdvanceWeekCommand(item);
				break;
			case "assign_project":
			case "cancel_project":
				assertExactObject(
					item,
					["id", "kind", "week", "teamId", "projectId"],
					`${item.kind} command`,
				);
				assertIdentifier(item.teamId, `${item.kind} team id`);
				assertIdentifier(item.projectId, `${item.kind} project id`);
				break;
			case "design_model":
				assertExactObject(
					item,
					[
						"id",
						"kind",
						"week",
						"modelId",
						"projectId",
						"teamId",
						"name",
						"family",
						"foundation",
						"parentModelId",
						"tier",
						"dataMix",
						"emphasis",
					],
					"design_model command",
				);
				assertIdentifier(item.modelId, "Design model id");
				assertIdentifier(item.projectId, "Design project id");
				assertIdentifier(item.teamId, "Design team id");
				assertString(item.name, "Design model name");
				if (item.name.trim().length === 0) {
					throw new Error("Design model name must not be empty");
				}
				assertEnum(item.family, MODEL_FAMILY_IDS, "Design model family");
				assertEnum(
					item.foundation,
					MODEL_FOUNDATIONS,
					"Design model foundation",
				);
				assertNullableString(item.parentModelId, "Design parent model id");
				if (item.parentModelId !== null) {
					assertIdentifier(item.parentModelId, "Design parent model id");
				}
				assertEnum(item.tier, MODEL_TIERS, "Design model compute tier");
				assertDesignMix(item.dataMix);
				assertDesignEmphasis(item.emphasis);
				assertDesignCommandReferences(item, state);
				break;
			case "run_evaluation": {
				assertExactObject(
					item,
					["id", "kind", "week", "modelId", "evaluation"],
					"run_evaluation command",
				);
				assertIdentifier(item.modelId, "Evaluation command model id");
				assertEnum(
					item.evaluation,
					["capability", "safety_reliability"],
					"Evaluation command kind",
				);
				const evaluationModel = state.models.items.find(
					(model) => model.id === item.modelId,
				);
				if (evaluationModel === undefined) {
					throw new Error(
						`Evaluation command references an unknown model: ${String(item.modelId)}`,
					);
				}
				if (
					(evaluationModel.status !== "ready" &&
						evaluationModel.status !== "launched") ||
					evaluationModel.trueScores === undefined ||
					evaluationModel.estimates === undefined
				) {
					throw new Error(
						`Evaluation command references a non-eligible model: ${String(item.modelId)}`,
					);
				}
				break;
			}
			case "launch_product": {
				assertExactObject(
					item,
					["id", "kind", "week", "productId", "modelId", "channel"],
					"launch_product command",
				);
				assertIdentifier(item.productId, "Launch command product id");
				assertIdentifier(item.modelId, "Launch command model id");
				assertEnum(
					item.channel,
					["chat", "developer_api", "enterprise"],
					"Launch command channel",
				);
				const launchModel = state.models.items.find(
					(model) => model.id === item.modelId,
				);
				if (launchModel === undefined) {
					throw new Error(
						`Launch command references an unknown model: ${String(item.modelId)}`,
					);
				}
				const launchProduct = state.products.items.find(
					(product) => product.id === item.productId,
				);
				if (launchProduct === undefined) {
					throw new Error(
						`Launch command references an unknown product: ${String(item.productId)}`,
					);
				}
				if (
					launchProduct.modelId !== launchModel.id ||
					launchProduct.channel !== item.channel
				) {
					throw new Error(
						`Launch command product ${launchProduct.id} does not match its model or channel`,
					);
				}
				break;
			}
		}
	}

	if (!startRunSeen) {
		throw new Error("Command log must start with a start_run command");
	}
}

function assertAdvanceWeekCommand(command: Record<string, unknown>): void {
	const keys = ["id", "kind", "week"];
	if (Object.hasOwn(command, "incidentRolls")) keys.push("incidentRolls");
	if (Object.hasOwn(command, "incidentRoll")) keys.push("incidentRoll");
	assertExactObject(command, keys, "advance_week command");
	if (Object.hasOwn(command, "incidentRolls")) {
		assertArray(command.incidentRolls, "Advance incident rolls");
		for (const roll of command.incidentRolls) {
			assertInteger(roll, "Advance incident roll");
			if (roll < 0 || roll > 99) {
				throw new Error("Advance incident rolls must be between 0 and 99");
			}
		}
	}
	if (Object.hasOwn(command, "incidentRoll")) {
		assertInteger(command.incidentRoll, "Advance incident roll");
		if (command.incidentRoll < 0 || command.incidentRoll > 99) {
			throw new Error("Advance incident roll must be between 0 and 99");
		}
	}
}

function assertDesignCommandReferences(
	command: Record<string, unknown>,
	state: Pick<GameState, "models" | "projects" | "teams">,
): void {
	const model = state.models.items.find((item) => item.id === command.modelId);
	if (model === undefined) {
		throw new Error(
			`Design model command references an unknown model: ${String(command.modelId)}`,
		);
	}
	const project = state.projects.items.find(
		(item) => item.id === command.projectId,
	);
	if (project === undefined) {
		throw new Error(
			`Design model command references an unknown project: ${String(command.projectId)}`,
		);
	}
	const team = state.teams.items.find((item) => item.id === command.teamId);
	if (team === undefined) {
		throw new Error(
			`Design model command references an unknown team: ${String(command.teamId)}`,
		);
	}
	if (project.kind !== "training" || project.modelId !== model.id) {
		throw new Error(
			`Design model command project ${project.id} must be the model's training project`,
		);
	}
	if (
		project.status === "active" &&
		(project.teamId !== team.id || team.activeProjectId !== project.id)
	) {
		throw new Error(
			`Active design model project ${project.id} must be owned by its logged team`,
		);
	}
	if (
		model.name !== command.name ||
		model.family !== command.family ||
		model.foundation !== command.foundation ||
		model.parentModelId !== command.parentModelId ||
		model.tier !== command.tier ||
		!matchesDesignMix(model.dataMix, command.dataMix) ||
		!matchesDesignEmphasis(model.emphasis, command.emphasis)
	) {
		throw new Error(
			`Design model command payload does not match model ${model.id}`,
		);
	}
}

function matchesDesignMix(
	modelMix: GameState["models"]["items"][number]["dataMix"],
	commandMix: unknown,
): boolean {
	if (
		modelMix === undefined ||
		commandMix === null ||
		typeof commandMix !== "object"
	) {
		return false;
	}
	const mix = commandMix as Record<string, unknown>;
	return DATA_MIX_DIMENSIONS.every(
		(dimension) => modelMix[dimension] === mix[dimension],
	);
}

function matchesDesignEmphasis(
	modelEmphasis: GameState["models"]["items"][number]["emphasis"],
	commandEmphasis: unknown,
): boolean {
	if (
		modelEmphasis === undefined ||
		commandEmphasis === null ||
		typeof commandEmphasis !== "object"
	) {
		return false;
	}
	const emphasis = commandEmphasis as Record<string, unknown>;
	return MODEL_EMPHASIS_DIMENSIONS.every(
		(dimension) => modelEmphasis[dimension] === emphasis[dimension],
	);
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

function assertDesignMix(value: unknown): void {
	assertExactObject(value, DATA_MIX_DIMENSIONS, "Design model data mix");
	for (const dimension of DATA_MIX_DIMENSIONS) {
		assertNonNegativeInteger(
			value[dimension],
			`Design model data mix ${dimension}`,
		);
	}
	const dataMix = value as {
		general: number;
		code: number;
		multimodal: number;
	};
	if (dataMix.general + dataMix.code + dataMix.multimodal !== 100) {
		throw new Error("Design model data mix must total exactly 100");
	}
}

function assertDesignEmphasis(value: unknown): void {
	assertExactObject(value, MODEL_EMPHASIS_DIMENSIONS, "Design model emphasis");
	for (const dimension of MODEL_EMPHASIS_DIMENSIONS) {
		assertNonNegativeInteger(
			value[dimension],
			`Design model emphasis ${dimension}`,
		);
	}
	const emphasis = value as {
		capability: number;
		reliability: number;
		safety: number;
		efficiency: number;
	};
	if (
		emphasis.capability +
			emphasis.reliability +
			emphasis.safety +
			emphasis.efficiency !==
		BALANCE.modelEmphasisPoints
	) {
		throw new Error(
			`Design model emphasis must total exactly ${BALANCE.modelEmphasisPoints}`,
		);
	}
}
