import { describe, expect, it } from "vitest";

import { BALANCE } from "./data/balance.js";
import {
	ASSISTANT_ERA,
	ASSISTANT_MODELS_KEYSTONE_ID,
	assertResearchDefinitions,
	MODELS_BRANCH,
	MULTIMODAL_MODELS_FUSION_ID,
	RESEARCH_CATEGORIES,
	RESEARCH_NODES,
	TEXT_ERA,
	TEXT_MODELS_KEYSTONE_ID,
} from "./data/research.js";
import { allocateId } from "./ids.js";
import {
	advanceWeek,
	assertGameState,
	assignProject,
	startRun,
} from "./index.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";

function getInsightCost(node: unknown): number {
	if (
		typeof node !== "object" ||
		node === null ||
		!("insightCost" in node) ||
		typeof node.insightCost !== "number"
	) {
		throw new Error("Expected research node insight cost");
	}
	return node.insightCost;
}

function completeTextTier(state: ReturnType<typeof startRun>): void {
	for (const node of state.research.nodes) {
		if (node.era === TEXT_ERA) node.status = "completed";
	}
}

function completePrerequisites(
	state: ReturnType<typeof startRun>,
	nodeId: string,
	visiting = new Set<string>(),
): void {
	if (visiting.has(nodeId))
		throw new Error(`Cycle in test fixture at ${nodeId}`);
	const definition = RESEARCH_NODES.find((node) => node.id === nodeId);
	const stateNode = state.research.nodes.find((node) => node.id === nodeId);
	if (definition === undefined || stateNode === undefined) {
		throw new Error(`Expected research fixture node ${nodeId}`);
	}
	visiting.add(nodeId);
	for (const prerequisite of definition.prerequisites) {
		completePrerequisites(state, prerequisite, visiting);
	}
	visiting.delete(nodeId);
	stateNode.status = "completed";
}

describe("LLM-history research data", () => {
	it("contains the ten content groups folded into three engine eras", () => {
		expect(RESEARCH_NODES).toHaveLength(48);
		expect(new Set(RESEARCH_NODES.map((node) => node.era))).toEqual(
			new Set([TEXT_ERA, ASSISTANT_ERA, "multimodal"]),
		);
		expect(new Set(RESEARCH_NODES.map((node) => node.category))).toEqual(
			new Set(RESEARCH_CATEGORIES),
		);
		expect(RESEARCH_NODES.filter((node) => node.era === TEXT_ERA)).toHaveLength(
			9,
		);
		expect(
			RESEARCH_NODES.filter((node) => node.era === ASSISTANT_ERA),
		).toHaveLength(25);
		expect(
			RESEARCH_NODES.filter((node) => node.era === "multimodal"),
		).toHaveLength(14);
		expect(
			RESEARCH_NODES.every(
				(node) => node.description.length > 0 && node.description.length < 160,
			),
		).toBe(true);
		expect(
			RESEARCH_NODES.every((node) => Number.isInteger(node.insightCost)),
		).toBe(true);
		expect(
			RESEARCH_NODES.reduce((total, node) => total + node.insightCost, 0),
		).toBeLessThanOrEqual(50);

		const keystone = RESEARCH_NODES.find(
			(node) => node.id === TEXT_MODELS_KEYSTONE_ID,
		);
		expect(keystone).toMatchObject({
			id: TEXT_MODELS_KEYSTONE_ID,
			label: "Transformer architecture",
			era: TEXT_ERA,
			branch: MODELS_BRANCH,
		});
		expect(keystone?.prerequisites).toEqual(
			expect.arrayContaining([
				"self_attention",
				"multi_head_attention",
				"positional_encoding",
				"text_infrastructure_scaling",
			]),
		);
		expect(
			RESEARCH_NODES.find((node) => node.id === ASSISTANT_MODELS_KEYSTONE_ID),
		).toMatchObject({
			label: "Proprietary frontier",
			era: ASSISTANT_ERA,
			branch: MODELS_BRANCH,
		});
		expect(
			RESEARCH_NODES.find((node) => node.id === MULTIMODAL_MODELS_FUSION_ID),
		).toMatchObject({
			label: "Agentic frontier",
			era: "multimodal",
			branch: MODELS_BRANCH,
		});
	});

	it("deducts the data-defined Insight cost when assigning research", () => {
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
		const node = state.research.nodes.find(
			(item) => item.id === project.nodeId,
		);
		if (node === undefined) {
			throw new Error("Expected the research node for the opening project");
		}
		const insightCost = getInsightCost(node);
		state.company.insight = insightCost + 2;

		const result = assignProject(state, team.id, project);

		expect(result.state.company.insight).toBe(2);
		expect(state.company.insight).toBe(insightCost + 2);
	});

	it("rejects research assignment when Insight is below the data-defined cost", () => {
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
		const node = state.research.nodes.find(
			(item) => item.id === project.nodeId,
		);
		if (node === undefined) {
			throw new Error("Expected the research node for the opening project");
		}
		const insightCost = getInsightCost(node);
		state.company.insight = Math.max(0, insightCost - 1);

		expect(() => assignProject(state, team.id, project)).toThrow(/insight/i);
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
		const node = state.research.nodes.find(
			(item) => item.id === project.nodeId,
		);
		if (node === undefined) {
			throw new Error("Expected the research node for the opening project");
		}
		state.company.insight = getInsightCost(node);

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
		const openingProject = state.projects.items.find(
			(project) =>
				project.kind === "research" &&
				RESEARCH_NODES.some((node) =>
					node.prerequisites.some(
						(prerequisite) => prerequisite === project.nodeId,
					),
				),
		);
		if (
			team === undefined ||
			openingProject === undefined ||
			openingProject.kind !== "research"
		) {
			throw new Error("Expected an opening research project with a dependent");
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
		state.company.insight = getInsightCost(completedDefinition);

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
			id: completedDefinition.id,
			era: completedDefinition.era,
			branch: completedDefinition.branch,
			status: "completed",
			insightCost: completedDefinition.insightCost,
			prerequisites: [...completedDefinition.prerequisites],
		});
		expect(result.state.research.nodes).toContainEqual({
			id: dependentDefinition.id,
			era: dependentDefinition.era,
			branch: dependentDefinition.branch,
			status: "available",
			insightCost: dependentDefinition.insightCost,
			prerequisites: [...dependentDefinition.prerequisites],
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
			{
				kind: "rival_progressed",
				rivalId: "rival_001",
				amount: 7,
				week: 1,
			},
			{
				kind: "rival_progressed",
				rivalId: "rival_002",
				amount: 9,
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
		state.company.insight = 100;

		expect(() => assignProject(state, team.id, project)).toThrow(
			/keystone|era|gate|prerequisite/i,
		);
	});

	it("rejects a multimodal node while the current era is Text", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		const node = state.research.nodes.find(
			(item) => item.era === ASSISTANT_ERA,
		);
		if (
			team === undefined ||
			project === undefined ||
			project.kind !== "research" ||
			node === undefined
		) {
			throw new Error("Expected an opening project and Assistant node");
		}

		state.company.insight = 100;
		node.era = "multimodal";
		node.status = "available";
		node.prerequisites = [];
		project.nodeId = node.id;

		expect(() => assignProject(state, team.id, project)).toThrow(
			/era|gate|prerequisite/i,
		);
	});

	it("does not complete an Assistant node while the current era is Text", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const project = state.projects.items[0];
		const node = state.research.nodes.find(
			(item) => item.era === ASSISTANT_ERA,
		);
		if (
			project === undefined ||
			project.kind !== "research" ||
			node === undefined
		) {
			throw new Error("Expected an opening project and Assistant node");
		}

		state.meta.era = TEXT_ERA;
		state.research.currentEra = TEXT_ERA;
		node.status = "available";
		node.prerequisites = [];
		project.nodeId = node.id;
		project.status = "completed";
		project.progress = project.duration;
		project.teamId = null;

		// A Text-era state exposing an unlocked Assistant node is now rejected
		// by the runtime graph invariant before the system can act on it.
		expect(() => assertGameState(state)).toThrow(
			/not unlocked in the current era/i,
		);
	});

	it("completes an Assistant research project only after the era gate opens", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.era = ASSISTANT_ERA;
		state.research.currentEra = ASSISTANT_ERA;
		completeTextTier(state);
		assertGameState(state);
		const assistantDefinition = RESEARCH_NODES.find(
			(node) => node.id === "assistant_models_reasoning",
		);
		if (assistantDefinition === undefined) {
			throw new Error("Expected Assistant reasoning definition");
		}
		for (const prerequisite of assistantDefinition.prerequisites) {
			completePrerequisites(state, prerequisite);
		}
		const assistantProject = {
			kind: "research" as const,
			id: "project_assistant",
			teamId: null,
			status: "completed" as const,
			progress: 1,
			duration: 1,
			nodeId: "assistant_models_reasoning",
		};
		state.projects.items = [...state.projects.items, assistantProject];
		const target = state.research.nodes.find(
			(item) => item.id === "assistant_models_reasoning",
		);
		if (target === undefined) throw new Error("Expected Assistant node");
		target.status = "available";

		const result = researchSystem(state, {
			phase: "research",
			week: 2,
		});
		expect(result.facts).toContainEqual({
			kind: "research_completed",
			nodeId: "assistant_models_reasoning",
			week: 2,
		});
	});

	it("enters the Assistant era from the node gate without a shipped model", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		completeTextTier(state);
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
			const node = state.research.nodes.find(
				(item) => item.id === project.nodeId,
			);
			if (node === undefined) {
				throw new Error("Expected the research node for the opening project");
			}
			state.company.insight = getInsightCost(node);
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
		expect(first.state.commandLog).toHaveLength(6);
		expect(first.state.commandLog.slice(1).map((entry) => entry.kind)).toEqual([
			"assign_project",
			"advance_week",
			"advance_week",
			"advance_week",
			"advance_week",
		]);
	});
});
