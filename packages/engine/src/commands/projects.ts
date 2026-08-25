import type { Project } from "../components/projects.js";
import { allocateId } from "../ids.js";
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
	let insightCost = 0;
	if (storedProject.kind === "research") {
		if (!isResearchNodeAvailableForAssignment(state, storedProject.nodeId)) {
			throw new Error(
				`Research prerequisites are not met for node ${storedProject.nodeId}`,
			);
		}
		const node = state.research.nodes.find(
			(item) => item.id === storedProject.nodeId,
		);
		if (node === undefined) {
			throw new Error(
				`Cannot assign unknown research node: ${storedProject.nodeId}`,
			);
		}
		insightCost = node.insightCost;
		if (state.company.insight < insightCost) {
			throw new Error(
				`Insufficient Insight to assign research node ${storedProject.nodeId}`,
			);
		}
	}

	const commandAllocation = allocateId(state, "command");
	const nextState: GameState = {
		...commandAllocation.state,
		company: {
			...state.company,
			insight: state.company.insight - insightCost,
		},
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
		models: {
			items: state.models.items.map((model) =>
				isTrainingOrModelProject(storedProject) &&
				model.id === storedProject.modelId
					? { ...model, projectId: storedProject.id }
					: { ...model },
			),
			activeModelId: state.models.activeModelId,
		},
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "assign_project",
				week: state.meta.week,
				teamId,
				projectId: storedProject.id,
			},
		],
	};

	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}

/**
 * Cancel a team's active project. The overload accepting a project is useful
 * to callers that already have the selected project card; the two-argument
 * form cancels the team's active project directly. This same-week command
 * remains available while a blocking decision prevents week advancement.
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

	if (typeof teamOrProject !== "string" && teamOrProject.teamId === null) {
		throw new Error(
			`Cannot cancel project ${teamOrProject.id} without an owning team`,
		);
	}
	const requestedTeamId =
		typeof teamOrProject === "string" ? teamOrProject : teamOrProject.teamId;
	const requestedTeam =
		requestedTeamId === undefined
			? undefined
			: state.teams.items.find((item) => item.id === requestedTeamId);
	if (requestedTeamId !== undefined && requestedTeam === undefined) {
		throw new Error(
			`Cannot cancel a project for unknown team: ${requestedTeamId}`,
		);
	}
	const projectPayload =
		typeof project === "object"
			? project
			: typeof teamOrProject === "string"
				? undefined
				: teamOrProject;
	if (projectPayload !== undefined) {
		if (projectPayload.teamId === null) {
			throw new Error(
				`Cannot cancel project ${projectPayload.id} without an owning team`,
			);
		}
		const payloadTeam = state.teams.items.find(
			(item) => item.id === projectPayload.teamId,
		);
		if (payloadTeam === undefined) {
			throw new Error(
				`Cannot cancel a project for unknown team: ${projectPayload.teamId}`,
			);
		}
		if (requestedTeamId !== undefined && payloadTeam.id !== requestedTeamId) {
			throw new Error(
				`Project ${projectPayload.id} is not assigned to team ${requestedTeamId}`,
			);
		}
	}

	const requestedProjectId =
		typeof teamOrProject === "string"
			? project === undefined
				? undefined
				: typeof project === "string"
					? project
					: project.id
			: teamOrProject.id;

	let storedProject: Project | undefined;
	if (requestedProjectId === undefined) {
		if (requestedTeam === undefined || requestedTeam.activeProjectId === null) {
			throw new Error(
				`Team ${requestedTeamId} has no active project to cancel`,
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

	const commandAllocation = allocateId(state, "command");
	const nextState: GameState = {
		...commandAllocation.state,
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
		models: {
			items: state.models.items.map((model) =>
				storedProject.kind === "training" && model.id === storedProject.modelId
					? {
							...model,
							projectId: null,
							status:
								model.status === "designing" || model.status === "training"
									? "shelved"
									: model.status,
						}
					: { ...model },
			),
			activeModelId: state.models.activeModelId,
		},
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "cancel_project",
				week: state.meta.week,
				teamId: owningTeam.id,
				projectId: storedProject.id,
			},
		],
	};

	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}

function isTrainingOrModelProject(
	project: Project,
): project is Extract<Project, { modelId: string }> {
	return project.kind === "model" || project.kind === "training";
}
