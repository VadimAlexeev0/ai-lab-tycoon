import { describe, expect, it } from "vitest";

import { startRun } from "./index.js";
import {
	selectAvailableProjects,
	selectNextObjective,
	selectResourceBar,
	selectRivals,
	selectTeams,
	selectVisibleState,
} from "./selectors.js";
import type { GameState } from "./state.js";

describe("visible selectors", () => {
	it("returns a resource bar summary and no component internals", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectResourceBar(state)).toEqual({
			cash: 1_000,
			compute: {
				capacity: 12,
				allocated: 0,
				trainingDemand: 0,
				servingDemand: 0,
			},
			insight: 0,
			trust: 60,
			hype: 10,
		});
		expect(Object.keys(selectResourceBar(state)).sort()).toEqual([
			"cash",
			"compute",
			"hype",
			"insight",
			"trust",
		]);
	});

	it("projects teams with an explicit idle or working status", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectTeams(state)).toEqual([
			{
				id: "team_001",
				name: "Founding Team",
				status: "idle",
				activeProjectId: null,
			},
		]);
	});

	it("projects only available opening projects with their public fields", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectAvailableProjects(state)).toEqual([
			{
				id: "project_001",
				kind: "research",
				status: "available",
				progress: 0,
				duration: 1,
				nodeId: "node_text_basic_research",
			},
			{
				id: "project_002",
				kind: "research",
				status: "available",
				progress: 0,
				duration: 1,
				nodeId: "node_text_infrastructure_setup",
			},
			{
				id: "project_003",
				kind: "research",
				status: "available",
				progress: 0,
				duration: 1,
				nodeId: "node_text_first_model_concept",
			},
		]);
	});

	it("projects only public rival progress and activation state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectRivals(state)).toEqual([
			{
				id: "rival_001",
				name: "Northstar Labs",
				archetype: "research_lab",
				focus: "capability",
				progress: 0,
				active: true,
			},
			{
				id: "rival_002",
				name: "MarketSpring",
				archetype: "platform",
				focus: "distribution",
				progress: 0,
				active: true,
			},
			{
				id: "rival_003",
				name: "LeanForge",
				archetype: "efficiency",
				focus: "reliability",
				progress: 0,
				active: false,
			},
		]);
	});

	it("identifies assigning the idle founding team as the next objective", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectNextObjective(state)).toEqual({
			kind: "assign_project",
			teamId: "team_001",
		});
	});

	it("composes visible projections without exposing hidden model data", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const stateWithHiddenFields = JSON.parse(
			JSON.stringify(state),
		) as GameState;
		const modelWithHiddenScores = {
			id: "model_001",
			name: "Hidden Fixture",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			trueScores: { capability: 99 },
		};
		(stateWithHiddenFields.models.items as Array<unknown>).push(
			modelWithHiddenScores,
		);
		(
			stateWithHiddenFields.rivals.items[0] as unknown as Record<
				string,
				unknown
			>
		).trueScore = 99;
		(
			stateWithHiddenFields.projects.items[0] as unknown as Record<
				string,
				unknown
			>
		).internalCost = 999;

		const visible = selectVisibleState(stateWithHiddenFields);

		expect(visible).toEqual({
			resourceBar: selectResourceBar(state),
			teams: selectTeams(state),
			availableProjects: selectAvailableProjects(state),
			rivals: selectRivals(state),
			nextObjective: selectNextObjective(state),
		});
		expect(visible).not.toHaveProperty("models");
		expect(JSON.stringify(visible)).not.toContain("trueScores");
		expect(JSON.stringify(visible)).not.toContain("trueScore");
		expect(JSON.stringify(visible)).not.toContain("internalCost");
	});
});
