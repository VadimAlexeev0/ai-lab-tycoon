import { describe, expect, it } from "vitest";
import type { AdvanceWeekOptions } from "./advance-week.js";
import { WEEKLY_SYSTEMS } from "./advance-week.js";
import type { PendingDecision } from "./components/decisions.js";
import type { Fact } from "./components/reports.js";
import {
	advanceWeek,
	applyDecision,
	assignProject,
	designModel,
	selectAvailableProjects,
	startRun,
} from "./index.js";
import { replayCommandLog } from "./replay.js";
import type { GameState } from "./state.js";

const TEXT_SPEC = {
	name: "Aurora-1",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

const MULTIMODAL_SPEC = {
	name: "Aurora-Vision",
	family: "multimodal" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 40, code: 20, multimodal: 40 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function lifecycleState(status: "ready" | "launched" = "ready"): GameState {
	const state = startRun({ companyName: "Lifecycle Labs" }, 42);
	state.meta.era = "assistant";
	state.research.currentEra = "assistant";
	const textPrinciples = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (textPrinciples === undefined) throw new Error("Expected text principles");
	textPrinciples.status = "completed";
	const textKeystone = state.research.nodes.find(
		(node) => node.id === "text_models_keystone",
	);
	if (textKeystone === undefined) throw new Error("Expected text keystone");
	textKeystone.status = "completed";
	state.company.cash = 1_000;
	state.company.hype = 100;
	state.company.trust = 100;
	state.company.insight = 10;
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status,
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 100,
				coding: 100,
				reliability: 100,
				safety: 100,
				efficiency: 100,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 100, lower: 80, upper: 100 },
				coding: { estimate: 100, lower: 80, upper: 100 },
				reliability: { estimate: 100, lower: 80, upper: 100 },
				safety: { estimate: 100, lower: 80, upper: 100 },
				efficiency: { estimate: 100, lower: 80, upper: 100 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	return state;
}

function withModelDecisions(
	state: GameState,
	decisions: PendingDecision[],
): GameState {
	return {
		...state,
		decisions: { pending: decisions },
		queue: { ...state.queue, decisionIds: decisions.map((item) => item.id) },
	};
}

type GoldenEvent = {
	command: string;
	facts: Fact[];
	pending: PendingDecision[];
};

type GoldenRun = {
	state: GameState;
	events: GoldenEvent[];
};

function record(
	events: GoldenEvent[],
	command: string,
	facts: Fact[],
	pending: PendingDecision[],
): void {
	events.push({
		command,
		facts: facts.map((fact) => ({ ...fact })),
		pending: pending.map((decision) => ({ ...decision })),
	});
}

function hasIncident(events: readonly GoldenEvent[]): boolean {
	return events.some((event) =>
		event.facts.some((fact) => fact.kind === "incident_occurred"),
	);
}

function settleWeek(input: GameState, events: GoldenEvent[]): GameState {
	const canForceIncident = input.products.items.some(
		(product) =>
			product.status === "operating" &&
			(product.cumulativeRevenue ?? 0) >= 1_000,
	);
	const options: AdvanceWeekOptions =
		canForceIncident && !hasIncident(events) ? { incidentRolls: [0] } : {};
	const advanced = advanceWeek(input, options);
	record(events, "advance_week", advanced.facts, advanced.pending);
	let state = advanced.state;

	while (state.decisions.pending.length > 0) {
		const decision = state.decisions.pending[0];
		if (decision === undefined) break;
		const choice = choiceFor(decision);
		const resolved = applyDecision(state, choice);
		record(events, "apply_decision", resolved.facts, resolved.pending);
		state = resolved.state;
	}
	return state;
}

function choiceFor(decision: PendingDecision) {
	switch (decision.kind) {
		case "evaluation":
			return {
				kind: "evaluate" as const,
				decisionId: decision.id,
				evaluation: decision.evaluation,
			};
		case "incident":
			return {
				kind: "incident" as const,
				decisionId: decision.id,
				response: "disclose" as const,
			};
		case "launch":
			return {
				kind: "launch" as const,
				decisionId: decision.id,
				channel: decision.channel ?? "chat",
			};
		case "funding":
			return {
				kind: "funding" as const,
				decisionId: decision.id,
				round: decision.round,
				accept: true,
			};
	}
}

function completeResearch(
	input: GameState,
	nodeId: string,
	events: GoldenEvent[],
): GameState {
	let state = input;
	for (let guard = 0; guard < 100; guard += 1) {
		const node = state.research.nodes.find((item) => item.id === nodeId);
		if (node?.status === "completed") return state;

		const project = selectAvailableProjects(state).find(
			(item) => item.kind === "research" && item.nodeId === nodeId,
		);
		if (project === undefined) {
			state = settleWeek(state, events);
			continue;
		}
		const team = state.teams.items.find(
			(item) => item.activeProjectId === null,
		);
		const researchNode = state.research.nodes.find(
			(item) => item.id === nodeId,
		);
		if (team === undefined || researchNode === undefined) {
			throw new Error(`No idle team or research node for ${nodeId}`);
		}
		if (state.company.insight < researchNode.insightCost) {
			state = settleWeek(state, events);
			continue;
		}

		const assigned = assignProject(state, team.id, project.id);
		record(events, "assign_project", assigned.facts, assigned.pending);
		state = assigned.state;
		state = settleWeek(state, events);
	}
	throw new Error(`Research node did not complete: ${nodeId}`);
}

function runGolden(seed: number): GoldenRun {
	const events: GoldenEvent[] = [];
	let state = startRun({ companyName: "Acme Labs" }, seed);

	state = completeResearch(state, "text_models_principles", events);
	state = designModel(state, TEXT_SPEC).state;

	for (let guard = 0; guard < 30; guard += 1) {
		if (
			state.products.items.some((product) => product.status === "operating")
		) {
			break;
		}
		state = settleWeek(state, events);
	}
	if (!state.products.items.some((product) => product.status === "operating")) {
		throw new Error("The text model did not reach a live product");
	}

	for (const nodeId of [
		"text_models_keystone",
		"assistant_models_reasoning",
		"assistant_models_tool_use",
		"assistant_models_keystone",
		"multimodal_models_fusion",
	]) {
		state = completeResearch(state, nodeId, events);
	}

	state = designModel(state, MULTIMODAL_SPEC).state;
	for (let guard = 0; guard < 30; guard += 1) {
		if (state.terminal.frontierReached) break;
		state = settleWeek(state, events);
	}

	for (let index = 0; index < 3; index += 1) {
		state = settleWeek(state, events);
	}
	if (state.terminal.status !== "active") {
		throw new Error("The golden run must remain active in the sandbox");
	}
	return { state, events };
}

describe("Task 7 integration and replay regressions", () => {
	it("shelving one channel on a launched model clears model siblings without shelving it", () => {
		const state = lifecycleState("launched");
		state.models.activeModelId = "model_001";
		state.compute.servingDemand = 10;
		state.compute.allocated = 10;
		state.products.items = [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_001",
				status: "operating",
				users: 10,
				lastRevenue: 0,
				cumulativeRevenue: 0,
				servingDemand: 10,
				effectiveQuality: 100,
			},
		];
		const offered = withModelDecisions(state, [
			{
				kind: "launch",
				id: "decision_001",
				modelId: "model_001",
				channel: "developer_api",
				blocking: true,
			},
			{
				kind: "launch",
				id: "decision_002",
				modelId: "model_001",
				channel: "enterprise",
				blocking: true,
			},
		]);

		const result = applyDecision(offered, {
			kind: "shelve",
			decisionId: "decision_001",
		});

		expect(result.state.models.items[0]?.status).toBe("launched");
		expect(result.state.models.activeModelId).toBe("model_001");
		expect(result.state.products.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					channel: "chat",
					status: "operating",
				}),
			]),
		);
		expect(result.state.decisions.pending).toEqual([]);
		expect(result.state.queue.decisionIds).toEqual([]);
	});

	it("keeps a ready model when shelving one of several model options", () => {
		const offered = withModelDecisions(lifecycleState(), [
			{
				kind: "launch",
				id: "decision_001",
				modelId: "model_001",
				channel: "chat",
				blocking: true,
			},
			{
				kind: "evaluation",
				id: "decision_002",
				modelId: "model_001",
				evaluation: "capability",
				blocking: true,
			},
		]);

		const result = applyDecision(offered, {
			kind: "shelve",
			decisionId: "decision_001",
		});

		expect(result.state.models.items[0]?.status).toBe("ready");
		expect(result.state.decisions.pending).toEqual([]);
	});

	it("shelves a ready model on its last option and clears a stale active model", () => {
		const state = lifecycleState();
		state.models.activeModelId = "model_001";
		const offered = withModelDecisions(state, [
			{
				kind: "launch",
				id: "decision_001",
				modelId: "model_001",
				channel: "chat",
				blocking: true,
			},
		]);

		const result = applyDecision(offered, {
			kind: "shelve",
			decisionId: "decision_001",
		});

		expect(result.state.models.items[0]).toMatchObject({
			status: "shelved",
			projectId: null,
		});
		expect(result.state.models.activeModelId).toBeNull();
		expect(result.state.decisions.pending).toEqual([]);
	});

	it("clears sibling launch choices when evaluation is selected", () => {
		const offered = withModelDecisions(lifecycleState(), [
			{
				kind: "evaluation",
				id: "decision_001",
				modelId: "model_001",
				evaluation: "capability",
				blocking: true,
			},
			{
				kind: "launch",
				id: "decision_002",
				modelId: "model_001",
				channel: "chat",
				blocking: true,
			},
		]);

		const result = applyDecision(offered, {
			kind: "evaluate",
			decisionId: "decision_001",
			evaluation: "capability",
		});

		expect(result.state.decisions.pending).toEqual([]);
		expect(result.pending).toEqual(result.state.decisions.pending);
	});

	it("does not re-offer blocking launches while a selected evaluation is active", () => {
		const offered = withModelDecisions(lifecycleState(), [
			{
				kind: "evaluation",
				id: "decision_001",
				modelId: "model_001",
				evaluation: "capability",
				blocking: true,
			},
		]);
		const selected = applyDecision(offered, {
			kind: "evaluate",
			decisionId: "decision_001",
			evaluation: "capability",
		});
		const evaluation = selected.state.projects.items.find(
			(project) => project.kind === "evaluation",
		);
		if (evaluation === undefined)
			throw new Error("Expected evaluation project");
		evaluation.duration = 2;

		const advanced = advanceWeek(selected.state);

		expect(
			advanced.pending.filter(
				(decision) =>
					(decision.kind === "launch" || decision.kind === "evaluation") &&
					decision.modelId === "model_001",
			),
		).toEqual([]);
	});

	it("clears sibling evaluations when a launch is selected", () => {
		const offered = withModelDecisions(lifecycleState(), [
			{
				kind: "evaluation",
				id: "decision_001",
				modelId: "model_001",
				evaluation: "capability",
				blocking: true,
			},
			{
				kind: "launch",
				id: "decision_002",
				modelId: "model_001",
				channel: "chat",
				blocking: true,
			},
		]);

		const result = applyDecision(offered, {
			kind: "launch",
			decisionId: "decision_002",
			channel: "chat",
		});

		expect(
			result.state.decisions.pending.some(
				(decision) =>
					decision.kind === "evaluation" && decision.modelId === "model_001",
			),
		).toBe(false);
	});

	it("keeps the documented weekly system order", () => {
		expect(WEEKLY_SYSTEMS.map(({ phase }) => phase)).toEqual([
			"upkeep",
			"projects",
			"research",
			"training",
			"products",
			"rivals",
			"funding",
			"incidents",
			"terminal",
			"decisions",
			"reporting",
		]);
	});

	// ~37 weeks of full-state validation per system; generous so a loaded
	// machine cannot flake the golden path.
	it("runs the natural public-command path through the first multimodal launch", {
		timeout: 300_000,
	}, () => {
		const first = runGolden(42);
		const second = runGolden(42);

		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(first.state.terminal.status).toBe("active");
		expect(first.state.terminal.frontierReached).toBe(true);
		expect(
			first.state.models.items.some(
				(model) => model.family === "multimodal" && model.status === "launched",
			),
		).toBe(true);
		const multimodalModel = first.state.models.items.find(
			(model) => model.family === "multimodal",
		);
		expect(multimodalModel).toBeDefined();
		expect(
			first.state.products.items.some(
				(product) =>
					product.modelId === multimodalModel?.id && product.channel === "chat",
			),
		).toBe(true);
		const facts = first.events.flatMap((event) => event.facts);
		expect(
			facts.filter((fact) => fact.kind === "milestone_reached"),
		).toHaveLength(1);
		expect(facts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "model_trained" }),
				expect.objectContaining({ kind: "product_launched" }),
				expect.objectContaining({ kind: "incident_occurred" }),
			]),
		);
		const commandKinds = first.state.commandLog.map((entry) => entry.kind);
		expect(commandKinds).toContain("design_model");
		const decisionKinds = first.state.commandLog
			.filter((entry) => entry.kind === "apply_decision")
			.map((entry) => entry.choice.kind);
		expect(decisionKinds).toEqual(
			expect.arrayContaining(["launch", "funding", "incident"]),
		);
	});

	it("replays the golden public command log byte-for-byte", {
		timeout: 300_000,
	}, () => {
		const original = runGolden(42);
		const replayed = replayCommandLog(original.state.commandLog);
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(original.state));
		expect(replayed.commandLog).toEqual(original.state.commandLog);
	});
});
