export type Team = {
	id: string;
	name: string;
	activeProjectId: string | null;
};

export type TeamsState = {
	items: Team[];
};

export function createTeamsState(items: Team[] = []): TeamsState {
	return {
		items: items.map((team) => ({ ...team })),
	};
}

export function assertTeamsState(state: TeamsState): void {
	if (state.items.length > 3) {
		throw new Error("Teams must contain at most three teams");
	}

	const ids: string[] = [];
	for (const team of state.items) {
		assertIdentifier(team.id, "team id");
		if (ids.includes(team.id)) {
			throw new Error(`Duplicate team id: ${team.id}`);
		}
		ids.push(team.id);

		if (team.name.trim().length === 0) {
			throw new Error(`Team ${team.id} must have a name`);
		}
		if (team.activeProjectId !== null) {
			assertIdentifier(team.activeProjectId, "active project id");
		}
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}
