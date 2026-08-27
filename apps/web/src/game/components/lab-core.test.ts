import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { getLabCoreVisualState } from "./lab-core";

describe("getLabCoreVisualState", () => {
	it("marks active training and compute contention", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.projects.items.push({
			duration: 4,
			id: "project_training",
			kind: "training",
			modelId: "model_001",
			progress: 1,
			status: "active",
			teamId: "team_001",
		});
		state.compute.capacity = 4;
		state.compute.trainingDemand = 3;
		state.compute.servingDemand = 2;

		expect(getLabCoreVisualState(state)).toMatchObject({
			computeShortage: true,
			lost: false,
			trainingActive: true,
		});
	});

	it("uses the era and milestone stream as its flash identity", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const initial = getLabCoreVisualState(state);

		state.meta.era = "assistant";
		state.research.currentEra = "assistant";
		state.reports.items.push({
			acknowledged: false,
			fact: {
				kind: "milestone_reached",
				milestone: "first_multimodal_launch",
				week: 2,
			},
			id: "report_002",
			priority: "important",
		});

		const unlocked = getLabCoreVisualState(state);
		expect(unlocked.milestoneKey).not.toBe(initial.milestoneKey);
		expect(unlocked.lost).toBe(false);
	});

	it("marks a terminal run as lost", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.terminal.status = "lost";
		state.terminal.reason = "cash_depleted";

		expect(getLabCoreVisualState(state).lost).toBe(true);
	});
});
