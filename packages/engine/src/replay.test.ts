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
import type { CommandLogEntry, GameState } from "./state.js";

const SPEC = {
	name: "Replay-1",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function resolveNonModelBlockers(state: GameState): GameState {
	let current = state;
	let guard = 0;
	while (
		current.decisions.pending.some((decision) => decision.blocking) &&
		guard < 12
	) {
		guard += 1;
		const decision = current.decisions.pending[0];
		if (decision === undefined) break;
		if (decision.kind === "funding") {
			current = applyDecision(current, {
				kind: "funding",
				decisionId: decision.id,
				round: decision.round,
				accept: true,
			}).state;
		} else if (decision.kind === "incident") {
			current = applyDecision(current, {
				kind: "incident",
				decisionId: decision.id,
				response: "repair",
			}).state;
		} else {
			// Evaluation / launch decisions for a ready model: leave them.
			break;
		}
	}
	return current;
}

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

	// Bank Insight to >= 2 by advancing with the team idle (research gain is
	// 1/week with no spend; assigning a research node would cost 1 and net
	// zero). The team is idle here and no model is ready yet, so advanceWeek
	// generates no blocking decisions.
	for (let index = 0; index < 6 && state.company.insight < 2; index += 1) {
		state = advanceWeek(state).state;
	}

	state = designModel(state, SPEC).state;

	// Train until the model is ready. No blocking decisions appear while a
	// model is designing/training (no products, no incidents, funding is
	// non-blocking), so plain advanceWeek is safe.
	for (let index = 0; index < 8; index += 1) {
		state = resolveNonModelBlockers(state);
		if (state.models.items.some((m) => m.status === "ready")) break;
		state = advanceWeek(state).state;
	}

	const model = state.models.items.find(
		(candidate) => candidate.status === "ready",
	);
	if (model === undefined) throw new Error("Expected a ready replay model");
	if (state.company.insight < 2) {
		throw new Error("Expected Insight >= 2 for the direct evaluation");
	}

	// Direct-command segment. runEvaluation clears every launch/evaluation
	// decision for this model, so no blocking decisions remain; call
	// launchProduct immediately afterwards (no advanceWeek in between) so the
	// decision system does not regenerate them.
	const evaluation = runEvaluation(state, model.id, "capability");
	state = evaluation.state;
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
	// Bank Insight to >= 2 so productsSystem will emit an evaluation decision
	// for the ready model (it stays silent when insight/team/compute are short).
	for (let index = 0; index < 6 && state.company.insight < 2; index += 1) {
		state = advanceWeek(state).state;
	}
	state = designModel(state, SPEC).state;
	for (let index = 0; index < 8; index += 1) {
		if (
			state.decisions.pending.some((decision) => decision.kind === "evaluation")
		) {
			return state;
		}
		// Clear non-model blockers so advanceWeek can proceed; launch
		// decisions appear together with evaluation (same week the model
		// becomes ready), so we return before ever hitting one.
		state = resolveNonModelBlockers(state);
		if (
			state.decisions.pending.some((decision) => decision.kind === "evaluation")
		) {
			return state;
		}
		if (state.models.items.some((m) => m.status === "ready")) {
			// The model is ready and a launch/evaluation decision is expected
			// next tick; advancing now would be blocked. Keep looping.
			return state;
		}
		state = advanceWeek(state).state;
	}
	throw new Error("Expected an evaluation decision");
}

describe("command-log replay", () => {
	// ~10 weeks of full-state validation plus a replay; generous for loaded CI.
	it("round-trips every direct command kind through the public transitions", {
		timeout: 60_000,
	}, () => {
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

	it("round-trips the shelve apply-decision variant", {
		timeout: 60_000,
	}, () => {
		const offered = evaluationDecisionRun();
		const evaluation = offered.decisions.pending.find(
			(item) => item.kind === "evaluation",
		);
		if (evaluation === undefined || evaluation.kind !== "evaluation") {
			throw new Error("Expected an evaluation decision");
		}
		// Shelving an evaluation decision declines the whole surfaced card: it
		// clears every sibling launch/evaluation decision for that model and
		// leaves the ready model ready (it was not the sole remaining option),
		// so no zombie blocking decisions remain to deadlock Advance Week.
		const original = applyDecision(offered, {
			kind: "shelve",
			decisionId: evaluation.id,
		});
		expect(original.state.models.items.at(-1)?.status).toBe("ready");
		expect(
			original.state.decisions.pending.some(
				(decision) =>
					(decision.kind === "launch" || decision.kind === "evaluation") &&
					decision.modelId === "model_001",
			),
		).toBe(false);
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

	it("requires a start_run anchor and rejects later duplicates", () => {
		expect(() => replayCommandLog([])).toThrow(/start_run/i);

		const withoutAnchor: CommandLogEntry[] = [
			{ id: "command_001", kind: "advance_week", week: 1 },
		];
		expect(() => replayCommandLog(withoutAnchor)).toThrow(/start_run/i);

		const start = startRun({ companyName: "Acme Labs" }, 42);
		const anchor = start.commandLog[0];
		if (anchor === undefined) throw new Error("Expected the start anchor");
		const duplicateStart: CommandLogEntry[] = [
			anchor,
			{ ...anchor, id: "command_002" },
		];
		expect(() => replayCommandLog(duplicateStart)).toThrow(/only one/i);
	});

	it("throws a replay mismatch when the log drifts from its own commands", () => {
		const start = startRun({ companyName: "Acme Labs" }, 42);
		const anchor = start.commandLog[0];
		if (anchor === undefined) throw new Error("Expected the start anchor");
		const drifted: CommandLogEntry[] = [
			anchor,
			{ id: "command_002", kind: "advance_week", week: 1 },
			{ id: "command_003", kind: "advance_week", week: 1 },
		];
		expect(() => replayCommandLog(drifted)).toThrow(/mismatch/i);
	});

	it("replays advance commands carrying incident roll fixtures byte-for-byte", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const advanced = advanceWeek(state, { incidentRolls: [7, 7, 7, 7, 7, 7] });
		const entry = advanced.state.commandLog.at(-1);
		if (entry === undefined || entry.kind !== "advance_week") {
			throw new Error("Expected an advance command");
		}
		expect(entry.incidentRolls).toEqual([7, 7, 7, 7, 7, 7]);

		const replayed = replayCommandLog(advanced.state.commandLog);
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(advanced.state));
	});

	it("accepts a versioned envelope and compares reordered structures canonically", () => {
		const original = advanceWeek(
			startRun({ companyName: "Canonical Labs" }, 42),
		).state;
		const reordered = original.commandLog.map(
			(entry) => reverseObjectKeys(entry) as CommandLogEntry,
		);

		const replayed = replayCommandLog(
			{
				schemaVersion: 1,
				commands: reordered,
			},
			{ expectedState: original },
		);

		expect(replayed).toEqual(original);

		const alteredExpected = JSON.parse(JSON.stringify(original)) as GameState;
		alteredExpected.company.cash += 1;
		expect(() =>
			replayCommandLog(
				{ schemaVersion: 1, commands: reordered },
				{ expectedState: alteredExpected },
			),
		).toThrow(/expectedState|state mismatch/i);
	});

	it("rejects unsupported envelope versions, non-sequential ids, and regressing weeks", () => {
		const state = advanceWeek(
			startRun({ companyName: "Canonical Labs" }, 42),
		).state;
		const log = state.commandLog;

		expect(() =>
			replayCommandLog({ schemaVersion: 999, commands: log }),
		).toThrow(/schema|version/i);

		const skippedId = [...log];
		const second = skippedId[1];
		if (second === undefined) throw new Error("Expected a second command");
		skippedId[1] = { ...second, id: "command_003" };
		expect(() => replayCommandLog(skippedId)).toThrow(
			/sequential|command.*id/i,
		);

		const regressingWeeks: CommandLogEntry[] = [
			log[0] as CommandLogEntry,
			{ id: "command_002", kind: "advance_week", week: 2 },
			{ id: "command_003", kind: "advance_week", week: 1 },
		];
		expect(() => replayCommandLog(regressingWeeks)).toThrow(
			/non-decreasing|monotonic|week/i,
		);
	});
});

function reverseObjectKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseObjectKeys);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.reverse()
				.map(([key, child]) => [key, reverseObjectKeys(child)]),
		);
	}
	return value;
}
