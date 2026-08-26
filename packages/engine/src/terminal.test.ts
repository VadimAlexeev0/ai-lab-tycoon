import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import {
	advanceWeek,
	applyDecision,
	launchProduct,
	runEvaluation,
	startRun,
} from "./index.js";
import type { GameState } from "./state.js";

function multimodalReadyState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.meta.era = "multimodal";
	state.research.currentEra = "multimodal";
	state.company.hype = 100;
	state.company.trust = 100;
	state.models.items = [
		{
			id: "model_001",
			name: "Vision-1",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			family: "multimodal",
			tier: "aggressive",
			scoreCeiling: 100,
			dataMix: { general: 40, code: 20, multimodal: 40 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 90,
				coding: 80,
				reliability: 90,
				safety: 90,
				efficiency: 80,
				multimodal: 90,
			},
			estimates: {
				capability: { estimate: 90, lower: 70, upper: 100 },
				coding: { estimate: 80, lower: 60, upper: 100 },
				reliability: { estimate: 90, lower: 70, upper: 100 },
				safety: { estimate: 90, lower: 70, upper: 100 },
				efficiency: { estimate: 80, lower: 60, upper: 100 },
				multimodal: { estimate: 90, lower: 70, upper: 100 },
			},
		},
	];
	return state;
}

describe("terminal outcomes and milestone", () => {
	it("declares bankruptcy at exact zero after upkeep and rejects later turns", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = BALANCE.upkeep + BALANCE.salaries.foundingTeam;
		const result = advanceWeek(state);

		expect(result.state.company.cash).toBe(0);
		expect(result.state.terminal).toMatchObject({
			status: "lost",
			reason: "cash_depleted",
		});
		expect(result.state.terminal.contributors).toHaveLength(3);
		expect(result.state.terminal.contributors).toEqual(
			[...result.state.terminal.contributors].sort(
				(a, b) => Math.abs(b.impact) - Math.abs(a.impact) || a.index - b.index,
			),
		);
		expect(result.state.terminal.contributors).toEqual([
			{ kind: "resource_changed", impact: -75, week: 1, index: 0 },
			{ kind: "rival_progressed", impact: 9, week: 1, index: 3 },
			{ kind: "rival_progressed", impact: 7, week: 1, index: 2 },
		]);
		const terminalFact = result.facts.find((fact) => fact.kind === "terminal");
		if (terminalFact?.kind !== "terminal")
			throw new Error("Expected terminal fact");
		expect(terminalFact.contributors).toEqual(
			result.state.terminal.contributors,
		);
		const persistedTerminal = result.state.reports.items.find(
			(report) => report.fact.kind === "terminal",
		);
		expect(persistedTerminal?.fact).toEqual(terminalFact);
		expect(persistedTerminal).toBeDefined();
		expect(result.state.queue.reportIds).toContain(persistedTerminal?.id);
		expect(result.facts).toContainEqual(
			expect.objectContaining({ kind: "terminal", reason: "cash_depleted" }),
		);
		expect(() => advanceWeek(result.state)).toThrow(/terminal|lost|bankrupt/i);
	});

	it("lets current-week product revenue rescue an upkeep deficit", () => {
		const state = multimodalReadyState();
		state.company.cash = BALANCE.upkeep + BALANCE.salaries.foundingTeam - 1;
		state.compute.capacity = 100;
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

		const result = advanceWeek(state);

		expect(result.state.company.cash).toBe(
			state.company.cash -
				(BALANCE.upkeep + BALANCE.salaries.foundingTeam) +
				135,
		);
		expect(result.state.terminal.status).toBe("active");
	});

	it("treats trust zero as a loss but leaves a zero-cash run active", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.trust = 0;
		const result = advanceWeek(state);

		expect(result.state.terminal).toMatchObject({
			status: "lost",
			reason: "trust_collapsed",
		});
	});

	it("fires the first multimodal launch milestone exactly once and keeps the sandbox active", () => {
		const first = launchProduct(multimodalReadyState(), "model_001", "chat");
		expect(first.state.terminal.frontierReached).toBe(true);
		expect(
			first.facts.filter((fact) => fact.kind === "milestone_reached"),
		).toHaveLength(1);

		const second = launchProduct(first.state, "model_001", "developer_api");
		expect(second.state.terminal.frontierReached).toBe(true);
		expect(
			second.facts.filter((fact) => fact.kind === "milestone_reached"),
		).toHaveLength(0);
		expect(second.state.terminal.status).toBe("active");
	});

	it("blocks every mutating public command after terminal loss without changing state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.terminal = {
			...state.terminal,
			status: "lost",
			reason: "trust_collapsed",
		};
		const before = JSON.stringify(state);

		expect(() => advanceWeek(state)).toThrow(/terminal|lost/i);
		expect(() =>
			applyDecision(state, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			}),
		).toThrow(/terminal|lost/i);
		expect(() => runEvaluation(state, "model_001", "capability")).toThrow(
			/terminal|lost/i,
		);
		expect(() => launchProduct(state, "model_001", "chat")).toThrow(
			/terminal|lost/i,
		);
		expect(JSON.stringify(state)).toBe(before);
	});
});
