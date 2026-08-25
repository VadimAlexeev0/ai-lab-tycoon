export type RivalArchetype = "research_lab" | "platform" | "efficiency";
export type RivalFocus = "capability" | "reliability" | "distribution";

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

export function assertRivalsState(state: RivalsState): void {
	if (state.items.length > 3) {
		throw new Error("Rivals must contain at most three rivals");
	}

	const ids: string[] = [];
	for (const rival of state.items) {
		assertIdentifier(rival.id, "rival id");
		if (ids.includes(rival.id)) {
			throw new Error(`Duplicate rival id: ${rival.id}`);
		}
		ids.push(rival.id);

		if (rival.name.trim().length === 0) {
			throw new Error(`Rival ${rival.id} must have a name`);
		}
		if (!Number.isInteger(rival.progress) || rival.progress < 0) {
			throw new Error(
				`Rival ${rival.id} progress must be a non-negative integer`,
			);
		}
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}
