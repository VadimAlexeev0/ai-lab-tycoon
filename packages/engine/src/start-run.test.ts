import { describe, expect, it } from "vitest";

import { createRngState } from "./components/rng.js";
import { BALANCE } from "./data/balance.js";
import { STARTING_DATA_INVENTORY } from "./data/data-sources.js";
import { RESEARCH_NODES, TEXT_ERA } from "./data/research.js";
import { OPENING_RIVALS } from "./data/rivals.js";
import { FOUNDING_TEAM } from "./data/teams.js";
import { GAME_STATE_SCHEMA_VERSION, startRun } from "./index.js";
import { assertGameState } from "./invariants.js";

const EXPECTED_OPENING_NODES = RESEARCH_NODES.map((node) => ({
	id: node.id,
	era: node.era,
	branch: node.branch,
	status: node.status,
	insightCost: node.insightCost,
	prerequisites: [...node.prerequisites],
}));
const EXPECTED_OPENING_PROJECTS = RESEARCH_NODES.filter(
	(node) => node.era === TEXT_ERA && node.status === "available",
).map((node, index) => ({
	kind: "research",
	id: `project_${String(index + 1).padStart(3, "0")}`,
	teamId: null,
	status: "available",
	progress: BALANCE.startingProjectProgress,
	duration: BALANCE.researchProjectDuration,
	nodeId: node.id,
}));

const EXPECTED_OPENING_RIVALS = OPENING_RIVALS.map((rival, index) => ({
	id: `rival_${String(index + 1).padStart(3, "0")}`,
	...rival,
	publishedNodeIds: [],
	launchedFamilyIds: [],
	eventCursor: 0,
}));

describe("startRun", () => {
	it("matches the exact deterministic week-one opening state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(state).toEqual({
			meta: {
				schemaVersion: GAME_STATE_SCHEMA_VERSION,
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
				data: STARTING_DATA_INVENTORY.length + 1,
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
						name: FOUNDING_TEAM.name,
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
			dataInventory: {
				items: STARTING_DATA_INVENTORY.map((record) => ({
					...record,
					usageRestrictions: [...record.usageRestrictions],
				})),
			},
			research: {
				currentEra: "text",
				discoveredSparkIds: [],
				paradigmId: null,
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
			reports: { items: [], totalCount: 0 },
			risk: { memories: [], crises: [] },
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
				contributors: [],
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
			startingProjectProgress: BALANCE.startingProjectProgress,
			salaries: { foundingTeam: 50 },
			upkeep: 25,
			projectProgressPerWeek: {
				research: 1,
				infrastructure: 1,
				model: 1,
				training: 1,
				evaluation: 1,
				product: 1,
			},
			researchInsightPerWeek: 1,
			researchProjectDuration: 1,
			modelTiers: BALANCE.modelTiers,
			modelFoundations: BALANCE.modelFoundations,
			modelScore: BALANCE.modelScore,
			modelEmphasisPoints: BALANCE.modelEmphasisPoints,
			defaultEstimateBandWidth: BALANCE.defaultEstimateBandWidth,
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

		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
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
				name: FOUNDING_TEAM.name,
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

	it("seeds real era-one research project references", () => {
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
