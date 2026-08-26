import {
	assertArray,
	assertExactObject,
	assertIdentifier,
	assertNullableString,
	assertString,
} from "../validation.js";

export type Team = {
	id: string;
	name: string;
	activeProjectId: string | null;
};

export type TeamsState = {
	items: Team[];
};

export const MAX_TEAMS = 3;

export function createTeamsState(items: Team[] = []): TeamsState {
	return {
		items: items.map((team) => ({ ...team })),
	};
}

export function assertTeamsState(value: unknown): asserts value is TeamsState {
	assertExactObject(value, ["items"], "teams");
	assertArray(value.items, "Teams items");
	if (value.items.length > MAX_TEAMS) {
		throw new Error("Teams must contain at most three teams");
	}

	const ids: string[] = [];
	for (const item of value.items) {
		assertExactObject(item, ["id", "name", "activeProjectId"], "team");
		assertIdentifier(item.id, "Team id");
		if (ids.includes(item.id)) {
			throw new Error(`Duplicate team id: ${item.id}`);
		}
		ids.push(item.id);

		assertString(item.name, `Team ${item.id} name`);
		if (item.name.trim().length === 0) {
			throw new Error(`Team ${item.id} must have a name`);
		}
		assertNullableString(item.activeProjectId, "Team active project id");
		if (item.activeProjectId !== null) {
			assertIdentifier(item.activeProjectId, "Team active project id");
		}
	}
}
