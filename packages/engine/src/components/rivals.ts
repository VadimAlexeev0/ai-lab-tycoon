import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertString,
} from "../validation.js";

export type RivalArchetype = "research_lab" | "platform" | "efficiency";
export type RivalFocus = "capability" | "reliability" | "distribution";

const RIVAL_ARCHETYPES = ["research_lab", "platform", "efficiency"] as const;
const RIVAL_FOCUSES = ["capability", "reliability", "distribution"] as const;

export type Rival = {
	id: string;
	name: string;
	archetype: RivalArchetype;
	focus: RivalFocus;
	progress: number;
	active: boolean;
};

export type RivalsState = {
	items: Rival[];
};

export function createRivalsState(items: Rival[] = []): RivalsState {
	return {
		items: items.map((rival) => ({ ...rival })),
	};
}

export function assertRivalsState(
	value: unknown,
): asserts value is RivalsState {
	assertExactObject(value, ["items"], "rivals");
	assertArray(value.items, "Rivals items");
	if (value.items.length > 3) {
		throw new Error("Rivals must contain at most three rivals");
	}

	const ids = new Set<string>();
	for (const item of value.items) {
		assertExactObject(
			item,
			["id", "name", "archetype", "focus", "progress", "active"],
			"rival",
		);
		assertIdentifier(item.id, "Rival id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate rival id: ${item.id}`);
		}
		ids.add(item.id);

		assertString(item.name, `Rival ${item.id} name`);
		if (item.name.trim().length === 0) {
			throw new Error(`Rival ${item.id} must have a name`);
		}
		assertEnum(item.archetype, RIVAL_ARCHETYPES, "Rival archetype");
		assertEnum(item.focus, RIVAL_FOCUSES, "Rival focus");
		assertNonNegativeInteger(item.progress, `Rival ${item.id} progress`);
		if (item.progress > 100) {
			throw new Error(`Rival ${item.id} progress must be at most 100`);
		}
		assertBoolean(item.active, `Rival ${item.id} active`);
	}
}
