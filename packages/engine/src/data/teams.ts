import { assertExactObject, assertString } from "../validation.js";

export type TeamDefinition = Readonly<{
	name: string;
}>;

/** Content for the single team present at the start of a V1 run. */
export const FOUNDING_TEAM = {
	name: "Founding Team",
} as const satisfies TeamDefinition;

assertTeamDefinition(FOUNDING_TEAM);

/** Fail fast if opening team content is malformed. */
export function assertTeamDefinition(value: TeamDefinition): void {
	assertExactObject(value, ["name"], "team definition");
	assertString(value.name, "Team definition name");
	if (value.name.trim().length === 0) {
		throw new Error("Team definition name must not be empty");
	}
}
