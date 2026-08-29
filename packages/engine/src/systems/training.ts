import type { Model } from "../components/models.js";
import type { Project } from "../components/projects.js";
import type { Fact } from "../components/reports.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import { assertGameState } from "../invariants.js";
import { generateTrueScores } from "../model-design.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/**
 * Progress active training projects and reveal hidden scores with a separate
 * noisy estimate exactly on completion. Training owns this project kind so it
 * is not double-progressed by the generic project phase.
 */
export const trainingSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });

	const facts: Fact[] = [];
	const completedProjectIds = new Set<string>();
	const reservations = computeReservations(state);
	const trainingDemand = reservations.trainingDemand;
	const availableTrainingCapacity = Math.max(
		0,
		state.compute.capacity -
			reservations.servingDemand -
			reservations.evaluationDemand,
	);
	// Training owns its reservation. Serving and evaluation reservations are
	// excluded from this check so a run does not subtract itself twice.
	const trainingProgressRate =
		trainingDemand > availableTrainingCapacity
			? 0
			: BALANCE.projectProgressPerWeek.training;
	const servingStarvation =
		trainingProgressRate === 0 &&
		reservations.servingDemand > 0 &&
		reservations.servingDemand >=
			Math.max(0, state.compute.capacity - reservations.evaluationDemand);
	const trainingStarvedByPressure =
		trainingProgressRate === 0 &&
		trainingDemand > availableTrainingCapacity &&
		(reservations.servingDemand > 0 || reservations.evaluationDemand > 0);
	if (trainingStarvedByPressure) {
		facts.push({
			kind: "training_starved",
			week: context.week,
			capacity: state.compute.capacity,
			servingDemand: reservations.servingDemand,
			evaluationDemand: reservations.evaluationDemand,
			trainingDemand,
		});
	}
	let nextRng = state.rng;
	const nextModels = state.models.items.map(cloneModel);
	const nextProjects: Project[] = state.projects.items.map((project) => {
		if (project.kind !== "training" || project.status !== "active") {
			return cloneProject(project);
		}

		const model = nextModels.find(
			(candidate) => candidate.id === project.modelId,
		);
		if (model === undefined) {
			throw new Error(
				`Training project ${project.id} references an unknown model`,
			);
		}
		const nextProgress = Math.min(
			project.duration,
			project.progress + trainingProgressRate,
		);
		const progressedBy = nextProgress - project.progress;
		if (progressedBy > 0) {
			facts.push({
				kind: "project_progressed",
				projectId: project.id,
				amount: progressedBy,
				week: context.week,
			});
		}

		if (nextProgress < project.duration) {
			model.status = "training";
			return {
				...project,
				progress: nextProgress,
			};
		}

		const parent =
			model.parentModelId === undefined || model.parentModelId === null
				? undefined
				: nextModels.find((candidate) => candidate.id === model.parentModelId);
		const generated = generateTrueScores(nextRng, model, parent);
		nextRng = generated.rng;
		model.status = "ready";
		model.projectId = null;
		model.trueScores = generated.trueScores;
		model.estimates = generated.estimates;
		completedProjectIds.add(project.id);
		facts.push(
			{
				kind: "project_completed",
				projectId: project.id,
				week: context.week,
			},
			{
				kind: "model_trained",
				modelId: model.id,
				week: context.week,
			},
		);
		return {
			...project,
			teamId: null,
			status: "completed",
			progress: nextProgress,
		};
	});

	const nextState: GameState = {
		...state,
		rng: nextRng,
		compute: {
			...state.compute,
		},
		models: {
			items: nextModels,
			activeModelId: state.models.activeModelId,
		},
		projects: { items: nextProjects },
		teams: {
			items: state.teams.items.map((team) =>
				team.activeProjectId !== null &&
				completedProjectIds.has(team.activeProjectId)
					? { ...team, activeProjectId: null }
					: { ...team },
			),
		},
		warnings: updateComputeShortageWarning(state.warnings, servingStarvation),
	};
	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState, {
		allowNegativeCash: recomputedState.company.cash < 0,
	});
	return { state: recomputedState, facts, pending: [] };
};

function updateComputeShortageWarning(
	warnings: GameState["warnings"],
	servingStarvation: boolean,
): GameState["warnings"] {
	const nextWarnings = warnings.filter(
		(warning) => warning.code !== "compute_shortage",
	);
	if (servingStarvation) {
		nextWarnings.push({ code: "compute_shortage", severity: "warning" });
	}
	return nextWarnings;
}

function cloneProject(project: Project): Project {
	return { ...project };
}

function cloneModel(model: Model): Model {
	return {
		...model,
		...(model.dataMix === undefined ? {} : { dataMix: { ...model.dataMix } }),
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
