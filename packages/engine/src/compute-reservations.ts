import { BALANCE } from "./data/balance.js";
import type { GameState } from "./state.js";

export type ComputeReservations = Readonly<{
	trainingDemand: number;
	servingDemand: number;
	evaluationDemand: number;
	totalDemand: number;
	allocated: number;
}>;

/**
 * Recompute reservations from their owning active entities. `allocated` is the
 * capacity reservation actually held; demand remains visible even when the
 * world is overloaded so incidents can explain the pressure.
 */
export function computeReservations(state: GameState): ComputeReservations {
	const trainingDemand = state.projects.items.reduce((total, project) => {
		if (project.kind !== "training" || project.status !== "active")
			return total;
		const model = state.models.items.find(
			(candidate) => candidate.id === project.modelId,
		);
		return model?.tier === undefined
			? total
			: total + BALANCE.modelTiers[model.tier].trainingCompute;
	}, 0);
	const servingDemand = state.products.items.reduce(
		(total, product) =>
			total +
			(product.status === "operating" ? (product.servingDemand ?? 0) : 0),
		0,
	);
	const evaluationDemand = state.projects.items.reduce((total, project) => {
		if (project.kind !== "evaluation" || project.status !== "active")
			return total;
		return total + BALANCE.evaluations[project.evaluation].computeCost;
	}, 0);
	const totalDemand = trainingDemand + servingDemand + evaluationDemand;
	return {
		trainingDemand,
		servingDemand,
		evaluationDemand,
		totalDemand,
		allocated: Math.min(state.compute.capacity, totalDemand),
	};
}

export function withRecomputedCompute(state: GameState): GameState["compute"] {
	const reservations = computeReservations(state);
	return {
		...state.compute,
		trainingDemand: reservations.trainingDemand,
		servingDemand: reservations.servingDemand,
		allocated: reservations.allocated,
	};
}

/**
 * Apply the permanent compute capacity supplied by a completed infrastructure
 * project. The project system owns completion detection and should call this
 * exactly once after it marks the project completed.
 */
export function applyInfrastructureGain(
	state: GameState,
	projectId: string,
): GameState {
	const project = state.projects.items.find((item) => item.id === projectId);
	if (project === undefined) {
		throw new Error(
			`Cannot apply infrastructure gain to unknown project: ${projectId}`,
		);
	}
	if (project.kind !== "infrastructure" || project.target !== "compute") {
		throw new Error(
			`Project ${projectId} is not a compute infrastructure project`,
		);
	}
	if (project.status !== "completed" || project.progress !== project.duration) {
		throw new Error(
			`Infrastructure project ${projectId} must be completed before its gain is applied`,
		);
	}

	const capacity = state.compute.capacity + BALANCE.infrastructureCapacityGain;
	if (!Number.isSafeInteger(capacity)) {
		throw new Error("Compute capacity exceeded the safe integer limit");
	}
	const nextState = {
		...state,
		compute: {
			...state.compute,
			capacity,
		},
	};
	return {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
}
