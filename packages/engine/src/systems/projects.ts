import type { Project } from "../components/projects.js";
import type { Fact } from "../components/reports.js";
import { BALANCE } from "../data/balance.js";
import { assertGameState } from "../invariants.js";
import type { GameSystem } from "./types.js";

/**
 * Advance every active project by its data-defined weekly rate. Projects are
 * iterated in their serialized order, which keeps facts deterministic.
 */
export const projectsSystem: GameSystem = (state, context) => {
	assertGameState(state);

	const facts: Fact[] = [];
	const completedProjectIds = new Set<string>();
	const nextProjects: Project[] = state.projects.items.map((project) => {
		if (project.status !== "active") {
			return { ...project };
		}

		const rate = BALANCE.projectProgressPerWeek[project.kind];
		const nextProgress = Math.min(project.duration, project.progress + rate);
		const progressedBy = nextProgress - project.progress;
		if (progressedBy > 0) {
			facts.push({
				kind: "project_progressed",
				projectId: project.id,
				amount: progressedBy,
				week: context.week,
			});
		}

		if (nextProgress === project.duration) {
			completedProjectIds.add(project.id);
			facts.push({
				kind: "project_completed",
				projectId: project.id,
				week: context.week,
			});
			return {
				...project,
				teamId: null,
				status: "completed",
				progress: nextProgress,
			};
		}

		return {
			...project,
			progress: nextProgress,
		};
	});

	const nextState = {
		...state,
		teams: {
			items: state.teams.items.map((team) =>
				team.activeProjectId !== null &&
				completedProjectIds.has(team.activeProjectId)
					? { ...team, activeProjectId: null }
					: { ...team },
			),
		},
		projects: { items: nextProjects },
	};
	assertGameState(nextState);
	return { state: nextState, facts, pending: [] };
};
