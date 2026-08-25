import { describe, expect, it } from "vitest";

import { BALANCE } from "./data/balance.js";
import {
	ASSISTANT_ERA,
	assertResearchDefinitions,
	MODELS_BRANCH,
	RESEARCH_BRANCHES,
	RESEARCH_NODES,
	TEXT_ERA,
	TEXT_MODELS_KEYSTONE_ID,
} from "./data/research.js";
import { allocateId } from "./ids.js";
import { advanceWeek, assignProject, startRun } from "./index.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";

describe("V1 research data", () => {
	it("contains the typed Text and Assistant tree with real node ids", () => {
		expect(RESEARCH_NODES).toHaveLength(12);
		expect(new Set(RESEARCH_NODES.map((node) => node.era))).toEqual(
			new Set([TEXT_ERA, ASSISTANT_ERA]),
		);
		expect(new Set(RESEARCH_NODES.map((node) => node.branch)).size).toBe(3);
		for (const branch of RESEARCH_BRANCHES) {
			expect(
				RESEARCH_NODES.filter(
					(node) => node.era === TEXT_ERA && node.branch === branch,
				),
			).toHaveLength(2);
			expect(
				RESEARCH_NODES.filter(
					(node) => node.era === ASSISTANT_ERA && node.branch === branch,
				),
			).toHaveLength(2);
		}
		expect(
			RESEARCH_NODES.every((node) => !node.id.startsWith("node_text_")),
		).toBe(true);

		const keystone = RESEARCH_NODES.find(
			(node) => node.id === TEXT_MODELS_KEYSTONE_ID,
		);
		expect(keystone).toMatchObject({
			id: TEXT_MODELS_KEYSTONE_ID,
			era: TEXT_ERA,
			branch: MODELS_BRANCH,
		});
		expect(keystone?.prerequisites.length).toBeGreaterThan(0);
	});

	it("fails fast on duplicate or dangling research definitions", () => {
		const firstNode = RESEARCH_NODES.at(0);
		if (firstNode === undefined) {
			throw new Error("Expected research data");
		}

		expect(() =>
			assertResearchDefinitions([...RESEARCH_NODES, firstNode]),
		).toThrow(/duplicate/i);
		expect(() =>
			assertResearchDefinitions([
				{
					...firstNode,
					id: "fixture_research_node",
					prerequisites: ["missing_research_node"],
				},
			]),
		).toThrow(/unknown/i);
	});

	it("gives each idle team the balance-defined weekly Insight gain", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		const result = researchSystem(state, {
			phase: "research",
			week: 2,
		});

		expect(result.state.company.insight).toBe(
			state.company.insight + BALANCE.researchInsightPerWeek,
		);
		expect(result.facts).toContainEqual({
			kind: "resource_changed",
			resource: "insight",
			amount: BALANCE.researchInsightPerWeek,
			week: 2,
		});
		expect(state.company.insight).toBe(BALANCE.startingInsight);
	});

	it("also gives Insight to a team actively researching", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (
			team === undefined ||
			project === undefined ||
			project.kind !== "research"
		) {
			throw new Error("Expected the opening research project");
		}

		const assigned = assignProject(state, team.id, project);
		const activeProject = assigned.state.projects.items[0];
		if (activeProject === undefined) {
			throw new Error("Expected the assigned project");
		}
		activeProject.duration = BALANCE.projectProgressPerWeek.research + 1;

		const result = researchSystem(assigned.state, {
			phase: "research",
			week: 2,
		});

		expect(result.state.company.insight).toBe(BALANCE.researchInsightPerWeek);
	});

	it("does not give Insight to a team assigned to a non-research project", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		const template = state.projects.items[1];
		if (
			team === undefined ||
			template === undefined ||
			template.kind !== "research"
		) {
			throw new Error("Expected the opening team and project");
		}
		const infrastructureProject = {
			kind: "infrastructure" as const,
			id: template.id,
			teamId: null,
			status: "available" as const,
			progress: BALANCE.startingProjectProgress,
			duration:
				BALANCE.projectProgressPerWeek.infrastructure +
				BALANCE.startingProjectProgress +
				1,
			target: "compute" as const,
		};
		state.projects.items[1] = infrastructureProject;

		const assigned = assignProject(state, team.id, infrastructureProject);
		const result = researchSystem(assigned.state, {
			phase: "research",
			week: 2,
		});

		expect(result.state.company.insight).toBe(BALANCE.startingInsight);
		expect(
			result.facts.some(
				(fact) =>
					fact.kind === "resource_changed" && fact.resource === "insight",
			),
		).toBe(false);
	});

	it("completes a research node and makes its dependent project available", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		const openingProject = state.projects.items[0];
		if (
			team === undefined ||
			openingProject === undefined ||
			openingProject.kind !== "research"
		) {
			throw new Error("Expected the opening team and research project");
		}
		const completedDefinition = RESEARCH_NODES.find(
			(node) => node.id === openingProject.nodeId,
		);
		const dependentDefinition = RESEARCH_NODES.find((node) =>
			node.prerequisites.some(
				(prerequisiteId) => prerequisiteId === openingProject.nodeId,
			),
		);
		if (
			completedDefinition === undefined ||
			dependentDefinition === undefined
		) {
			throw new Error("Expected a research prerequisite pair");
		}

		const assigned = assignProject(state, team.id, openingProject);
		const projectResult = projectsSystem(assigned.state, {
			phase: "projects",
			week: 2,
		});
		const result = researchSystem(projectResult.state, {
			phase: "research",
			week: 2,
		});

		expect(result.state.research.nodes).toContainEqual({
			...completedDefinition,
			status: "completed",
		});
		expect(result.state.research.nodes).toContainEqual({
			...dependentDefinition,
			status: "available",
		});
		expect(result.state.projects.items).toContainEqual(
			expect.objectContaining({
				kind: "research",
				teamId: null,
				status: "available",
				progress: BALANCE.startingProjectProgress,
				duration: BALANCE.researchProjectDuration,
				nodeId: dependentDefinition.id,
			}),
		);
		expect(result.facts).toContainEqual({
			kind: "research_completed",
			nodeId: completedDefinition.id,
			week: 2,
		});
	});

	it("advances exactly one deterministic week and appends its command", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const result = advanceWeek(state);
		const weeklyCost = BALANCE.upkeep + BALANCE.salaries.foundingTeam;

		expect(result.state.meta.week).toBe(2);
		expect(result.state.company.cash).toBe(BALANCE.startingCash - weeklyCost);
		expect(result.state.company.insight).toBe(
			BALANCE.startingInsight + BALANCE.researchInsightPerWeek,
		);
		expect(result.state.commandLog).toHaveLength(state.commandLog.length + 1);
		expect(result.state.commandLog.at(-1)).toEqual({
			id: "command_002",
			kind: "advance_week",
			week: 1,
		});
		expect(result.facts).toEqual([
			{
				kind: "resource_changed",
				resource: "cash",
				amount: -weeklyCost,
				week: 1,
			},
			{
				kind: "resource_changed",
				resource: "insight",
				amount: BALANCE.researchInsightPerWeek,
				week: 1,
			},
		]);
		expect(state.meta.week).toBe(1);
	});

	it("rejects advancing while a blocking decision is pending", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const allocation = allocateId(state, "decision");
		const blockedState = {
			...allocation.state,
			decisions: {
				pending: [
					{
						kind: "incident" as const,
						id: allocation.id,
						incident: "outage" as const,
						blocking: true as const,
					},
				],
			},
			queue: { ...allocation.state.queue, decisionIds: [allocation.id] },
		};

		expect(() => advanceWeek(blockedState)).toThrow(/blocking/i);
	});

	it("rejects assignment when a research prerequisite is not completed", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		const template = state.projects.items[0];
		const lockedNode = state.research.nodes.find(
			(node) => node.id === TEXT_MODELS_KEYSTONE_ID,
		);
		if (
			team === undefined ||
			template === undefined ||
			lockedNode === undefined
		) {
			throw new Error("Expected the opening project and Text keystone");
		}

		const allocation = allocateId(state, "project");
		const stateWithLockedProject = {
			...allocation.state,
			projects: {
				items: [
					...allocation.state.projects.items,
					{
						...template,
						id: allocation.id,
						nodeId: lockedNode.id,
					},
				],
			},
		};
		const lockedProject = stateWithLockedProject.projects.items.at(-1);
		if (lockedProject === undefined) {
			throw new Error("Expected the locked research project");
		}

		expect(() =>
			assignProject(stateWithLockedProject, team.id, lockedProject),
		).toThrow(/prerequisite|available|locked/i);
	});

	it("rejects an Assistant project when the Text Models keystone is absent", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		const assistantNode = RESEARCH_NODES.find(
			(node) => node.era === ASSISTANT_ERA,
		);
		if (
			team === undefined ||
			project === undefined ||
			project.kind !== "research" ||
			assistantNode === undefined
		) {
			throw new Error("Expected an opening project and Assistant node");
		}

		state.meta.era = ASSISTANT_ERA;
		state.research.currentEra = ASSISTANT_ERA;
		const stateNode = state.research.nodes.find(
			(node) => node.id === assistantNode.id,
		);
		if (stateNode === undefined) {
			throw new Error("Expected the Assistant node in state");
		}
		stateNode.status = "available";
		stateNode.prerequisites = [];
		project.nodeId = stateNode.id;

		expect(() => assignProject(state, team.id, project)).toThrow(
			/keystone|era|gate|prerequisite/i,
		);
	});

	it("enters the Assistant era from the node gate without a shipped model", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		for (const node of state.research.nodes) {
			if (
				node.id === TEXT_MODELS_KEYSTONE_ID ||
				node.prerequisites.includes(TEXT_MODELS_KEYSTONE_ID)
			) {
				node.status =
					node.id === TEXT_MODELS_KEYSTONE_ID ? "completed" : node.status;
			}
		}
		const result = researchSystem(state, {
			phase: "research",
			week: 2,
		});

		expect(result.state.meta.era).toBe("assistant");
		expect(result.state.models.items).toEqual([]);
		expect(
			result.state.research.nodes.some(
				(node) => node.era === ASSISTANT_ERA && node.status === "available",
			),
		).toBe(true);
	});

	it("reproduces a multi-week command sequence byte-for-byte", () => {
		const run = () => {
			let state = startRun({ companyName: "Acme Labs" }, 42);
			const team = state.teams.items[0];
			const project = state.projects.items[0];
			if (
				team === undefined ||
				project === undefined ||
				project.kind !== "research"
			) {
				throw new Error("Expected the opening team and project");
			}
			state = assignProject(state, team.id, project).state;
			const facts = [] as ReturnType<typeof advanceWeek>["facts"];
			for (const _week of [1, 2, 3, 4]) {
				const result = advanceWeek(state);
				state = result.state;
				facts.push(...result.facts);
			}
			return { state, facts };
		};

		const first = run();
		const second = run();

		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(first.state.meta.week).toBe(5);
		expect(first.state.commandLog).toHaveLength(5);
		expect(first.state.commandLog.slice(1).map((entry) => entry.kind)).toEqual([
			"advance_week",
			"advance_week",
			"advance_week",
			"advance_week",
		]);
	});
});
