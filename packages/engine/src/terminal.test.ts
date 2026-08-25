import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { advanceWeek, startRun } from "./index.js";
import { launchProduct } from "./products.js";
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
	it("declares bankruptcy only below zero after upkeep, and rejects later turns", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = BALANCE.upkeep + BALANCE.salaries.foundingTeam - 1;
		const result = advanceWeek(state);

		expect(result.state.company.cash).toBe(-1);
		expect(result.state.terminal).toMatchObject({
			status: "lost",
			reason: "cash_depleted",
		});
		expect(result.facts).toContainEqual(
			expect.objectContaining({ kind: "terminal", reason: "cash_depleted" }),
		);
		expect(() => advanceWeek(result.state)).toThrow(/terminal|lost|bankrupt/i);
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
});
