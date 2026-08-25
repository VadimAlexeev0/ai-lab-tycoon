import type { RivalArchetype, RivalFocus } from "../components/rivals.js";
import {
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertNonNegativeInteger,
	assertString,
} from "../validation.js";

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

assertRivalDefinitions(OPENING_RIVALS);
assertRivalMilestones(RIVAL_MILESTONES);

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
