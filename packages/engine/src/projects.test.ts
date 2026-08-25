import { describe, expect, it } from "vitest";
import { BALANCE } from "./data/balance.js";
import { allocateId } from "./ids.js";
import { assignProject, cancelProject, startRun } from "./index.js";
import { projectsSystem } from "./systems/projects.js";
import { upkeepSystem } from "./systems/upkeep.js";

function startRunWithInsight() {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.insight = 100;
	return state;
}

describe("project commands", () => {
	it("does not allow one team to hold two active projects", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const first = state.projects.items[0];
		const second = state.projects.items[1];
		if (team === undefined || first === undefined || second === undefined) {
			throw new Error("Expected the opening team and projects");
		}

		const assigned = assignProject(state, team.id, first);

		expect(assigned.state.teams.items[0]?.activeProjectId).toBe(first.id);
		expect(() => assignProject(assigned.state, team.id, second)).toThrow(
			/idle|active project/i,
		);
	});

	it("logs project assignment with its full replay payload and allocated id", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}

		const result = assignProject(state, team.id, project.id);

		expect(result.state.commandLog.at(-1)).toEqual({
			id: "command_002",
			kind: "assign_project",
			week: 1,
			teamId: team.id,
			projectId: project.id,
		});
		expect(result.state.counters.command).toBe(3);
		expect(state.commandLog).toHaveLength(1);
	});

	it("advances active projects by the balance rate without finishing early", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}

		const assigned = assignProject(state, team.id, project);
		const activeProject = assigned.state.projects.items[0];
		if (activeProject === undefined) {
			throw new Error("Expected the assigned project");
		}
		activeProject.duration = BALANCE.projectProgressPerWeek.research + 1;

		const result = projectsSystem(assigned.state, {
			phase: "projects",
			week: 2,
		});

		expect(result.state.projects.items[0]?.progress).toBe(
			BALANCE.projectProgressPerWeek.research,
		);
		expect(result.state.projects.items[0]?.status).toBe("active");
		expect(result.state.teams.items[0]?.activeProjectId).toBe(project.id);
		expect(result.facts).toContainEqual({
			kind: "project_progressed",
			projectId: project.id,
			amount: BALANCE.projectProgressPerWeek.research,
			week: 2,
		});
	});

	it("marks a project complete, emits completion, and frees its team", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}

		const assigned = assignProject(state, team.id, project);
		const activeProject = assigned.state.projects.items[0];
		if (activeProject === undefined) {
			throw new Error("Expected the assigned project");
		}
		activeProject.duration = BALANCE.projectProgressPerWeek.research;

		const result = projectsSystem(assigned.state, {
			phase: "projects",
			week: 2,
		});

		expect(result.state.projects.items[0]).toMatchObject({
			id: project.id,
			teamId: null,
			status: "completed",
			progress: BALANCE.projectProgressPerWeek.research,
		});
		expect(result.state.teams.items[0]?.activeProjectId).toBeNull();
		expect(result.facts).toContainEqual({
			kind: "project_completed",
			projectId: project.id,
			week: 2,
		});
	});

	it("cancels an active project and releases its team", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}

		const assigned = assignProject(state, team.id, project);
		const cancelled = cancelProject(assigned.state, team.id);

		expect(cancelled.state.teams.items[0]?.activeProjectId).toBeNull();
		expect(cancelled.state.projects.items[0]).toMatchObject({
			id: project.id,
			teamId: null,
			status: "cancelled",
		});
		expect(cancelled.state.commandLog.at(-1)).toEqual({
			id: "command_003",
			kind: "cancel_project",
			week: 1,
			teamId: team.id,
			projectId: project.id,
		});
		expect(cancelled.facts).toEqual([]);
	});

	it("can cancel an active project by its project object", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}

		const assigned = assignProject(state, team.id, project);
		const activeProject = assigned.state.projects.items[0];
		if (activeProject === undefined) {
			throw new Error("Expected the assigned project");
		}
		const cancelled = cancelProject(assigned.state, activeProject);

		expect(cancelled.state.projects.items[0]?.status).toBe("cancelled");
		expect(cancelled.state.teams.items[0]?.activeProjectId).toBeNull();
	});

	it("rejects cancellation requested by a different known team", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}
		const assigned = assignProject(state, team.id, project);
		assigned.state.teams.items.push({
			id: "team_002",
			name: "Other Team",
			activeProjectId: null,
		});

		expect(() => cancelProject(assigned.state, "team_002", project.id)).toThrow(
			/not assigned|team/i,
		);
		expect(assigned.state.projects.items[0]?.status).toBe("active");
	});

	it("rejects cancellation requested by an unknown team", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}
		const assigned = assignProject(state, team.id, project);

		expect(() => cancelProject(assigned.state, "team_404", project.id)).toThrow(
			/unknown team/i,
		);
		expect(() => cancelProject(assigned.state, "team_404")).toThrow(
			/unknown team/i,
		);
		expect(() => cancelProject(assigned.state, project.id)).toThrow(
			/unknown team/i,
		);
		expect(assigned.state.projects.items[0]?.status).toBe("active");
	});

	it("rejects cancellation for a project payload without an owner", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}
		const assigned = assignProject(state, team.id, project);
		const activeProject = assigned.state.projects.items[0];
		if (activeProject === undefined) {
			throw new Error("Expected the assigned project");
		}
		const ownerlessProject = { ...activeProject, teamId: null };

		expect(() => cancelProject(assigned.state, ownerlessProject)).toThrow(
			/owner|team/i,
		);
		expect(() =>
			cancelProject(assigned.state, team.id, {
				...activeProject,
				teamId: "team_404",
			}),
		).toThrow(/unknown team/i);
		expect(assigned.state.projects.items[0]?.status).toBe("active");
	});

	it("allows same-week project cancellation while a blocking decision awaits resolution", () => {
		const state = startRunWithInsight();
		const team = state.teams.items[0];
		const project = state.projects.items[0];
		if (team === undefined || project === undefined) {
			throw new Error("Expected the opening team and project");
		}
		const assigned = assignProject(state, team.id, project);
		const decisionAllocation = allocateId(assigned.state, "decision");
		const blockedState = {
			...decisionAllocation.state,
			decisions: {
				pending: [
					{
						kind: "incident" as const,
						id: decisionAllocation.id,
						incident: "outage" as const,
						blocking: true as const,
					},
				],
			},
			queue: {
				...decisionAllocation.state.queue,
				decisionIds: [decisionAllocation.id],
			},
		};

		const cancelled = cancelProject(blockedState, team.id);

		expect(cancelled.state.projects.items[0]?.status).toBe("cancelled");
	});

	it("deducts the exact weekly salary and base upkeep from cash", () => {
		const state = startRunWithInsight();
		const result = upkeepSystem(state, { phase: "upkeep", week: 2 });
		const expectedCost = BALANCE.salaries.foundingTeam + BALANCE.upkeep;

		expect(result.state.company.cash).toBe(state.company.cash - expectedCost);
		expect(result.facts).toEqual([
			{
				kind: "resource_changed",
				resource: "cash",
				amount: -expectedCost,
				week: 2,
			},
		]);
		expect(state.company.cash).toBe(BALANCE.startingCash);
	});
});
