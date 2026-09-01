import type { Project } from "../components/projects.js";
import type { Fact } from "../components/reports.js";
import {
	applyInfrastructureGain,
	withRecomputedCompute,
} from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import { completeEvaluationModel } from "../evaluations.js";
import { assertGameState } from "../invariants.js";
import { deriveResearchEffects } from "../research-effects.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/**
 * Advance every active project by its data-defined weekly rate. Projects are
 * iterated in their serialized order, which keeps facts deterministic.
 */
export const projectsSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });

	const facts: Fact[] = [];
	const completedProjectIds = new Set<string>();
	const completedInfrastructureProjectIds = new Set<string>();
	const completedModelProjectIds = new Set<string>();
	const researchEffects = deriveResearchEffects(state.research);
	const nextModels = state.models.items.map((model) => ({ ...model }));
	const nextProjects: Project[] = state.projects.items.map((project) => {
		if (project.status !== "active" || project.kind === "training") {
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

		if (nextProgress !== project.duration) {
			return { ...project, progress: nextProgress };
		}

		completedProjectIds.add(project.id);
		if (project.kind === "infrastructure" && project.target === "compute") {
			completedInfrastructureProjectIds.add(project.id);
		}
		facts.push({
			kind: "project_completed",
			projectId: project.id,
			week: context.week,
		});
		if (project.kind === "model") {
			completedModelProjectIds.add(project.id);
		}
		if (project.kind === "evaluation") {
			const modelIndex = nextModels.findIndex(
				(model) => model.id === project.modelId,
			);
			const model = nextModels[modelIndex];
			if (model === undefined) {
				throw new Error(
					`Evaluation project ${project.id} references an unknown model`,
				);
			}
			const completed = completeEvaluationModel(
				model,
				project.evaluation,
				researchEffects,
			);
			nextModels[modelIndex] = { ...completed.model, projectId: null };
			facts.push({
				kind: "evaluation_completed",
				modelId: project.modelId,
				evaluation: project.evaluation,
				coverage: completed.coverage,
				week: context.week,
			});
		}
		return {
			...project,
			teamId: null,
			status: "completed",
			progress: nextProgress,
		};
	});

	let nextState: GameState = {
		...state,
		teams: {
			items: state.teams.items.map((team) =>
				team.activeProjectId !== null &&
				completedProjectIds.has(team.activeProjectId)
					? { ...team, activeProjectId: null }
					: { ...team },
			),
		},
		models: {
			items: nextModels.map((model) =>
				model.projectId !== null &&
				completedModelProjectIds.has(model.projectId)
					? { ...model, projectId: null }
					: { ...model },
			),
			activeModelId: state.models.activeModelId,
		},
		compute: {
			...state.compute,
		},
		projects: { items: nextProjects },
	};
	for (const projectId of completedInfrastructureProjectIds) {
		nextState = applyInfrastructureGain(nextState, projectId);
	}
	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState, {
		allowNegativeCash: recomputedState.company.cash < 0,
	});
	return { state: recomputedState, facts, pending: [] };
};
