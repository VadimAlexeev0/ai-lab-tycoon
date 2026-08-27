import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { getPriorityAction } from "./priority-strip";

describe("getPriorityAction", () => {
	it("prioritizes the first blocking decision", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.decisions.pending = [
			{
				blocking: true,
				id: "decision_001",
				kind: "launch",
				modelId: "model_001",
			},
		];

		expect(getPriorityAction(state)).toEqual({
			decisionId: "decision_001",
			kind: "resolve_decision",
		});
	});

	it("routes an idle team to the teams module before suggesting model design", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		if (team === undefined) throw new Error("Expected a founding team");
		state.company.cash = 1_000;

		expect(getPriorityAction(state)).toMatchObject({
			kind: "assign_project",
			teamId: team.id,
			teamName: team.name,
		});
	});

	it("suggests model design only when no model work is active and cash covers the minimum", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		if (team === undefined) throw new Error("Expected a founding team");
		team.activeProjectId = "project_001";
		state.models.items = [];
		state.company.cash = 80;

		expect(getPriorityAction(state)).toMatchObject({
			kind: "design_model",
			minimumCost: 80,
		});

		state.company.cash = 79;
		expect(getPriorityAction(state)).toMatchObject({ kind: "advance_week" });
	});

	it("falls back to advancing the current week", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		if (team === undefined) throw new Error("Expected a founding team");
		team.activeProjectId = "project_001";
		state.company.cash = 10;

		expect(getPriorityAction(state)).toEqual({
			kind: "advance_week",
			week: state.meta.week,
		});
	});
});
