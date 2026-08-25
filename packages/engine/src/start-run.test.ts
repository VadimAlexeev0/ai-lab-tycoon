import { describe, expect, it } from "vitest";

import { createRngState } from "./components/rng.js";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";

const EXPECTED_OPENING_NODES = [
	{
		id: "node_text_basic_research",
		era: "text",
		branch: "models",
		status: "available",
		prerequisites: [],
	},
	{
		id: "node_text_infrastructure_setup",
		era: "text",
		branch: "infrastructure",
		status: "available",
		prerequisites: [],
	},
	{
		id: "node_text_first_model_concept",
		era: "text",
		branch: "models",
		status: "available",
		prerequisites: [],
	},
];

const EXPECTED_OPENING_PROJECTS = [
	{
		kind: "research",
		id: "project_001",
		teamId: null,
		status: "available",
		progress: 0,
		duration: 1,
		nodeId: "node_text_basic_research",
	},
	{
		kind: "research",
		id: "project_002",
		teamId: null,
		status: "available",
		progress: 0,
		duration: 1,
		nodeId: "node_text_infrastructure_setup",
	},
	{
		kind: "research",
		id: "project_003",
		teamId: null,
		status: "available",
		progress: 0,
		duration: 1,
		nodeId: "node_text_first_model_concept",
	},
];

const EXPECTED_OPENING_RIVALS = [
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
];

describe("startRun", () => {
	it("matches the exact deterministic week-one opening state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(state).toEqual({
			meta: {
				schemaVersion: 1,
				runId: "run_42",
				week: 1,
				era: "text",
			},
			rng: createRngState(42),
			counters: {
				team: 2,
				project: 4,
				model: 1,
				product: 1,
				rival: 4,
				decision: 1,
				report: 1,
				command: 2,
			},
			company: {
				name: "Acme Labs",
				cash: 1_000,
				insight: 0,
				trust: 60,
				hype: 10,
			},
			teams: {
				items: [
					{
						id: "team_001",
						name: "Founding Team",
						activeProjectId: null,
					},
				],
			},
			projects: { items: EXPECTED_OPENING_PROJECTS },
			compute: {
				capacity: 12,
				allocated: 0,
				trainingDemand: 0,
				servingDemand: 0,
			},
			research: {
				currentEra: "text",
				nodes: EXPECTED_OPENING_NODES,
			},
			models: { items: [], activeModelId: null },
			products: { items: [] },
			rivals: { items: EXPECTED_OPENING_RIVALS },
			funding: {
				seed: { round: "seed", status: "available" },
				seriesA: { round: "series_a", status: "locked" },
			},
			decisions: { pending: [] },
			reports: { items: [] },
			queue: { decisionIds: [], reportIds: [] },
			commandLog: [
				{
					id: "command_001",
					kind: "start_run",
					week: 1,
					setup: { companyName: "Acme Labs" },
					seed: 42,
				},
			],
			warnings: [],
			terminal: {
				status: "active",
				reason: "none",
				frontierReached: false,
			},
		});
	});

	it("keeps every V1 opening balance in documented constants", () => {
		expect(BALANCE).toEqual({
			startingCash: 1_000,
			startingComputeCapacity: 12,
			startingInsight: 0,
			startingTrust: 60,
			startingHype: 10,
			salaries: { foundingTeam: 50 },
			upkeep: 25,
		});

		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(state.company).toMatchObject({
			cash: BALANCE.startingCash,
			insight: BALANCE.startingInsight,
			trust: BALANCE.startingTrust,
			hype: BALANCE.startingHype,
		});
		expect(state.compute.capacity).toBe(BALANCE.startingComputeCapacity);
	});

	it("is deterministic for the same setup and seed", () => {
		const first = startRun({ companyName: "Acme Labs" }, 42);
		const second = startRun({ companyName: "Acme Labs" }, 42);

		expect(second).toEqual(first);
	});

	it("rejects a whitespace-only company name", () => {
		expect(() => startRun({ companyName: " \t\n " }, 42)).toThrow(
			/company name/i,
		);
	});

	it("allocates exactly one founding team", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(state.teams.items).toEqual([
			{
				id: "team_001",
				name: "Founding Team",
				activeProjectId: null,
			},
		]);
		expect(state.counters.team).toBe(2);
	});

	it("initializes two active rivals and one dormant Assistant-era rival", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const rivals = state.rivals.items;

		expect(rivals).toEqual(EXPECTED_OPENING_RIVALS);
		expect(rivals.filter((rival) => rival.active)).toHaveLength(2);
		expect(rivals.filter((rival) => !rival.active)).toHaveLength(1);
		expect(new Set(rivals.map((rival) => rival.archetype)).size).toBe(3);
		expect(new Set(rivals.map((rival) => rival.focus)).size).toBe(3);
	});

	it("seeds real placeholder node references without adding Task 5 systems", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const nodeIds = new Set(state.research.nodes.map((node) => node.id));

		expect(state.projects.items).toHaveLength(3);
		for (const project of state.projects.items) {
			expect(project.kind).toBe("research");
			if (project.kind === "research") {
				expect(nodeIds.has(project.nodeId)).toBe(true);
			}
		}
		expect(state.models.items).toEqual([]);
		expect(state.products.items).toEqual([]);
		expect(() => assertGameState(state)).not.toThrow();
	});
});
