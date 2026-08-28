import { describe, expect, it } from "vitest";

import { BALANCE } from "./data/balance.js";
import { RESEARCH_NODES, TEXT_ERA } from "./data/research.js";
import { OPENING_RIVALS } from "./data/rivals.js";
import { FOUNDING_TEAM } from "./data/teams.js";
import { startRun } from "./index.js";
import {
	selectAvailableProjects,
	selectFunding,
	selectNextObjective,
	selectPendingDecisions,
	selectProducts,
	selectRecentReports,
	selectResearchNodes,
	selectResourceBar,
	selectRivals,
	selectTeams,
	selectTerminalObjective,
	selectTerminalProjection,
	selectVisibleModels,
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

	it("throws a typed incompatible-save error for unknown research nodes", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes[0];
		if (node === undefined) throw new Error("Expected a research node");
		node.id = "deleted_research_node";

		let thrown: unknown;
		try {
			selectResearchNodes(state);
		} catch (error: unknown) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).toMatchObject({ name: "IncompatibleSaveError" });
		expect((thrown as Error).message).toMatch(
			/save is incompatible.*new run/i,
		);
	});

	it("projects teams with an explicit idle or working status", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectTeams(state)).toEqual([
			{
				id: "team_001",
				name: FOUNDING_TEAM.name,
				status: "idle",
				activeProjectId: null,
			},
		]);
	});

	it("projects only available opening projects with their public fields", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectAvailableProjects(state)).toEqual(
			RESEARCH_NODES.filter(
				(node) => node.era === TEXT_ERA && node.status === "available",
			).map((node, index) => ({
				id: `project_${String(index + 1).padStart(3, "0")}`,
				kind: "research",
				status: "available",
				progress: BALANCE.startingProjectProgress,
				duration: BALANCE.researchProjectDuration,
				nodeId: node.id,
			})),
		);
	});

	it("projects only public active rival progress and activation state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectRivals(state)).toEqual(
			OPENING_RIVALS.filter((rival) => rival.active).map((rival, index) => ({
				id: `rival_${String(index + 1).padStart(3, "0")}`,
				...rival,
			})),
		);
	});

	it("hides dormant rivals during Text and reveals them in Assistant", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectRivals(state).map((rival) => rival.id)).toEqual([
			"rival_001",
			"rival_002",
		]);

		state.meta.era = "assistant";
		state.research.currentEra = "assistant";
		expect(selectRivals(state).map((rival) => rival.id)).toEqual([
			"rival_001",
			"rival_002",
			"rival_003",
		]);
	});

	it("identifies assigning the idle founding team as the next objective", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(selectNextObjective(state)).toEqual({
			kind: "assign_project",
			teamId: "team_001",
		});
	});

	it("prioritizes resolving a blocking decision", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.decisions.pending = [
			{
				kind: "launch",
				id: "decision_001",
				modelId: "model_001",
				blocking: true,
			},
		];

		expect(selectNextObjective(state)).toEqual({
			kind: "resolve_decision",
			decisionId: "decision_001",
		});
	});

	it("selects advancing the week when no project is available", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.projects.items = [];

		expect(selectNextObjective(state)).toEqual({
			kind: "advance_week",
			week: 1,
		});
	});

	it("projects model estimates without exposing hidden model data", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(selectVisibleModels(state)).toEqual([]);

		const stateWithHiddenFields = JSON.parse(
			JSON.stringify(state),
		) as GameState;
		const modelWithHiddenScores = {
			id: "model_001",
			name: "Hidden Fixture",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			brand: "Hidden Brand",
			family: "assistant",
			estimates: {
				reasoning: { estimate: 72, lower: 54, upper: 90 },
			},
			trueScores: { capability: 99 },
		};
		(stateWithHiddenFields.models.items as Array<unknown>).push(
			modelWithHiddenScores,
		);

		const visibleModels = selectVisibleModels(stateWithHiddenFields);
		expect(visibleModels).toEqual([
			{
				id: "model_001",
				name: "Hidden Fixture",
				brand: "Hidden Brand",
				family: "assistant",
				estimates: {
					reasoning: { estimate: 72, lower: 54, upper: 90 },
				},
			},
		]);
		expect(JSON.stringify(visibleModels)).not.toContain("trueScores");
		expect(JSON.stringify(visibleModels)).not.toContain("foundation");
		expect(JSON.stringify(visibleModels)).not.toContain("projectId");
		expect(JSON.stringify(visibleModels)).not.toContain("status");

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
			models: selectVisibleModels(stateWithHiddenFields),
			research: selectResearchNodes(state),
			products: selectProducts(state),
			funding: selectFunding(state),
			pendingDecisions: selectPendingDecisions(state),
			recentReports: selectRecentReports(state),
			terminal: selectTerminalProjection(state),
			nextObjective: selectNextObjective(state),
		});
		expect(JSON.stringify(visible)).not.toContain("trueScores");
		expect(JSON.stringify(visible)).not.toContain("trueScore");
		expect(JSON.stringify(visible)).not.toContain("internalCost");
	});

	it("projects the complete public dashboard state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const visible = selectVisibleState(state);

		expect(visible.models).toEqual([]);
		expect(visible.research).toEqual(
			state.research.nodes.map((node) => {
				const definition = RESEARCH_NODES.find((item) => item.id === node.id);
				if (definition === undefined)
					throw new Error("Expected research definition");
				return {
					id: node.id,
					label: definition.label,
					era: node.era,
					eraLabel: definition.eraLabel,
					category: definition.category,
					branch: node.branch,
					status: node.status,
					prereqs: [...node.prerequisites],
					insightCost: node.insightCost,
					description: definition.description,
				};
			}),
		);
		expect(visible.products).toEqual([]);
		expect(visible.funding).toMatchObject({
			seed: state.funding.seed,
			seriesA: state.funding.seriesA,
		});
		expect(visible.funding.factors).toEqual({
			hype: 10,
			trust: 60,
			modelScore: 0,
			operatingProducts: 0,
			cumulativeRevenue: 0,
		});
		expect(visible.pendingDecisions).toEqual([]);
		expect(visible.recentReports).toEqual([]);
		expect(visible.terminal).toEqual(state.terminal);
	});

	it("returns restart guidance as the next objective after a terminal loss", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.terminal = {
			status: "lost",
			reason: "cash_depleted",
			frontierReached: false,
			contributors: [],
		};

		expect(selectTerminalObjective(state)).toEqual({
			kind: "restart",
			reason: "cash_depleted",
			guidance: expect.stringContaining("cash"),
		});
		expect(selectNextObjective(state)).toEqual(selectTerminalObjective(state));
		expect(selectVisibleState(state).nextObjective).toEqual(
			selectTerminalObjective(state),
		);
	});
});
