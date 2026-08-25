import type { Project } from "../components/projects.js";
import { assertGameState } from "../invariants.js";
import type { EngineResult, GameState } from "../state.js";
import { isResearchNodeAvailableForAssignment } from "../systems/research.js";

/** Assign an available project to an idle team without mutating the input. */
export function assignProject(
	state: GameState,
	teamId: string,
	project: Project,
): EngineResult;
export function assignProject(
	state: GameState,
	teamId: string,
	projectId: string,
): EngineResult;
export function assignProject(
	state: GameState,
	teamId: string,
	projectOrId: Project | string,
): EngineResult {
	assertGameState(state);

	const team = state.teams.items.find((item) => item.id === teamId);
	if (team === undefined) {
		throw new Error(`Cannot assign a project to unknown team: ${teamId}`);
	}
	if (team.activeProjectId !== null) {
		throw new Error(`Team ${teamId} must be idle before it can take a project`);
	}

	const projectId =
		typeof projectOrId === "string" ? projectOrId : projectOrId.id;
	const storedProject = state.projects.items.find(
		(item) => item.id === projectId,
	);
	if (storedProject === undefined) {
		throw new Error(`Cannot assign unknown project: ${projectId}`);
	}
	if (storedProject.status !== "available") {
		throw new Error(
			`Project ${storedProject.id} must be available before it can be assigned`,
		);
	}
	if (
		storedProject.kind === "research" &&
		!isResearchNodeAvailableForAssignment(state, storedProject.nodeId)
	) {
		throw new Error(
			`Research prerequisites are not met for node ${storedProject.nodeId}`,
		);
	}

	const nextState: GameState = {
		...state,
		teams: {
			items: state.teams.items.map((item) =>
				item.id === teamId
					? { ...item, activeProjectId: storedProject.id }
					: { ...item },
			),
		},
		projects: {
			items: state.projects.items.map((item) =>
				item.id === storedProject.id
					? { ...item, teamId, status: "active" }
					: { ...item },
			),
		},
	};

	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}

/**
 * Cancel a team's active project. The overload accepting a project is useful
 * to callers that already have the selected project card; the two-argument
 * form cancels the team's active project directly.
 */
export function cancelProject(state: GameState, teamId: string): EngineResult;
export function cancelProject(
	state: GameState,
	teamId: string,
	project: Project | string,
): EngineResult;
export function cancelProject(state: GameState, project: Project): EngineResult;
export function cancelProject(
	state: GameState,
	teamOrProject: string | Project,
	project?: Project | string,
): EngineResult {
	assertGameState(state);

	const teamCandidate =
		typeof teamOrProject === "string"
			? state.teams.items.find((item) => item.id === teamOrProject)
			: undefined;
	const requestedTeamId = teamCandidate?.id;
	const requestedProjectId =
		typeof teamOrProject === "string"
			? project === undefined
				? teamCandidate === undefined
					? teamOrProject
					: undefined
				: typeof project === "string"
					? project
					: project.id
			: teamOrProject.id;
	const requestedTeam = teamCandidate;

	let storedProject: Project | undefined;
	if (requestedTeam !== undefined && project === undefined) {
		if (requestedTeam.activeProjectId === null) {
			throw new Error(
				`Team ${requestedTeam.id} has no active project to cancel`,
			);
		}
		storedProject = state.projects.items.find(
			(item) => item.id === requestedTeam.activeProjectId,
		);
	} else {
		storedProject = state.projects.items.find(
			(item) => item.id === requestedProjectId,
		);
	}

	if (storedProject === undefined) {
		throw new Error(
			`Cannot cancel unknown project: ${String(requestedProjectId)}`,
		);
	}
	if (storedProject.status !== "active" || storedProject.teamId === null) {
		throw new Error(
			`Project ${storedProject.id} must be active to be cancelled`,
		);
	}
	if (
		requestedTeamId !== undefined &&
		storedProject.teamId !== requestedTeamId
	) {
		throw new Error(
			`Project ${storedProject.id} is not assigned to team ${requestedTeamId}`,
		);
	}

	const owningTeam = state.teams.items.find(
		(item) => item.id === storedProject?.teamId,
	);
	if (
		owningTeam === undefined ||
		owningTeam.activeProjectId !== storedProject.id
	) {
		throw new Error(
			`Project ${storedProject.id} has inconsistent team ownership`,
		);
	}

	const nextState: GameState = {
		...state,
		teams: {
			items: state.teams.items.map((item) =>
				item.id === owningTeam.id
					? { ...item, activeProjectId: null }
					: { ...item },
			),
		},
		projects: {
			items: state.projects.items.map((item) =>
				item.id === storedProject?.id
					? { ...item, teamId: null, status: "cancelled" }
					: { ...item },
			),
		},
	};

	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}
