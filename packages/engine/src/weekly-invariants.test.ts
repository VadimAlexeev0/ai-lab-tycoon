import { describe, expect, it } from "vitest";
import { advanceWeek } from "./advance-week.js";
import type { PendingDecision } from "./components/decisions.js";
import { BALANCE } from "./data/balance.js";
import {
	applyDecision,
	assignProject,
	buyCompute,
	designModel,
	selectAvailableProjects,
	startRun,
} from "./index.js";
import { assertGameState } from "./invariants.js";
import { replayCommandLog } from "./replay.js";
import type { GameState } from "./state.js";
import { fundingSystem } from "./systems/funding.js";

const TEXT_SPEC = {
	name: "Aurora-1",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

/**
 * Every weekly advance uses miss-forcing incident rolls so the long run is
 * fully deterministic and cannot be ended by an unforced incident. Incident
 * behavior itself is exercised in the dedicated incident suites.
 */
const MISS_ROLLS: readonly number[] = [99, 99, 99, 99, 99, 99];

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
				response: "repair" as const,
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

function advance(input: GameState): GameState {
	return advanceWeek(input, { incidentRolls: MISS_ROLLS }).state;
}

function completePrinciples(state: GameState): GameState {
	let nextState = state;
	for (let guard = 0; guard < 5; guard += 1) {
		const node = nextState.research.nodes.find(
			(item) => item.id === "text_models_principles",
		);
		if (node?.status === "completed") return nextState;
		if (nextState.meta.week === 1 && nextState.company.insight < 1) {
			nextState = advance(nextState);
			continue;
		}
		const team = nextState.teams.items.find(
			(item) => item.activeProjectId === null,
		);
		const project = selectAvailableProjects(nextState).find(
			(item) =>
				item.kind === "research" && item.nodeId === "text_models_principles",
		);
		if (team !== undefined && project !== undefined) {
			nextState = assignProject(nextState, team.id, project.id).state;
			continue;
		}
		nextState = advance(nextState);
	}
	throw new Error("Principles research did not complete");
}

function reachLaunch(): GameState {
	let state = completePrinciples(startRun({ companyName: "Acme Labs" }, 42));
	state = designModel(state, TEXT_SPEC).state;
	for (let guard = 0; guard < 8; guard += 1) {
		state = advance(state);
		while (state.decisions.pending.length > 0) {
			const decision = state.decisions.pending[0];
			if (decision === undefined) break;
			state = applyDecision(state, choiceFor(decision)).state;
		}
		if (
			state.products.items.some((product) => product.status === "operating")
		) {
			return state;
		}
	}
	throw new Error("The text model did not reach a live product");
}

const LONG_WEEKS = 50;

function longRun(): { state: GameState; weekSnapshots: string[] } {
	// The new serving cap intentionally pauses growth at saturation. Purchase
	// capacity through the public command so this invariant fixture remains a
	// sustainable 50+ week replay rather than becoming a cash-loss test.
	let state = buyCompute(reachLaunch()).state;
	const weekSnapshots: string[] = [];
	for (let week = 0; week < LONG_WEEKS; week += 1) {
		if (state.terminal.status === "lost") break;
		state = advance(state);
		weekSnapshots.push(JSON.stringify(state));
		while (state.decisions.pending.length > 0) {
			const decision = state.decisions.pending[0];
			if (decision === undefined) break;
			state = applyDecision(state, choiceFor(decision)).state;
			if (state.terminal.status === "lost") break;
		}
	}
	return { state, weekSnapshots };
}

describe("long-run weekly invariants", () => {
	// Each advance re-validates the full growing state ~15 times; generous
	// so heavily loaded CI machines cannot flake the golden path.
	it("is deterministic over 50+ weeks and keeps every cross-component invariant", {
		timeout: 400_000,
	}, () => {
		const first = longRun();
		expect(first.weekSnapshots.length).toBeGreaterThanOrEqual(50);
		expect(first.state.meta.week).toBeGreaterThanOrEqual(51);
		expect(() => assertGameState(first.state)).not.toThrow();
		expect([...first.state.queue.decisionIds].sort()).toEqual(
			first.state.decisions.pending.map((decision) => decision.id).sort(),
		);
		expect([...first.state.queue.reportIds].sort()).toEqual(
			first.state.reports.items.map((report) => report.id).sort(),
		);
		expect(
			first.state.reports.items.every((report) => !report.acknowledged),
		).toBe(true);

		// Regenerating the same command sequence through the replay path is
		// an independent execution; byte equality proves determinism and
		// exercises a long replayable log.
		const replayed = replayCommandLog(first.state.commandLog);
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(first.state));
		expect(replayed.commandLog).toEqual(first.state.commandLog);
		// The run generates a long, replayable command log across 50+ weeks.
		expect(first.state.commandLog.length).toBeGreaterThan(50);
	});

	it("persists a non-blocking funding offer across weeks until resolved", () => {
		const state = fundableState();
		const offered = fundingSystem(state, { phase: "funding", week: 1 });
		const decision = offered.pending[0];
		if (decision === undefined || decision.kind !== "funding") {
			throw new Error("Expected a seed offer");
		}
		const persisted = {
			...offered.state,
			decisions: { pending: [decision] },
			queue: {
				...offered.state.queue,
				decisionIds: [decision.id],
			},
		};

		const advanced = advanceWeek(persisted);
		expect(advanced.state.meta.week).toBe(2);
		expect(advanced.state.decisions.pending).toEqual([decision]);
		expect(advanced.state.queue.decisionIds).toEqual([decision.id]);

		const nextWeek = advanceWeek(advanced.state);
		expect(
			nextWeek.state.decisions.pending.filter(
				(item) => item.kind === "funding",
			),
		).toEqual([decision]);
	});

	it("applies the persisted funding choice with the exact grant", () => {
		const state = fundableState();
		const offered = fundingSystem(state, { phase: "funding", week: 1 });
		const decision = offered.pending[0];
		if (decision === undefined || decision.kind !== "funding") {
			throw new Error("Expected a seed offer");
		}
		const persisted = {
			...offered.state,
			decisions: { pending: [decision] },
			queue: {
				...offered.state.queue,
				decisionIds: [decision.id],
			},
		};
		const resolved = applyDecision(persisted, {
			kind: "funding",
			decisionId: decision.id,
			round: decision.round,
			accept: true,
		});
		expect(resolved.state.company.cash).toBe(
			persisted.company.cash + BALANCE.funding.seed.grant,
		);
		expect(resolved.state.funding.seed.status).toBe("accepted");
	});
});

function fundableState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) {
		throw new Error("Expected Text model family unlock");
	}
	familyUnlock.status = "completed";
	state.company.hype = BALANCE.funding.seed.minimumHype;
	state.company.trust = BALANCE.funding.seed.minimumTrust;
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "launched",
			projectId: null,
			family: "text",
			tier: "lean",
			trueScores: {
				capability: 60,
				coding: 60,
				reliability: 60,
				safety: 60,
				efficiency: 60,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 60, lower: 40, upper: 80 },
				coding: { estimate: 60, lower: 40, upper: 80 },
				reliability: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 60, lower: 40, upper: 80 },
				efficiency: { estimate: 60, lower: 40, upper: 80 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	// A launched model already operating Chat and API produces no new
	// blocking launch/evaluation decisions during advanceWeek, so the
	// non-blocking funding offer can persist cleanly across weeks.
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
			effectiveQuality: 60,
		},
		{
			id: "product_002",
			channel: "developer_api",
			modelId: "model_001",
			status: "operating",
			users: 8,
			lastRevenue: 0,
			cumulativeRevenue: 0,
			servingDemand: 16,
			effectiveQuality: 60,
		},
	];
	state.compute.servingDemand = 26;
	state.compute.allocated = 12; // capped at the opening capacity of 12
	return state;
}
