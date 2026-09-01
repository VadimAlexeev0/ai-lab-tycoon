import type { DecisionChoice, EvaluationKind } from "./components/decisions.js";
import type {
	Model,
	ModelEstimateBand,
	ModelEstimates,
} from "./components/models.js";
import type { Fact } from "./components/reports.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	MODEL_DIMENSIONS,
	type ModelDimension,
} from "./data/model-families.js";
import { assertRunActive } from "./guards.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { ActiveResearchEffects } from "./research-effects.js";
import type { EngineResult, GameState } from "./state.js";
import { appendFactsAsReports } from "./systems/reporting.js";
import { assertEnum, assertIdentifier, assertObject } from "./validation.js";

const EVALUATION_KINDS = ["capability", "safety_reliability"] as const;

type EvaluationRequest = Readonly<{
	modelId: string;
	evaluation: EvaluationKind;
}>;

/** Run a focused evaluation against a ready or operating model. */
export function runEvaluation(
	state: GameState,
	modelId: string,
	evaluation: EvaluationKind,
): EngineResult;
export function runEvaluation(
	state: GameState,
	request: EvaluationRequest,
): EngineResult;
export function runEvaluation(
	state: GameState,
	modelOrRequest: string | EvaluationRequest,
	evaluation?: EvaluationKind,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	const request = normalizeRequest(modelOrRequest, evaluation);
	const result = applyEvaluation(state, request, true);
	const remaining = result.state.decisions.pending.filter(
		(decision) =>
			(decision.kind !== "launch" && decision.kind !== "evaluation") ||
			decision.modelId !== request.modelId,
	);
	const nextState: GameState = {
		...result.state,
		decisions: { pending: remaining },
		queue: {
			...result.state.queue,
			decisionIds: remaining.map((decision) => decision.id),
		},
	};
	const reportedState = appendFactsAsReports(nextState, result.facts);
	assertGameState(reportedState);
	return {
		...result,
		state: reportedState,
		pending: reportedState.decisions.pending.map((decision) => ({
			...decision,
		})),
	};
}

/** Apply an already validated evaluation choice by starting its project. */
export function applyEvaluation(
	state: GameState,
	request: EvaluationRequest,
	appendCommand: boolean,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	const model = state.models.items.find((item) => item.id === request.modelId);
	if (model === undefined) {
		throw new Error(`Cannot evaluate unknown model: ${request.modelId}`);
	}
	if (model.status !== "ready" && model.status !== "launched") {
		throw new Error("Only a ready or launched model can be evaluated");
	}
	if (model.trueScores === undefined || model.estimates === undefined) {
		throw new Error(
			"Model must have true scores and estimates before evaluation",
		);
	}
	const tuning = BALANCE.evaluations[request.evaluation];
	if (state.company.insight < tuning.insightCost) {
		throw new Error(
			`Insufficient Insight for ${request.evaluation} evaluation cost ${tuning.insightCost}`,
		);
	}
	if (state.compute.allocated + tuning.computeCost > state.compute.capacity) {
		throw new Error(
			`Insufficient Compute capacity for ${request.evaluation} evaluation cost ${tuning.computeCost}`,
		);
	}
	if (
		state.projects.items.some(
			(project) =>
				project.kind === "evaluation" &&
				project.modelId === request.modelId &&
				project.evaluation === request.evaluation &&
				project.status !== "cancelled",
		)
	) {
		throw new Error(
			`Model ${request.modelId} already has a ${request.evaluation} evaluation`,
		);
	}
	const team = state.teams.items.find(
		(candidate) => candidate.activeProjectId === null,
	);
	if (team === undefined) {
		throw new Error("An idle team is required to run an evaluation");
	}

	let allocation = allocateId(state, "project");
	const projectId = allocation.id;
	if (appendCommand) {
		allocation = allocateId(allocation.state, "command");
	}
	const commandId = appendCommand ? allocation.id : "";
	const evaluationProject = {
		kind: "evaluation" as const,
		id: projectId,
		teamId: team.id,
		status: "active" as const,
		progress: BALANCE.startingProjectProgress,
		duration: BALANCE.projectProgressPerWeek.evaluation,
		modelId: request.modelId,
		evaluation: request.evaluation,
	};
	const nextState: GameState = {
		...allocation.state,
		company: {
			...allocation.state.company,
			insight: allocation.state.company.insight - tuning.insightCost,
		},
		compute: {
			...allocation.state.compute,
		},
		teams: {
			items: allocation.state.teams.items.map((candidate) =>
				candidate.id === team.id
					? { ...candidate, activeProjectId: projectId }
					: { ...candidate },
			),
		},
		projects: {
			items: [
				...allocation.state.projects.items.map((project) => ({ ...project })),
				evaluationProject,
			],
		},
		models: {
			...allocation.state.models,
			items: allocation.state.models.items.map((candidate) =>
				candidate.id === model.id
					? { ...candidate, projectId }
					: cloneModel(candidate),
			),
		},
		commandLog: appendCommand
			? [
					...allocation.state.commandLog,
					{
						id: commandId,
						kind: "run_evaluation",
						week: state.meta.week,
						modelId: request.modelId,
						evaluation: request.evaluation,
					},
				]
			: allocation.state.commandLog.map((entry) => ({ ...entry })),
	};
	const facts: Fact[] = [
		{
			kind: "resource_changed",
			resource: "insight",
			amount: -tuning.insightCost,
			week: state.meta.week,
		},
		{
			kind: "resource_changed",
			resource: "compute",
			amount: -tuning.computeCost,
			week: state.meta.week,
		},
	];
	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState);
	return {
		state: recomputedState,
		facts,
		pending: nextState.decisions.pending.map((decision) => ({ ...decision })),
	};
}

function normalizeRequest(
	modelOrRequest: string | EvaluationRequest,
	evaluation?: EvaluationKind,
): EvaluationRequest {
	if (typeof modelOrRequest === "string") {
		assertIdentifier(modelOrRequest, "Evaluation model id");
		if (evaluation === undefined) {
			throw new Error("Evaluation kind is required");
		}
		assertEnum(evaluation, EVALUATION_KINDS, "Evaluation kind");
		return { modelId: modelOrRequest, evaluation };
	}
	assertObject(modelOrRequest, "Evaluation request");
	if (!Object.hasOwn(modelOrRequest, "modelId")) {
		throw new Error("Evaluation model id is required");
	}
	if (!Object.hasOwn(modelOrRequest, "evaluation")) {
		throw new Error("Evaluation kind is required");
	}
	assertIdentifier(modelOrRequest.modelId, "Evaluation model id");
	assertEnum(modelOrRequest.evaluation, EVALUATION_KINDS, "Evaluation kind");
	return {
		modelId: modelOrRequest.modelId,
		evaluation: modelOrRequest.evaluation,
	};
}

export function evaluationDimensions(
	evaluation: EvaluationKind,
): readonly ModelDimension[] {
	return dimensionsFor(evaluation);
}

export function completeEvaluationModel(
	model: Model,
	evaluation: EvaluationKind,
	researchEffects?: ActiveResearchEffects,
): { model: Model; coverage: number } {
	if (model.trueScores === undefined || model.estimates === undefined) {
		throw new Error("Model must have scores before evaluation completion");
	}
	const tuning = BALANCE.evaluations[evaluation];
	const emphasis = model.emphasis ?? {
		capability: 0,
		reliability: 0,
		safety: 0,
		efficiency: 0,
	};
	const emphasisBonus =
		evaluation === "safety_reliability"
			? (emphasis.safety + emphasis.reliability) * tuning.safetyEmphasisBonus
			: 0;
	const researchCoverageBonus =
		researchEffects?.evaluationCoverageBonus[evaluation] ?? 0;
	const coverage = Math.min(
		100,
		tuning.coveragePercent + emphasisBonus + researchCoverageBonus,
	);
	const estimates = cloneEstimates(model.estimates);
	for (const dimension of dimensionsFor(evaluation)) {
		estimates[dimension] = narrowBand(
			estimates[dimension],
			model.trueScores[dimension],
			coverage,
		);
	}
	return { model: { ...cloneModel(model), estimates }, coverage };
}

function dimensionsFor(evaluation: EvaluationKind): readonly ModelDimension[] {
	return evaluation === "capability"
		? ["capability", "coding"]
		: ["reliability", "safety"];
}

function narrowBand(
	band: ModelEstimateBand,
	trueScore: number,
	coverage: number,
): ModelEstimateBand {
	const move = (value: number): number =>
		value + Math.trunc(((trueScore - value) * coverage) / 100);
	const estimate = clamp(move(band.estimate), 0, 100);
	const movedLower = clamp(move(band.lower), 0, 100);
	const movedUpper = clamp(move(band.upper), 0, 100);
	return {
		estimate,
		lower: Math.min(movedLower, estimate),
		upper: Math.max(movedUpper, estimate),
	};
}

function cloneEstimates(estimates: ModelEstimates): ModelEstimates {
	return Object.fromEntries(
		MODEL_DIMENSIONS.map((dimension) => [
			dimension,
			{ ...estimates[dimension] },
		]),
	) as ModelEstimates;
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
		...(model.emphasis === undefined
			? {}
			: { emphasis: { ...model.emphasis } }),
		...(model.trueScores === undefined
			? {}
			: { trueScores: { ...model.trueScores } }),
		...(model.estimates === undefined
			? {}
			: { estimates: cloneEstimates(model.estimates) }),
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// Keep this type import exercised without adding a runtime dependency.
type _DecisionChoice = DecisionChoice;
void (undefined as unknown as _DecisionChoice);
