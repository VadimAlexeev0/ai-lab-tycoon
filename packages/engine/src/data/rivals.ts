import type { RivalArchetype, RivalFocus } from "../components/rivals.js";
import {
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertObject,
	assertString,
} from "../validation.js";
import { MODEL_FAMILY_IDS, type ModelFamilyId } from "./model-families.js";
import { getResearchDefinition } from "./research.js";

export type RivalDefinition = Readonly<{
	name: string;
	archetype: RivalArchetype;
	focus: RivalFocus;
	progress: number;
	active: boolean;
}>;

/** Content definitions for the two visible and one dormant opening rivals. */
export const OPENING_RIVALS = [
	{
		name: "Northstar Labs",
		archetype: "research_lab",
		focus: "capability",
		progress: 0,
		active: true,
	},
	{
		name: "MarketSpring",
		archetype: "platform",
		focus: "distribution",
		progress: 0,
		active: true,
	},
	{
		name: "LeanForge",
		archetype: "efficiency",
		focus: "reliability",
		progress: 0,
		active: false,
	},
] as const satisfies readonly RivalDefinition[];

export type RivalMilestoneDefinition = Readonly<{
	id: string;
	threshold: number;
}>;

/** Public rival milestones. The rival RNG chooses which milestone label lands. */
export const RIVAL_MILESTONES = [
	{ id: "prototype", threshold: 25 },
	{ id: "launch", threshold: 50 },
	{ id: "scale", threshold: 75 },
	{ id: "category_lead", threshold: 100 },
] as const satisfies readonly RivalMilestoneDefinition[];

export type RivalStrategyActionDefinition = Readonly<
	| {
			id: string;
			rivalArchetype: RivalArchetype;
			kind: "publication";
			threshold: number;
			nodeId: string;
	  }
	| {
			id: string;
			rivalArchetype: RivalArchetype;
			kind: "launch";
			threshold: number;
			familyId: ModelFamilyId;
	  }
>;

/**
 * Deterministic event-deck entries consumed by each rival's progress clock.
 * The deck is deliberately small: it exposes strategic pressure without
 * simulating a second company.
 */
// ponytail: The rival ceiling is an event deck driven by bounded progress
// clocks, not a full company simulation. Upgrade path: add persisted rival
// resources, projects, and decisions only when a later wave needs company AI.
export const RIVAL_STRATEGY_ACTIONS = [
	{
		id: "northstar_publish_infrastructure_compute",
		rivalArchetype: "research_lab",
		kind: "publication",
		threshold: 25,
		nodeId: "text_infrastructure_compute",
	},
	{
		id: "northstar_launch_assistant",
		rivalArchetype: "research_lab",
		kind: "launch",
		threshold: 50,
		familyId: "assistant",
	},
	{
		id: "marketspring_publish_inference_price_war",
		rivalArchetype: "platform",
		kind: "publication",
		threshold: 35,
		nodeId: "inference_price_war",
	},
	{
		id: "marketspring_launch_local_edge",
		rivalArchetype: "platform",
		kind: "launch",
		threshold: 60,
		familyId: "local_edge",
	},
	{
		id: "marketspring_launch_agent",
		rivalArchetype: "platform",
		kind: "launch",
		threshold: 90,
		familyId: "agent",
	},
	{
		id: "leanforge_publish_sparse_moe",
		rivalArchetype: "efficiency",
		kind: "publication",
		threshold: 40,
		nodeId: "sparse_moe",
	},
	{
		id: "leanforge_launch_text",
		rivalArchetype: "efficiency",
		kind: "launch",
		threshold: 70,
		familyId: "text",
	},
] as const satisfies readonly RivalStrategyActionDefinition[];

/** Return one rival archetype's actions in their authored deck order. */
export function getRivalStrategyActions(
	archetype: RivalArchetype,
): readonly RivalStrategyActionDefinition[] {
	return RIVAL_STRATEGY_ACTIONS.filter(
		(action) => action.rivalArchetype === archetype,
	);
}

/** Resolve a persisted action id without normalizing or guessing it. */
export function getRivalStrategyAction(
	actionId: string,
): RivalStrategyActionDefinition | undefined {
	return RIVAL_STRATEGY_ACTIONS.find((action) => action.id === actionId);
}

/** Validate the authored rival event deck and all catalog references. */
export function assertRivalStrategyActions(
	actions: readonly RivalStrategyActionDefinition[],
): void {
	const ids = new Set<string>();
	for (const action of actions) {
		assertObject(action, "rival strategy action");
		assertEnum(action.kind, ["publication", "launch"], "Rival strategy kind");
		const keys =
			action.kind === "publication"
				? ["id", "rivalArchetype", "kind", "threshold", "nodeId"]
				: ["id", "rivalArchetype", "kind", "threshold", "familyId"];
		assertExactObject(action, keys, "rival strategy action");
		assertIdentifier(action.id, "Rival strategy action id");
		if (ids.has(action.id)) {
			throw new Error(`Duplicate rival strategy action id: ${action.id}`);
		}
		ids.add(action.id);
		assertEnum(
			action.rivalArchetype,
			["research_lab", "platform", "efficiency"],
			"Rival strategy archetype",
		);
		assertNonNegativeInteger(
			action.threshold,
			`Rival strategy action ${action.id} threshold`,
		);
		if (action.threshold < 1 || action.threshold > 100) {
			throw new Error(
				`Rival strategy action ${action.id} threshold must be between 1 and 100`,
			);
		}
		if (action.kind === "publication") {
			assertIdentifier(action.nodeId, `Rival publication ${action.id} node id`);
			if (getResearchDefinition(action.nodeId) === undefined) {
				throw new Error(
					`Rival publication ${action.id} references an unknown research node: ${action.nodeId}`,
				);
			}
		} else {
			assertEnum(
				action.familyId,
				MODEL_FAMILY_IDS,
				`Rival launch ${action.id} family id`,
			);
		}
	}

	for (const archetype of ["research_lab", "platform", "efficiency"] as const) {
		const deck = actions.filter(
			(action) => action.rivalArchetype === archetype,
		);
		if (deck.length === 0) {
			throw new Error(`Rival strategy deck is missing ${archetype}`);
		}
		let previousThreshold = 0;
		const references = new Set<string>();
		for (const action of deck) {
			if (action.threshold <= previousThreshold) {
				throw new Error(
					`Rival strategy thresholds must increase for ${archetype}`,
				);
			}
			previousThreshold = action.threshold;
			const reference =
				action.kind === "publication"
					? `publication:${action.nodeId}`
					: `launch:${action.familyId}`;
			if (references.has(reference)) {
				throw new Error(
					`Rival strategy ${archetype} repeats action reference ${reference}`,
				);
			}
			references.add(reference);
		}
	}
}

assertRivalDefinitions(OPENING_RIVALS);
assertRivalMilestones(RIVAL_MILESTONES);
assertRivalStrategyActions(RIVAL_STRATEGY_ACTIONS);

function assertRivalMilestones(
	milestones: readonly RivalMilestoneDefinition[],
): void {
	const ids = new Set<string>();
	let previousThreshold = 0;
	for (const milestone of milestones) {
		assertExactObject(milestone, ["id", "threshold"], "rival milestone");
		assertString(milestone.id, "Rival milestone id");
		if (milestone.id.trim().length === 0 || ids.has(milestone.id)) {
			throw new Error("Rival milestone ids must be non-empty and unique");
		}
		ids.add(milestone.id);
		assertNonNegativeInteger(milestone.threshold, "Rival milestone threshold");
		if (milestone.threshold <= previousThreshold || milestone.threshold > 100) {
			throw new Error("Rival milestone thresholds must increase up to 100");
		}
		previousThreshold = milestone.threshold;
	}
}

/** Fail fast if opening rival content is malformed or accidentally duplicated. */
export function assertRivalDefinitions(
	definitions: readonly RivalDefinition[],
): void {
	const names = new Set<string>();
	for (const definition of definitions) {
		assertExactObject(
			definition,
			["name", "archetype", "focus", "progress", "active"],
			"rival definition",
		);
		assertString(definition.name, "Rival definition name");
		if (definition.name.trim().length === 0) {
			throw new Error("Rival definition name must not be empty");
		}
		if (names.has(definition.name)) {
			throw new Error(`Duplicate rival definition name: ${definition.name}`);
		}
		names.add(definition.name);
		assertEnum(
			definition.archetype,
			["research_lab", "platform", "efficiency"],
			"Rival definition archetype",
		);
		assertEnum(
			definition.focus,
			["capability", "reliability", "distribution"],
			"Rival definition focus",
		);
		assertNonNegativeInteger(definition.progress, "Rival definition progress");
		assertBoolean(definition.active, "Rival definition active");
	}

	if (definitions.length !== 3) {
		throw new Error("V1 opening rival definitions must contain three rivals");
	}
	if (definitions.filter((definition) => definition.active).length !== 2) {
		throw new Error("V1 opening rivals must contain two active rivals");
	}
}
