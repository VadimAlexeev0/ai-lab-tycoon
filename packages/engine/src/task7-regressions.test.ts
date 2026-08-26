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
			expect.arrayContaining(["evaluate", "launch", "funding", "incident"]),
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
