import type { Model } from "../components/models.js";
import type { Project } from "../components/projects.js";
import type { Fact } from "../components/reports.js";
import {
	applyInfrastructureGain,
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import {
	consumeDataAllocations,
	profileTrainingData,
	syntheticDataEffects,
} from "../data-inventory.js";
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
	const reservations = computeReservations(state);
	let nextDataInventory = state.dataInventory;
	const nextModels = state.models.items.map(cloneModel);
	const nextProjects: Project[] = state.projects.items.map((project) => {
		if (project.status !== "active" || project.kind === "training") {
			return cloneProject(project);
		}

		const rate =
			project.kind === "refresh" &&
			reservations.totalDemand > state.compute.capacity
				? 0
				: project.kind === "refresh"
					? BALANCE.knowledgeCutoff.refreshDuration
					: BALANCE.projectProgressPerWeek[project.kind];
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
		if (project.kind === "refresh") {
			const modelIndex = nextModels.findIndex(
				(model) => model.id === project.modelId,
			);
			const model = nextModels[modelIndex];
			if (model === undefined) {
				throw new Error(
					`Refresh project ${project.id} references an unknown model`,
				);
			}
			const dataProfile = profileTrainingData(state, {
				...model,
				dataAllocation: project.dataAllocation,
			});
			const dataEffects = syntheticDataEffects(dataProfile);
			const knowledgeCutoff =
				dataProfile.newestAvailableFromWeek ?? context.week;
			const knowledgeFreshness = dataProfile.weightedFreshness;
			model.knowledgeCutoff = knowledgeCutoff;
			model.knowledgeFreshness = knowledgeFreshness;
			if (dataEffects.debtAdded > 0) {
				model.dataDebt = Math.min(
					100,
					(model.dataDebt ?? 0) + dataEffects.debtAdded,
				);
			}
			nextDataInventory = consumeDataAllocations(
				nextDataInventory,
				project.dataAllocation,
			);
			completedModelProjectIds.add(project.id);
			facts.push({
				kind: "model_refreshed",
				modelId: model.id,
				projectId: project.id,
				knowledgeCutoff,
				knowledgeFreshness,
				week: context.week,
			});
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
					? { ...cloneModel(model), projectId: null }
					: cloneModel(model),
			),
			activeModelId: state.models.activeModelId,
		},
		dataInventory: {
			items: nextDataInventory.items.map((record) => ({
				...record,
				usageRestrictions: [...record.usageRestrictions],
			})),
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

function cloneProject(project: Project): Project {
	return project.kind === "refresh"
		? {
				...project,
				dataMix: { ...project.dataMix },
				dataAllocation: project.dataAllocation.map((allocation) => ({
					...allocation,
				})),
			}
		: { ...project };
}

function cloneModel(model: Model): Model {
	return {
		...model,
		...(model.dataMix === undefined ? {} : { dataMix: { ...model.dataMix } }),
		...(model.dataAllocation === undefined
			? {}
			: {
					dataAllocation: model.dataAllocation.map((allocation) => ({
						...allocation,
					})),
				}),
		...(model.dataDebt === undefined ? {} : { dataDebt: model.dataDebt }),
		...(model.knowledgeCutoff === undefined
			? {}
			: { knowledgeCutoff: model.knowledgeCutoff }),
		...(model.knowledgeFreshness === undefined
			? {}
			: { knowledgeFreshness: model.knowledgeFreshness }),
		...(model.emphasis === undefined
			? {}
			: { emphasis: { ...model.emphasis } }),
		...(model.trueScores === undefined
			? {}
			: { trueScores: { ...model.trueScores } }),
		...(model.estimates === undefined
			? {}
			: {
					estimates: Object.fromEntries(
						Object.entries(model.estimates).map(([dimension, band]) => [
							dimension,
							{ ...band },
						]),
					) as Model["estimates"],
				}),
	};
}
