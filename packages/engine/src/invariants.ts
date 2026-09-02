import { assertCompanyState } from "./components/company.js";
import { assertComputeState } from "./components/compute.js";
import { assertDataInventoryState } from "./components/data-inventory.js";
import {
	assertDecisionChoice,
	assertDecisionsState,
} from "./components/decisions.js";
import { assertFundingState } from "./components/funding.js";
import { assertModelsState } from "./components/models.js";
import {
	assertProductPrice,
	assertProductsState,
} from "./components/products.js";
import { assertProjectsState, type Project } from "./components/projects.js";
import { assertReportsState } from "./components/reports.js";
import { assertResearchState } from "./components/research.js";
import { assertRiskState } from "./components/risk.js";
import { assertRivalsState } from "./components/rivals.js";
import { assertRngState } from "./components/rng.js";
import { assertTeamsState } from "./components/teams.js";
import { assertTerminalState } from "./components/terminal.js";
import { computeReservations } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import { getDataSourceDefinition } from "./data/data-sources.js";
import {
	DATA_MIX_DIMENSIONS,
	MODEL_EMPHASIS_DIMENSIONS,
	MODEL_FAMILIES,
	MODEL_FAMILY_IDS,
	MODEL_TIERS,
} from "./data/model-families.js";
import {
	ASSISTANT_ERA,
	ASSISTANT_MODELS_KEYSTONE_ID,
	MULTIMODAL_ERA,
	RESEARCH_NODE_DEFINITIONS,
	TEXT_MODELS_KEYSTONE_ID,
} from "./data/research.js";
import {
	hasCompletedModelFamilyUnlock,
	hasRequiredShippedModelProof,
} from "./era-proof.js";
import { deriveResearchEffects } from "./research-effects.js";
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
const TRAINING_BLOCKING_DATA_RESTRICTIONS = new Set<string>([
	"research_only",
	"no_training",
]);
const COMMAND_KINDS = [
	"start_run",
	"apply_decision",
	"advance_week",
	"assign_project",
	"cancel_project",
	"design_model",
	"refresh_model",
	"run_evaluation",
	"launch_product",
	"acquire_data",
	"buy_compute",
	"hire_team",
	"product_resume",
	"product_retire",
] as const;
const MODEL_FOUNDATIONS = ["fresh", "continued", "distilled"] as const;
const WARNING_CODES = [
	"cash_low",
	"compute_shortage",
	"trust_low",
	"stale_data",
	"stale_model",
	"blocking_decision",
	"risk_escalation",
	"compute_conflict",
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
	"dataInventory",
	"research",
	"models",
	"products",
	"rivals",
	"funding",
	"decisions",
	"reports",
	"risk",
	"queue",
	"commandLog",
	"warnings",
	"terminal",
] as const;

export type GameStateValidationOptions = Readonly<{
	/** Permit a negative cash balance while a weekly loss is being finalized. */
	allowNegativeCash?: boolean;
}>;

/** Toggle expensive invariant checks for trusted high-volume simulations. */
export let assertionsEnabled = true;

export function setAssertionsEnabled(enabled: boolean): void {
	assertionsEnabled = enabled;
}

export function assertGameState(
	value: unknown,
	options: GameStateValidationOptions = {},
	force = false,
): asserts value is GameState {
	if (!assertionsEnabled && !force) return;
	assertJsonCompatible(value);
	assertSafePersistedNumbers(value);
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
	assertDataInventoryState(state.dataInventory);
	assertResearchState(state.research);
	assertResearchNodeDefinitions(state);
	// Effects are a derived view of completed node ids; validating the view here
	// rejects any catalog/state contract drift before a system consumes it.
	deriveResearchEffects(state.research);
	assertModelsState(state.models);
	assertModelDataRelations(state);
	assertRefreshProjectDataRelations(state);
	assertProductsState(state.products);
	assertDataInventoryProductRelations(state);
	assertRivalsState(state.rivals);
	assertFundingState(state.funding);
	assertDecisionsState(state.decisions);
	assertReportsState(state.reports);
	assertProductFactRelations(state);
	assertRiskState(state.risk, { currentWeek: state.meta.week });
	assertTerminalState(state.terminal);
	assertQueueShape(state.queue);
	assertCommandLog(state.commandLog, state);
	assertPublicationHistory(state);
	assertRiskRelations(state);
	assertWarnings(state.warnings);
	assertComputeReservations(state);
	assertResearchGraph(state);
	assertModelRelations(state);
	assertTerminalResourceConsistency(state);

	assertUniqueStateIds(state);
	assertComponentOwnership(state);
	assertQueueConsistency(state);
	assertShippedEraProof(state);
}

/**
 * Game state is an integer-only JSON contract. Keep this pass at the root so
 * every persisted numeric remains safe even if a component later forgets to
 * use one of the numeric assertion helpers.
 */
function assertSafePersistedNumbers(value: unknown, path = "state"): void {
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) {
			throw new Error(`${path} must be a safe integer`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			assertSafePersistedNumbers(value[index], `${path}[${index}]`);
		}
		return;
	}
	if (value !== null && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) {
			assertSafePersistedNumbers(child, `${path}.${key}`);
		}
	}
}

/**
 * Compute reservations are derived from active projects and operating
 * products. State may be observed during a phase, but the persisted snapshot
 * must agree exactly; the explicit zero tolerance documents that all values
 * are integer simulation units rather than floating point measurements.
 */
const COMPUTE_RESERVATION_TOLERANCE = 0;

function assertComputeReservations(state: GameState): void {
	const expected = computeReservations(state);
	const checks: readonly [string, number, number][] = [
		["training demand", state.compute.trainingDemand, expected.trainingDemand],
		["serving demand", state.compute.servingDemand, expected.servingDemand],
		["allocated compute", state.compute.allocated, expected.allocated],
	];
	for (const [name, actual, derived] of checks) {
		if (Math.abs(actual - derived) > COMPUTE_RESERVATION_TOLERANCE) {
			throw new Error(
				`Compute ${name} does not match recomputed reservations (stored ${actual}, expected ${derived})`,
			);
		}
	}
}

const RESEARCH_NODE_IDS = new Set<string>(
	RESEARCH_NODE_DEFINITIONS.map((definition) => definition.id),
);

function assertResearchNodeDefinitions(state: GameState): void {
	const unknownIds = state.research.nodes
		.map((node) => node.id)
		.filter((id) => !RESEARCH_NODE_IDS.has(id));

	if (unknownIds.length > 0) {
		throw new Error(
			`Saved research state contains unknown research node ids: ${unknownIds.join(", ")}`,
		);
	}
}

function assertResearchGraph(state: GameState): void {
	const nodes = state.research.nodes;
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const currentEraIndex = RESEARCH_ERAS.indexOf(state.research.currentEra);

	assertEraKeystone(state, state.research.currentEra, currentEraIndex);

	for (const node of nodes) {
		if (
			node.status === "available" &&
			!isResearchEraUnlocked(state, node.era)
		) {
			throw new Error(
				`Available research node ${node.id} is not unlocked in the current era`,
			);
		}
		if (
			node.status === "available" &&
			node.prerequisites.some(
				(prerequisiteId) => byId.get(prerequisiteId)?.status !== "completed",
			)
		) {
			throw new Error(
				`Available research node ${node.id} requires completed prerequisites`,
			);
		}
		if (node.status !== "completed") {
			continue;
		}
		const nodeEraIndex = RESEARCH_ERAS.indexOf(node.era);
		if (
			nodeEraIndex > currentEraIndex ||
			!isResearchEraUnlocked(state, node.era)
		) {
			throw new Error(
				`Completed research node ${node.id} is not unlocked in the current era`,
			);
		}
		for (const prerequisiteId of node.prerequisites) {
			const prerequisite = byId.get(prerequisiteId);
			if (prerequisite?.status !== "completed") {
				throw new Error(
					`Completed research node ${node.id} requires completed prerequisite ${prerequisiteId}`,
				);
			}
		}
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (nodeId: string): void => {
		if (visiting.has(nodeId)) {
			throw new Error(
				`Research nodes contain a prerequisite cycle at ${nodeId}`,
			);
		}
		if (visited.has(nodeId)) return;
		const node = byId.get(nodeId);
		if (node === undefined) return;
		visiting.add(nodeId);
		for (const prerequisiteId of node.prerequisites) visit(prerequisiteId);
		visiting.delete(nodeId);
		visited.add(nodeId);
	};
	for (const node of nodes) visit(node.id);
}

function assertEraKeystone(
	state: GameState,
	era: GameState["research"]["currentEra"],
	eraIndex: number,
): void {
	if (eraIndex < 0) {
		throw new Error(`Research era is not recognized: ${era}`);
	}
	if (
		era === ASSISTANT_ERA &&
		!hasCompletedResearchNode(state, TEXT_MODELS_KEYSTONE_ID)
	) {
		throw new Error(
			`The ${ASSISTANT_ERA} era requires completed research node ${TEXT_MODELS_KEYSTONE_ID}`,
		);
	}
	if (
		era === MULTIMODAL_ERA &&
		!hasCompletedResearchNode(state, ASSISTANT_MODELS_KEYSTONE_ID)
	) {
		throw new Error(
			`The ${MULTIMODAL_ERA} era requires completed research node ${ASSISTANT_MODELS_KEYSTONE_ID}`,
		);
	}
}

function isResearchEraUnlocked(
	state: GameState,
	era: GameState["research"]["currentEra"],
): boolean {
	const eraIndex = RESEARCH_ERAS.indexOf(era);
	if (
		eraIndex < 0 ||
		eraIndex > RESEARCH_ERAS.indexOf(state.research.currentEra)
	) {
		return false;
	}
	if (
		eraIndex >= RESEARCH_ERAS.indexOf(ASSISTANT_ERA) &&
		!hasCompletedResearchNode(state, TEXT_MODELS_KEYSTONE_ID)
	) {
		return false;
	}
	if (
		eraIndex >= RESEARCH_ERAS.indexOf(MULTIMODAL_ERA) &&
		!hasCompletedResearchNode(state, ASSISTANT_MODELS_KEYSTONE_ID)
	) {
		return false;
	}
	return true;
}

function hasCompletedResearchNode(state: GameState, nodeId: string): boolean {
	return state.research.nodes.some(
		(node) => node.id === nodeId && node.status === "completed",
	);
}

function assertShippedEraProof(state: GameState): void {
	const completedResearchNodeIds = new Set(
		state.research.nodes
			.filter((node) => node.status === "completed")
			.map((node) => node.id),
	);
	if (
		hasRequiredShippedModelProof(
			state,
			state.meta.era,
			completedResearchNodeIds,
		)
	) {
		return;
	}
	throw new Error(
		`The ${state.meta.era} era requires retained shipped model proof for every earlier era`,
	);
}

function assertModelRelations(state: GameState): void {
	assertModelGenerationAvailability(state);
	const completedResearchNodeIds = new Set(
		state.research.nodes
			.filter((node) => node.status === "completed")
			.map((node) => node.id),
	);

	for (const model of state.models.items) {
		if (model.family !== undefined) {
			const family = MODEL_FAMILIES.find(
				(candidate) => candidate.id === model.family,
			);
			if (
				family === undefined ||
				!hasCompletedModelFamilyUnlock(family, completedResearchNodeIds)
			) {
				throw new Error(
					`Model ${model.id} requires completed family unlock research node ${family?.unlockedByResearchNodeId ?? "its family unlock"}`,
				);
			}
		}

		const hasTrueScores = model.trueScores !== undefined;
		const hasEstimates = model.estimates !== undefined;
		if (hasTrueScores !== hasEstimates) {
			throw new Error(
				`Model ${model.id} must have true scores and estimates together`,
			);
		}
		if (
			model.knowledgeCutoff !== undefined &&
			model.knowledgeCutoff > state.meta.week
		) {
			throw new Error(
				`Model ${model.id} knowledge cutoff cannot be from a future week`,
			);
		}
		if (model.status === "launched" && (!hasTrueScores || !hasEstimates)) {
			throw new Error(
				`Launched model ${model.id} must retain true scores and estimates`,
			);
		}
		if (
			model.status !== "designing" &&
			(model.family === undefined || model.tier === undefined)
		) {
			throw new Error(
				`Model ${model.id} must have a family and tier once it is beyond designing`,
			);
		}

		const referencedProducts = state.products.items.filter(
			(product) => product.modelId === model.id,
		);
		if (model.status === "launched" && referencedProducts.length === 0) {
			throw new Error(
				`Launched model ${model.id} must retain a product record`,
			);
		}
		if (
			model.status === "shelved" &&
			referencedProducts.some((product) => product.status === "operating")
		) {
			throw new Error(
				`Shelved model ${model.id} cannot have an operating product`,
			);
		}
	}

	for (const product of state.products.items) {
		if (
			product.status !== "operating" &&
			product.status !== "paused" &&
			product.status !== "retired"
		)
			continue;
		const model = state.models.items.find(
			(candidate) => candidate.id === product.modelId,
		);
		if (model !== undefined && model.status !== "launched") {
			throw new Error(
				`Product ${product.id} with status ${product.status} requires referenced model ${model.id} to be launched`,
			);
		}
	}
}

function assertDataInventoryProductRelations(state: GameState): void {
	for (const record of state.dataInventory.items) {
		if (record.provenance !== "product_derived") continue;
		if (record.derivedFromProductId === null) {
			throw new Error(
				`Product-derived data record ${record.id} is missing its source product`,
			);
		}
		const product = state.products.items.find(
			(candidate) => candidate.id === record.derivedFromProductId,
		);
		if (product === undefined) {
			throw new Error(
				`Product-derived data record ${record.id} references an unknown product ${record.derivedFromProductId}`,
			);
		}
		const source = getDataSourceDefinition(record.sourceId);
		if (
			source === undefined ||
			!source.eligibleProductChannels.includes(product.channel)
		) {
			throw new Error(
				`Product-derived data record ${record.id} references an ineligible product channel`,
			);
		}
	}
}

function assertProductFactRelations(state: GameState): void {
	for (const report of state.reports.items) {
		const fact = report.fact;
		const productId =
			fact.kind === "product_launched" ||
			fact.kind === "product_resumed" ||
			fact.kind === "product_pressure" ||
			fact.kind === "product_retired" ||
			fact.kind === "revenue" ||
			fact.kind === "model_staleness"
				? fact.productId
				: null;
		if (productId === null) continue;
		const product = state.products.items.find((item) => item.id === productId);
		if (product === undefined) {
			throw new Error(
				`Product fact ${fact.kind} references unknown product ${productId}`,
			);
		}
		if (fact.week > state.meta.week) {
			throw new Error(`Product fact ${fact.kind} cannot be from a future week`);
		}
		if (
			(fact.kind === "product_launched" ||
				fact.kind === "product_resumed" ||
				fact.kind === "revenue" ||
				fact.kind === "product_pressure" ||
				fact.kind === "product_retired") &&
			fact.channel !== product.channel
		) {
			throw new Error(
				`Product fact ${fact.kind} does not match product ${product.id} channel`,
			);
		}
		if (fact.kind === "product_pressure") {
			if (product.price !== undefined && product.price !== fact.price) {
				throw new Error(
					`Product pressure fact price does not match product ${product.id}`,
				);
			}
			continue;
		}
		if (fact.kind === "product_retired") {
			if (
				product.status !== "retired" ||
				product.modelId !== fact.modelId ||
				product.retiredUsers !== fact.lostUsers
			) {
				throw new Error(
					`Product retirement fact does not match product ${product.id}`,
				);
			}
			continue;
		}
		if (fact.kind === "model_staleness" && product.modelId !== fact.modelId) {
			throw new Error(
				`Model staleness fact does not match product ${product.id}`,
			);
		}
	}
}

function assertModelDataRelations(state: GameState): void {
	for (const model of state.models.items) {
		const allocations = model.dataAllocation;
		if (allocations === undefined) continue;
		const total = allocations.reduce(
			(sum, allocation) => sum + allocation.amount,
			0,
		);
		if (total !== BALANCE.dataInventory.trainingUnits) {
			throw new Error(
				`Model ${model.id} data allocation must total exactly ${BALANCE.dataInventory.trainingUnits} training units`,
			);
		}
		const activeTraining =
			model.projectId !== null &&
			state.projects.items.some(
				(project) =>
					project.id === model.projectId &&
					project.kind === "training" &&
					project.status === "active",
			);
		for (const allocation of allocations) {
			const record = state.dataInventory.items.find(
				(candidate) => candidate.id === allocation.recordId,
			);
			if (record === undefined) {
				throw new Error(
					`Model ${model.id} data allocation references unknown record ${allocation.recordId}`,
				);
			}
			if (
				record.usageRestrictions.some((restriction) =>
					TRAINING_BLOCKING_DATA_RESTRICTIONS.has(restriction),
				)
			) {
				throw new Error(
					`Model ${model.id} data allocation references restricted training data record ${record.id}`,
				);
			}
			const heldAmount = activeTraining
				? record.reservedAmount
				: record.consumedAmount;
			if (heldAmount < allocation.amount) {
				throw new Error(
					`Model ${model.id} data allocation exceeds its record ${activeTraining ? "reservation" : "consumption"}`,
				);
			}
		}
	}
}

function assertRefreshProjectDataRelations(state: GameState): void {
	for (const project of state.projects.items) {
		if (project.kind !== "refresh") continue;
		const total = project.dataAllocation.reduce(
			(sum, allocation) => sum + allocation.amount,
			0,
		);
		if (total !== BALANCE.dataInventory.trainingUnits) {
			throw new Error(
				`Refresh project ${project.id} data allocation must total exactly ${BALANCE.dataInventory.trainingUnits} training units`,
			);
		}
		const model = state.models.items.find(
			(candidate) => candidate.id === project.modelId,
		);
		if (model === undefined) {
			throw new Error(
				`Refresh project ${project.id} references an unknown model`,
			);
		}
		if (project.status === "active" && model.projectId !== project.id) {
			throw new Error(
				`Active refresh project ${project.id} must be reciprocal with its model`,
			);
		}
		const allocatedMix = { general: 0, code: 0, multimodal: 0 };
		for (const allocation of project.dataAllocation) {
			const record = state.dataInventory.items.find(
				(candidate) => candidate.id === allocation.recordId,
			);
			if (record === undefined) {
				throw new Error(
					`Refresh project ${project.id} references unknown data record ${allocation.recordId}`,
				);
			}
			allocatedMix[record.modality] += allocation.amount;
			if (project.status === "active") {
				if (record.availableFromWeek > state.meta.week) {
					throw new Error(
						`Active refresh project ${project.id} references unavailable data record ${record.id}`,
					);
				}
				if (
					record.usageRestrictions.some((restriction) =>
						TRAINING_BLOCKING_DATA_RESTRICTIONS.has(restriction),
					)
				) {
					throw new Error(
						`Active refresh project ${project.id} references restricted data record ${record.id}`,
					);
				}
				if (
					record.freshness < BALANCE.knowledgeCutoff.refreshMinimumFreshness
				) {
					throw new Error(
						`Active refresh project ${project.id} requires fresh data record ${record.id}`,
					);
				}
			}
			const heldAmount =
				project.status === "active"
					? record.reservedAmount
					: project.status === "completed"
						? record.consumedAmount
						: record.reservedAmount + record.consumedAmount;
			if (project.status !== "cancelled" && heldAmount < allocation.amount) {
				throw new Error(
					`Refresh project ${project.id} exceeds its record ${project.status === "active" ? "reservation" : "consumption"}`,
				);
			}
		}
	}
}

function assertModelGenerationAvailability(state: GameState): void {
	const currentEraIndex = RESEARCH_ERAS.indexOf(state.meta.era);
	for (const model of state.models.items) {
		if (model.family === undefined) continue;
		const family = MODEL_FAMILIES.find(
			(candidate) => candidate.id === model.family,
		);
		const familyEra = family?.allowedEras[0];
		if (familyEra === undefined) {
			throw new Error(`Model ${model.id} has no generation era`);
		}
		if (RESEARCH_ERAS.indexOf(familyEra) > currentEraIndex) {
			throw new Error(
				`Model ${model.id} belongs to the ${familyEra} generation, which is unavailable in the ${state.meta.era} era`,
			);
		}
	}
}

function assertTerminalResourceConsistency(state: GameState): void {
	if (state.terminal.reason === "cash_depleted" && state.company.cash > 0) {
		throw new Error(
			"Terminal cash_depleted reason requires company cash to be at or below zero",
		);
	}
	if (state.terminal.reason === "trust_collapsed" && state.company.trust > 0) {
		throw new Error(
			"Terminal trust_collapsed reason requires company trust to be at or below zero",
		);
	}
}

function assertMeta(value: unknown, research: unknown): void {
	assertExactObject(value, ["schemaVersion", "runId", "week", "era"], "meta");
	if (value.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
		throw new Error("Unsupported game state schema version");
	}
	assertIdentifier(value.runId, "Run id");
	assertPositiveInteger(value.week, "Meta week");
	assertEnum(value.era, RESEARCH_ERAS, "Meta era");
	assertExactObject(
		research,
		["currentEra", "nodes", "discoveredSparkIds", "paradigmId"],
		"research",
	);
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
		"data",
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
		...state.dataInventory.items.map((record) => record.id),
		...state.decisions.pending.map((decision) => decision.id),
		...state.reports.items.map((report) => report.id),
		...state.risk.memories.map((memory) => memory.id),
		...state.risk.crises.map((crisis) => crisis.id),
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
		project.kind === "refresh" ||
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
		| "meta"
		| "rng"
		| "company"
		| "models"
		| "projects"
		| "teams"
		| "products"
		| "dataInventory"
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
		const expectedId = `command_${String(index + 1).padStart(3, "0")}`;
		if (item.id !== expectedId) {
			throw new Error(
				`Command ids must be sequential; expected ${expectedId} but received ${item.id}`,
			);
		}
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
						"brandId",
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
				assertIdentifier(item.brandId, "Design model brand id");
				assertEnum(item.tier, MODEL_TIERS, "Design model compute tier");
				assertDesignMix(item.dataMix);
				assertDesignEmphasis(item.emphasis);
				assertDesignCommandReferences(item, state);
				break;
			case "refresh_model":
				assertExactObject(
					item,
					["id", "kind", "week", "modelId", "projectId", "teamId", "dataMix"],
					"refresh_model command",
				);
				assertIdentifier(item.modelId, "Refresh command model id");
				assertIdentifier(item.projectId, "Refresh command project id");
				assertIdentifier(item.teamId, "Refresh command team id");
				assertDesignMix(item.dataMix);
				assertRefreshCommandReferences(item, state);
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
					["id", "kind", "week", "productId", "modelId", "channel", "price"],
					"launch_product command",
				);
				assertIdentifier(item.productId, "Launch command product id");
				assertIdentifier(item.modelId, "Launch command model id");
				assertEnum(
					item.channel,
					["chat", "developer_api", "enterprise"],
					"Launch command channel",
				);
				assertProductPrice(item.channel, item.price);
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
					launchProduct.channel !== item.channel ||
					launchProduct.price !== item.price
				) {
					throw new Error(
						`Launch command product ${launchProduct.id} does not match its model or channel`,
					);
				}
				break;
			}
			case "acquire_data": {
				assertExactObject(
					item,
					["id", "kind", "week", "dataId", "sourceId", "productId"],
					"acquire_data command",
				);
				assertIdentifier(item.dataId, "Acquire data id");
				assertIdentifier(item.sourceId, "Acquire data source id");
				assertNullableString(item.productId, "Acquire data product id");
				if (item.productId !== null) {
					assertIdentifier(item.productId, "Acquire data product id");
				}
				const record = state.dataInventory.items.find(
					(candidate) => candidate.id === item.dataId,
				);
				if (record === undefined) {
					throw new Error(
						`Acquire data command references an unknown record: ${String(item.dataId)}`,
					);
				}
				if (
					record.sourceId !== item.sourceId ||
					record.derivedFromProductId !== item.productId
				) {
					throw new Error(
						`Acquire data command does not match record ${record.id}`,
					);
				}
				break;
			}
			case "buy_compute":
				assertExactObject(
					item,
					["id", "kind", "week", "amount"],
					"buy_compute command",
				);
				assertPositiveInteger(item.amount, "Buy compute amount");
				break;
			case "hire_team":
				assertExactObject(
					item,
					["id", "kind", "week", "name"],
					"hire_team command",
				);
				assertString(item.name, "Hire team name");
				if (item.name.trim().length === 0) {
					throw new Error("Hire team name must not be empty");
				}
				break;
			case "product_resume":
				assertExactObject(
					item,
					["id", "kind", "week", "productId"],
					"product_resume command",
				);
				assertIdentifier(item.productId, "Resume product id");
				break;
			case "product_retire": {
				assertExactObject(
					item,
					["id", "kind", "week", "productId"],
					"product_retire command",
				);
				assertIdentifier(item.productId, "Retire product id");
				const retiredProduct = state.products.items.find(
					(product) => product.id === item.productId,
				);
				if (retiredProduct === undefined) {
					throw new Error(
						`Retire command references an unknown product: ${String(item.productId)}`,
					);
				}
				if (retiredProduct.status !== "retired") {
					throw new Error(
						`Retire command product ${retiredProduct.id} must be retired`,
					);
				}
				if (
					value.some((candidate: unknown, candidateIndex) => {
						if (candidate === null || typeof candidate !== "object") {
							return false;
						}
						const prior = candidate as Record<string, unknown>;
						return (
							candidateIndex < index &&
							prior.kind === "product_retire" &&
							prior.productId === item.productId
						);
					})
				) {
					throw new Error(
						`Product ${item.productId} cannot be retired more than once`,
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

function assertPublicationHistory(state: GameState): void {
	const publicationCommands = state.commandLog.filter(
		(command) => command.kind === "apply_decision",
	);
	const resolvedNodeIds = new Set<string>();
	for (const command of publicationCommands) {
		if (command.choice.kind !== "publication") continue;
		const { nodeId } = command.choice;
		if (resolvedNodeIds.has(nodeId)) {
			throw new Error(
				`Duplicate publication command for research node ${nodeId}`,
			);
		}
		resolvedNodeIds.add(nodeId);
	}

	for (const decision of state.decisions.pending) {
		if (decision.kind !== "publication") continue;
		const node = state.research.nodes.find(
			(candidate) => candidate.id === decision.nodeId,
		);
		if (node?.status !== "completed") {
			throw new Error(
				`Publication decision for node ${decision.nodeId} requires a completed research node`,
			);
		}
		if (resolvedNodeIds.has(decision.nodeId)) {
			throw new Error(
				`Publication decision for node ${decision.nodeId} was already resolved by a prior publication command`,
			);
		}
	}

	for (const report of state.reports.items) {
		const fact = report.fact;
		if (fact.kind !== "research_publication_resolved") continue;
		const hasMatchingCommand = publicationCommands.some((command) => {
			if (command.choice.kind !== "publication") return false;
			return (
				command.week === fact.week &&
				command.choice.nodeId === fact.nodeId &&
				command.choice.outcome === fact.outcome
			);
		});
		if (!hasMatchingCommand) {
			throw new Error(
				`Retained publication fact for node ${fact.nodeId} has no matching publication command`,
			);
		}
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

function assertRefreshCommandReferences(
	command: Record<string, unknown>,
	state: Pick<GameState, "models" | "projects" | "teams">,
): void {
	const model = state.models.items.find((item) => item.id === command.modelId);
	if (model === undefined) {
		throw new Error(
			`Refresh model command references an unknown model: ${String(command.modelId)}`,
		);
	}
	if (model.status !== "ready" && model.status !== "launched") {
		throw new Error(
			`Refresh model command references an ineligible model: ${String(command.modelId)}`,
		);
	}
	const project = state.projects.items.find(
		(item) => item.id === command.projectId,
	);
	if (project === undefined || project.kind !== "refresh") {
		throw new Error(
			`Refresh model command references a non-refresh project: ${String(command.projectId)}`,
		);
	}
	if (
		project.modelId !== model.id ||
		!matchesDataMix(project.dataMix, command.dataMix)
	) {
		throw new Error(
			`Refresh model command payload does not match project ${project.id}`,
		);
	}
	if (!state.teams.items.some((team) => team.id === command.teamId)) {
		throw new Error(
			`Refresh model command references an unknown team: ${String(command.teamId)}`,
		);
	}
}

function matchesDataMix(
	projectMix: { general: number; code: number; multimodal: number },
	commandMix: unknown,
): boolean {
	if (commandMix === null || typeof commandMix !== "object") return false;
	const mix = commandMix as Record<string, unknown>;
	return DATA_MIX_DIMENSIONS.every(
		(dimension) => projectMix[dimension] === mix[dimension],
	);
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
		model.brandId !== command.brandId ||
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

function assertRiskRelations(state: GameState): void {
	for (const memory of state.risk.memories) {
		const product =
			memory.affectedProductId === null
				? undefined
				: state.products.items.find(
						(candidate) => candidate.id === memory.affectedProductId,
					);
		if (memory.affectedProductId !== null && product === undefined) {
			throw new Error(
				`Risk memory ${memory.id} references unknown product ${memory.affectedProductId}`,
			);
		}
		const model =
			memory.affectedModelId === null
				? undefined
				: state.models.items.find(
						(candidate) => candidate.id === memory.affectedModelId,
					);
		if (memory.affectedModelId !== null && model === undefined) {
			throw new Error(
				`Risk memory ${memory.id} references unknown model ${memory.affectedModelId}`,
			);
		}
		if (
			product !== undefined &&
			model !== undefined &&
			product.modelId !== model.id
		) {
			throw new Error(
				`Risk memory ${memory.id} product and model references disagree`,
			);
		}
	}

	for (const decision of state.decisions.pending) {
		if (decision.kind === "incident" && decision.riskMemoryId !== undefined) {
			const memory = state.risk.memories.find(
				(candidate) => candidate.id === decision.riskMemoryId,
			);
			if (memory === undefined) {
				throw new Error(
					`Incident decision ${decision.id} references unknown risk memory ${decision.riskMemoryId}`,
				);
			}
			if (memory.incident !== decision.incident) {
				throw new Error(
					`Incident decision ${decision.id} references a mismatched risk memory`,
				);
			}
		}
		if (decision.kind !== "crisis") continue;
		const canonicalCrisisId = `crisis_${decision.riskMemoryId}`;
		if (decision.crisisId !== canonicalCrisisId) {
			throw new Error(
				`Crisis decision ${decision.id} must reference canonical crisis ${canonicalCrisisId}`,
			);
		}
		const crisis = state.risk.crises.find(
			(candidate) => candidate.id === decision.crisisId,
		);
		if (crisis === undefined) {
			throw new Error(
				`Crisis decision ${decision.id} references unknown crisis ${decision.crisisId}`,
			);
		}
		if (crisis.status !== "open") {
			throw new Error(
				`Crisis decision ${decision.id} references a resolved crisis`,
			);
		}
		if (crisis.riskMemoryId !== decision.riskMemoryId) {
			throw new Error(
				`Crisis decision ${decision.id} references a mismatched risk memory`,
			);
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
