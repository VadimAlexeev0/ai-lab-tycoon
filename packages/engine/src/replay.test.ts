import { describe, expect, it } from "vitest";
import {
	advanceWeek,
	applyDecision,
	assertGameState,
	assignProject,
	cancelProject,
	designModel,
	launchProduct,
	runEvaluation,
	selectAvailableProjects,
	startRun,
} from "./index.js";
import { replayCommandLog } from "./replay.js";
import type { GameState } from "./state.js";

const SPEC = {
	name: "Replay-1",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function directCommandRun(): GameState {
	let state = startRun({ companyName: "Replay Labs" }, 9);

	// Gain the first Insight, then exercise both project command forms before
	// taking the model path through design, training, evaluation, and launch.
	state = advanceWeek(state).state;
	const team = state.teams.items[0];
	const infrastructure = selectAvailableProjects(state).find(
		(project) =>
			project.kind === "research" &&
			project.nodeId === "text_infrastructure_compute",
	);
	if (team === undefined || infrastructure === undefined) {
		throw new Error("Expected an opening infrastructure project");
	}
	state = assignProject(state, team.id, infrastructure.id).state;
	state = cancelProject(state, team.id, infrastructure.id).state;
	state = advanceWeek(state).state;

	const principles = selectAvailableProjects(state).find(
		(project) =>
			project.kind === "research" &&
			project.nodeId === "text_models_principles",
	);
	if (principles === undefined)
		throw new Error("Expected the principles project");
	state = assignProject(state, team.id, principles.id).state;
	state = advanceWeek(state).state;

	state = designModel(state, SPEC).state;
	for (let index = 0; index < 6; index += 1) {
		if (
			state.decisions.pending.some((decision) => decision.kind === "evaluation")
		) {
			break;
		}
		state = advanceWeek(state).state;
	}

	const model = state.models.items.find(
		(candidate) => candidate.status === "ready",
	);
	if (model === undefined) throw new Error("Expected a ready replay model");
	const evaluation = runEvaluation(state, model.id, "capability");
	state = evaluation.state;
	state = advanceWeek(state).state;
	state = launchProduct(state, model.id, "chat").state;
	return state;
}

function evaluationDecisionRun(): GameState {
	let state = startRun({ companyName: "Shelve Labs" }, 9);
	state = advanceWeek(state).state;
	const team = state.teams.items[0];
	const project = selectAvailableProjects(state).find(
		(item) =>
			item.kind === "research" && item.nodeId === "text_models_principles",
	);
	if (team === undefined || project === undefined) {
		throw new Error("Expected the opening research project");
	}
	state = assignProject(state, team.id, project.id).state;
	state = advanceWeek(state).state;
	state = designModel(state, SPEC).state;
	for (let index = 0; index < 8; index += 1) {
		if (
			state.decisions.pending.some((decision) => decision.kind === "evaluation")
		) {
			return state;
		}
		state = advanceWeek(state).state;
	}
	throw new Error("Expected an evaluation decision");
}

describe("command-log replay", () => {
	it("round-trips every direct command kind through the public transitions", () => {
		const original = directCommandRun();
		const kinds = new Set(original.commandLog.map((entry) => entry.kind));
		expect(kinds).toEqual(
			new Set([
				"start_run",
				"advance_week",
				"assign_project",
				"cancel_project",
				"design_model",
				"run_evaluation",
				"launch_product",
			]),
		);

		const replayed = replayCommandLog(original.commandLog);
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(original));
		expect(replayed.commandLog).toEqual(original.commandLog);
	});

	it("round-trips the shelve apply-decision variant", () => {
		const offered = evaluationDecisionRun();
		const decision = offered.decisions.pending.find(
			(item) => item.kind === "evaluation",
		);
		if (decision === undefined || decision.kind !== "evaluation") {
			throw new Error("Expected an evaluation decision");
		}
		const original = applyDecision(offered, {
			kind: "shelve",
			decisionId: decision.id,
		});
		expect(original.state.models.items.at(-1)?.status).toBe("shelved");
		expect(original.state.commandLog.at(-1)?.kind).toBe("apply_decision");

		const replayed = replayCommandLog(original.state.commandLog);
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(original.state));
	});

	it("validates replay relationships for evaluation models and launch products", () => {
		const original = directCommandRun();
		const unknownProduct = JSON.parse(JSON.stringify(original)) as GameState;
		const launch = unknownProduct.commandLog.at(-1);
		if (launch === undefined || launch.kind !== "launch_product") {
			throw new Error("Expected a direct launch command");
		}
		launch.productId = "product_404";
		expect(() => assertGameState(unknownProduct)).toThrow(/unknown product/i);

		const mismatchedChannel = JSON.parse(JSON.stringify(original)) as GameState;
		const mismatchedLaunch = mismatchedChannel.commandLog.at(-1);
		if (
			mismatchedLaunch === undefined ||
			mismatchedLaunch.kind !== "launch_product"
		) {
			throw new Error("Expected a direct launch command");
		}
		mismatchedLaunch.channel = "developer_api";
		expect(() => assertGameState(mismatchedChannel)).toThrow(
			/match.*channel|channel/i,
		);

		const ineligibleModel = JSON.parse(JSON.stringify(original)) as GameState;
		const evaluation = ineligibleModel.commandLog.find(
			(entry) => entry.kind === "run_evaluation",
		);
		if (evaluation === undefined || evaluation.kind !== "run_evaluation") {
			throw new Error("Expected a direct evaluation command");
		}
		const model = ineligibleModel.models.items.find(
			(candidate) => candidate.id === evaluation.modelId,
		);
		if (model === undefined) throw new Error("Expected the evaluated model");
		model.status = "designing";
		expect(() => assertGameState(ineligibleModel)).toThrow(/non-eligible/i);
	});
});
