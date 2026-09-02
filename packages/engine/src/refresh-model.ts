import { createModelsState } from "./components/models.js";
import { createProjectsState, type Project } from "./components/projects.js";
import type { Fact } from "./components/reports.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import type { DataMix } from "./data/model-families.js";
import {
	type DataReservationOptions,
	reserveDataForMix,
} from "./data-inventory.js";
import { assertRunActive } from "./guards.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { EngineResult, GameState } from "./state.js";
import { appendFactsAsReports } from "./systems/reporting.js";
import {
	assertExactObject,
	assertIdentifier,
	assertNullableString,
	assertObject,
} from "./validation.js";

const DEFAULT_REFRESH_DATA_MIX: DataMix = {
	general: 50,
	code: 30,
	multimodal: 20,
};

export type ModelRefreshRequest = Readonly<{
	modelId: string;
	dataMix?: DataMix;
	teamId?: string;
}>;

/** Start one explicit, data-backed refresh of a ready or launched model. */
export function refreshModel(state: GameState, modelId: string): EngineResult;
export function refreshModel(
	state: GameState,
	modelId: string,
	dataMix?: DataMix,
	teamId?: string,
): EngineResult;
export function refreshModel(
	state: GameState,
	request: ModelRefreshRequest,
): EngineResult;
export function refreshModel(
	state: GameState,
	requestOrModelId: string | ModelRefreshRequest,
	legacyDataMix?: DataMix,
	legacyTeamId?: string,
): EngineResult {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	assertRunActive(state);
	const request = normalizeRequest(
		requestOrModelId,
		legacyDataMix,
		legacyTeamId,
	);
	const model = state.models.items.find(
		(candidate) => candidate.id === request.modelId,
	);
	if (model === undefined) {
		throw new Error(`Cannot refresh an unknown model: ${request.modelId}`);
	}
	if (model.status !== "ready" && model.status !== "launched") {
		throw new Error("Only a ready or launched model can be refreshed");
	}
	if (model.projectId !== null) {
		throw new Error(`Model ${model.id} already has an active project`);
	}
	if (
		state.projects.items.some(
			(project) =>
				project.kind === "refresh" &&
				project.modelId === model.id &&
				project.status === "active",
		)
	) {
		throw new Error(`Model ${model.id} already has an active refresh`);
	}

	const team = selectIdleTeam(state, request.teamId);
	const dataMix = request.dataMix ?? model.dataMix ?? DEFAULT_REFRESH_DATA_MIX;
	const reservationOptions: DataReservationOptions = {
		minimumFreshness: BALANCE.knowledgeCutoff.refreshMinimumFreshness,
	};
	const dataReservation = reserveDataForMix(state, dataMix, reservationOptions);

	let allocation = allocateId(dataReservation.state, "project");
	const projectId = allocation.id;
	allocation = allocateId(allocation.state, "command");
	const commandId = allocation.id;
	const project: Extract<Project, { kind: "refresh" }> = {
		kind: "refresh",
		id: projectId,
		teamId: team.id,
		modelId: model.id,
		dataMix: { ...dataMix },
		dataAllocation: dataReservation.allocations.map((entry) => ({
			...entry,
		})),
		status: "active",
		progress: BALANCE.startingProjectProgress,
		duration: BALANCE.knowledgeCutoff.refreshDuration,
	};
	const nextState: GameState = {
		...allocation.state,
		teams: {
			items: allocation.state.teams.items.map((candidate) =>
				candidate.id === team.id
					? { ...candidate, activeProjectId: projectId }
					: { ...candidate },
			),
		},
		projects: createProjectsState([
			...allocation.state.projects.items,
			project,
		]),
		models: createModelsState(
			allocation.state.models.items.map((candidate) =>
				candidate.id === model.id ? { ...candidate, projectId } : candidate,
			),
			allocation.state.models.activeModelId,
		),
		commandLog: [
			...allocation.state.commandLog,
			{
				id: commandId,
				kind: "refresh_model",
				week: state.meta.week,
				modelId: model.id,
				projectId,
				teamId: team.id,
				dataMix: { ...dataMix },
			},
		],
	};
	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	const dataAmount = dataReservation.allocations.reduce(
		(total, entry) => total + entry.amount,
		0,
	);
	const facts: Fact[] = [
		{
			kind: "model_refresh_started",
			modelId: model.id,
			projectId,
			dataAmount,
			compute: BALANCE.knowledgeCutoff.refreshCompute,
			week: state.meta.week,
		},
	];
	const reportedState = appendFactsAsReports(recomputedState, facts);
	assertGameState(reportedState, {
		allowNegativeCash: reportedState.company.cash < 0,
	});
	return {
		state: reportedState,
		facts,
		pending: reportedState.decisions.pending.map((decision) => ({
			...decision,
		})),
	};
}

function normalizeRequest(
	requestOrModelId: string | ModelRefreshRequest,
	legacyDataMix?: DataMix,
	legacyTeamId?: string,
): ModelRefreshRequest {
	if (typeof requestOrModelId === "string") {
		assertIdentifier(requestOrModelId, "Refresh model id");
		if (legacyTeamId !== undefined)
			assertIdentifier(legacyTeamId, "Refresh team id");
		return {
			modelId: requestOrModelId,
			...(legacyDataMix === undefined ? {} : { dataMix: legacyDataMix }),
			...(legacyTeamId === undefined ? {} : { teamId: legacyTeamId }),
		};
	}
	assertObject(requestOrModelId, "Model refresh request");
	const keys = ["modelId"];
	if (Object.hasOwn(requestOrModelId, "dataMix")) keys.push("dataMix");
	if (Object.hasOwn(requestOrModelId, "teamId")) keys.push("teamId");
	assertExactObject(requestOrModelId, keys, "model refresh request");
	assertIdentifier(requestOrModelId.modelId, "Refresh model id");
	if (Object.hasOwn(requestOrModelId, "teamId")) {
		assertNullableString(requestOrModelId.teamId, "Refresh team id");
		if (
			requestOrModelId.teamId !== undefined &&
			requestOrModelId.teamId !== null
		) {
			assertIdentifier(requestOrModelId.teamId, "Refresh team id");
		}
	}
	return requestOrModelId;
}

function selectIdleTeam(
	state: GameState,
	requestedTeamId: string | undefined,
): { id: string } {
	const team =
		requestedTeamId === undefined
			? state.teams.items.find(
					(candidate) => candidate.activeProjectId === null,
				)
			: state.teams.items.find((candidate) => candidate.id === requestedTeamId);
	if (team === undefined) {
		throw new Error(
			requestedTeamId === undefined
				? "Model refresh requires an idle team"
				: `Unknown team for model refresh: ${requestedTeamId}`,
		);
	}
	if (team.activeProjectId !== null) {
		throw new Error(`Team ${team.id} must be idle before model refresh`);
	}
	return team;
}
