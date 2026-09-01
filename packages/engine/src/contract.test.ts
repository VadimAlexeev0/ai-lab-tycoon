import { describe, expect, it } from "vitest";
import { WEEKLY_SYSTEMS } from "./advance-week.js";
import * as Engine from "./index.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import type { GameState } from "./state.js";
import { createInitialGameState } from "./state.js";
import type { GameSystem } from "./systems/types.js";

function cloneState(state: GameState): GameState {
	return JSON.parse(JSON.stringify(state)) as GameState;
}

function completeTextFamilyUnlock(state: GameState): void {
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) {
		throw new Error("Expected Text model family unlock");
	}
	familyUnlock.status = "completed";
}

function addLaunchDecision(state: GameState): void {
	completeTextFamilyUnlock(state);
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			family: "text",
			tier: "lean",
		},
	];
	state.decisions.pending = [
		{
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			blocking: true,
		},
	];
	state.queue.decisionIds = ["decision_001"];
}

function addReport(state: GameState, acknowledged: boolean): void {
	state.reports.items = [
		{
			id: "report_001",
			priority: "important",
			acknowledged,
			fact: {
				kind: "resource_changed",
				resource: "cash",
				amount: -10,
				week: 1,
			},
		},
	];
	state.reports.totalCount = 1;
	state.queue.reportIds = acknowledged ? [] : ["report_001"];
}

type StateRecord = Record<string, unknown>;

function asRecord(value: unknown): StateRecord {
	return value as StateRecord;
}

describe("hardened component contract", () => {
	it("validates unknown input and rejects missing or malformed root fields", () => {
		expect(() => assertGameState(null)).toThrow(/object/i);
		expect(() => assertGameState([])).toThrow(/object|state/i);
		expect(() => assertGameState({})).toThrow(/state|meta/i);

		const missingName = startRun({ companyName: "Acme Labs" }, 42);
		delete asRecord(missingName.company).name;
		expect(() => assertGameState(missingName)).toThrow(/name/i);

		const malformedItems = startRun({ companyName: "Acme Labs" }, 42);
		malformedItems.teams.items = {} as never;
		expect(() => assertGameState(malformedItems)).toThrow(/array|items/i);

		const missingCommandCounter = startRun({ companyName: "Acme Labs" }, 42);
		delete asRecord(missingCommandCounter.counters).command;
		expect(() => assertGameState(missingCommandCounter)).toThrow(/command/i);
	});

	it("rejects invalid discriminants, booleans, and integer fields at runtime", () => {
		const cases: Array<{
			name: string;
			mutate: (state: GameState) => void;
			message: RegExp;
		}> = [
			{
				name: "product channel",
				mutate: (state) => {
					state.products.items = [
						{
							id: "product_001",
							channel: "invalid" as never,
							modelId: "model_001",
							status: "planned",
						},
					];
				},
				message: /channel/i,
			},
			{
				name: "product status",
				mutate: (state) => {
					state.products.items = [
						{
							id: "product_001",
							channel: "chat",
							modelId: "model_001",
							status: "invalid" as never,
						},
					];
				},
				message: /status/i,
			},
			{
				name: "terminal status",
				mutate: (state) => {
					state.terminal.status = "invalid" as never;
				},
				message: /status/i,
			},
			{
				name: "terminal reason",
				mutate: (state) => {
					state.terminal.reason = "invalid" as never;
				},
				message: /reason/i,
			},
			{
				name: "terminal frontier boolean",
				mutate: (state) => {
					state.terminal.frontierReached = "yes" as never;
				},
				message: /boolean|frontier/i,
			},
			{
				name: "project kind",
				mutate: (state) => {
					state.projects.items = [
						{
							kind: "invalid" as never,
							id: "project_001",
							teamId: null,
							status: "available",
							progress: 0,
							duration: 1,
						} as never,
					];
				},
				message: /kind/i,
			},
			{
				name: "project status",
				mutate: (state) => {
					state.projects.items = [
						{
							kind: "research",
							id: "project_001",
							teamId: null,
							nodeId: "node_001",
							status: "invalid" as never,
							progress: 0,
							duration: 1,
						},
					];
				},
				message: /status/i,
			},
			{
				name: "project integer",
				mutate: (state) => {
					state.projects.items = [
						{
							kind: "research",
							id: "project_001",
							teamId: null,
							nodeId: "node_001",
							status: "available",
							progress: 0.5,
							duration: 1,
						},
					];
				},
				message: /integer|progress/i,
			},
			{
				name: "model foundation",
				mutate: (state) => {
					state.models.items = [
						{
							id: "model_001",
							name: "Aurora-1",
							foundation: "invalid" as never,
							status: "ready",
							projectId: null,
						},
					];
				},
				message: /foundation/i,
			},
			{
				name: "model status",
				mutate: (state) => {
					state.models.items = [
						{
							id: "model_001",
							name: "Aurora-1",
							foundation: "fresh",
							status: "invalid" as never,
							projectId: null,
						},
					];
				},
				message: /status/i,
			},
			{
				name: "research era",
				mutate: (state) => {
					state.research.currentEra = "invalid" as never;
				},
				message: /era/i,
			},
			{
				name: "research branch",
				mutate: (state) => {
					state.research.nodes = [
						{
							id: "node_001",
							era: "text",
							branch: "invalid" as never,
							status: "available",
							insightCost: 1,
							prerequisites: [],
						},
					];
				},
				message: /branch/i,
			},
			{
				name: "research node status",
				mutate: (state) => {
					state.research.nodes = [
						{
							id: "node_001",
							era: "text",
							branch: "models",
							status: "invalid" as never,
							insightCost: 1,
							prerequisites: [],
						},
					];
				},
				message: /status/i,
			},
			{
				name: "rival archetype",
				mutate: (state) => {
					state.rivals.items = [
						{
							id: "rival_001",
							name: "Rival",
							archetype: "invalid" as never,
							focus: "capability",
							progress: 0,
							active: true,
						},
					];
				},
				message: /archetype/i,
			},
			{
				name: "rival focus",
				mutate: (state) => {
					state.rivals.items = [
						{
							id: "rival_001",
							name: "Rival",
							archetype: "research_lab",
							focus: "invalid" as never,
							progress: 0,
							active: true,
						},
					];
				},
				message: /focus/i,
			},
			{
				name: "rival active boolean",
				mutate: (state) => {
					state.rivals.items = [
						{
							id: "rival_001",
							name: "Rival",
							archetype: "research_lab",
							focus: "capability",
							progress: 0,
							active: 1 as never,
						},
					];
				},
				message: /boolean|active/i,
			},
			{
				name: "funding round",
				mutate: (state) => {
					state.funding.seed.round = "invalid" as never;
				},
				message: /round/i,
			},
			{
				name: "funding status",
				mutate: (state) => {
					state.funding.seed.status = "invalid" as never;
				},
				message: /status/i,
			},
			{
				name: "report priority",
				mutate: (state) => {
					state.reports.items = [
						{
							id: "report_001",
							priority: "invalid" as never,
							acknowledged: false,
							fact: {
								kind: "resource_changed",
								resource: "cash",
								amount: 1,
								week: 1,
							},
						},
					];
					state.reports.totalCount = 1;
				},
				message: /priority/i,
			},
			{
				name: "report acknowledged boolean",
				mutate: (state) => {
					state.reports.items = [
						{
							id: "report_001",
							priority: "important",
							acknowledged: "no" as never,
							fact: {
								kind: "resource_changed",
								resource: "cash",
								amount: 1,
								week: 1,
							},
						},
					];
					state.reports.totalCount = 1;
				},
				message: /boolean|acknowledged/i,
			},
			{
				name: "fact resource",
				mutate: (state) => {
					state.reports.items = [
						{
							id: "report_001",
							priority: "important",
							acknowledged: false,
							fact: {
								kind: "resource_changed",
								resource: "invalid" as never,
								amount: 1,
								week: 1,
							},
						},
					];
					state.reports.totalCount = 1;
				},
				message: /resource/i,
			},
			{
				name: "fact funding outcome",
				mutate: (state) => {
					state.reports.items = [
						{
							id: "report_001",
							priority: "important",
							acknowledged: false,
							fact: {
								kind: "funding_resolved",
								round: "seed",
								outcome: "invalid" as never,
								week: 1,
							},
						},
					];
					state.reports.totalCount = 1;
				},
				message: /outcome/i,
			},
			{
				name: "warning code",
				mutate: (state) => {
					state.warnings = [{ code: "invalid" as never, severity: "info" }];
				},
				message: /code/i,
			},
			{
				name: "warning severity",
				mutate: (state) => {
					state.warnings = [{ code: "cash_low", severity: "invalid" as never }];
				},
				message: /severity/i,
			},
		];

		for (const testCase of cases) {
			const state = startRun({ companyName: "Acme Labs" }, 42);
			testCase.mutate(state);
			expect(() => assertGameState(state), testCase.name).toThrow(
				testCase.message,
			);
		}
	});

	it("enforces project status semantics", () => {
		const availableWithTeam = startRun({ companyName: "Acme Labs" }, 42);
		availableWithTeam.teams.items = [
			{ id: "team_001", name: "Founding Team", activeProjectId: null },
		];
		availableWithTeam.projects.items = [
			{
				kind: "research",
				id: "project_001",
				teamId: "team_001",
				nodeId: "node_001",
				status: "available",
				progress: 0,
				duration: 1,
			},
		];
		expect(() => assertGameState(availableWithTeam)).toThrow(/available|team/i);

		const incompleteCompleted = startRun({ companyName: "Acme Labs" }, 42);
		incompleteCompleted.projects.items = [
			{
				kind: "research",
				id: "project_001",
				teamId: null,
				nodeId: "node_001",
				status: "completed",
				progress: 0,
				duration: 1,
			},
		];
		expect(() => assertGameState(incompleteCompleted)).toThrow(
			/completed|duration/i,
		);

		const cancelledPartial = startRun({ companyName: "Acme Labs" }, 42);
		cancelledPartial.teams.items = [
			{ id: "team_001", name: "Founding Team", activeProjectId: null },
		];
		cancelledPartial.projects.items = [
			{
				kind: "research",
				id: "project_001",
				teamId: "team_001",
				nodeId: "node_001",
				status: "cancelled",
				progress: 1,
				duration: 2,
			},
		];
		expect(() => assertGameState(cancelledPartial)).not.toThrow();

		const cancelledTeam = cancelledPartial.teams.items.at(0);
		if (cancelledTeam === undefined) {
			throw new Error("Expected a cancelled project team fixture");
		}
		cancelledTeam.activeProjectId = "project_001";
		expect(() => assertGameState(cancelledPartial)).toThrow(
			/cancelled|active project|ownership/i,
		);
	});

	it("requires bidirectional decision and report queue ownership", () => {
		const missingDecisionQueue = startRun({ companyName: "Acme Labs" }, 42);
		addLaunchDecision(missingDecisionQueue);
		missingDecisionQueue.queue.decisionIds = [];
		expect(() => assertGameState(missingDecisionQueue)).toThrow(
			/decision queue/i,
		);

		const unacknowledgedReportMissing = startRun(
			{ companyName: "Acme Labs" },
			42,
		);
		addReport(unacknowledgedReportMissing, false);
		expect(() => assertGameState(unacknowledgedReportMissing)).not.toThrow();
		unacknowledgedReportMissing.queue.reportIds = [];
		expect(() => assertGameState(unacknowledgedReportMissing)).toThrow(
			/report queue/i,
		);

		const acknowledgedReportQueued = startRun({ companyName: "Acme Labs" }, 42);
		addReport(acknowledgedReportQueued, true);
		acknowledgedReportQueued.queue.reportIds = ["report_001"];
		expect(() => assertGameState(acknowledgedReportQueued)).toThrow(
			/acknowledged|report queue/i,
		);
	});

	it("enforces current model project reciprocity without linking history", () => {
		const active = startRun({ companyName: "Acme Labs" }, 42);
		completeTextFamilyUnlock(active);
		active.teams.items = [
			{ id: "team_001", name: "Founding Team", activeProjectId: "project_001" },
		];
		active.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "training",
				projectId: "project_001",
				family: "text",
				tier: "lean",
			},
		];
		active.projects.items = [
			{
				kind: "training",
				id: "project_001",
				teamId: "team_001",
				modelId: "model_001",
				status: "active",
				progress: 0,
				duration: 2,
			},
		];
		active.compute.trainingDemand = 3;
		active.compute.allocated = 3;
		expect(() => assertGameState(active)).not.toThrow();

		const activeModel = active.models.items.at(0);
		if (activeModel === undefined) {
			throw new Error("Expected an active model fixture");
		}
		activeModel.projectId = null;
		expect(() => assertGameState(active)).toThrow(/reciprocal|project/i);

		const historical = startRun({ companyName: "Acme Labs" }, 42);
		completeTextFamilyUnlock(historical);
		historical.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "ready",
				projectId: null,
				family: "text",
				tier: "lean",
			},
		];
		historical.projects.items = [
			{
				kind: "training",
				id: "project_001",
				teamId: null,
				modelId: "model_001",
				status: "completed",
				progress: 2,
				duration: 2,
			},
		];
		expect(() => assertGameState(historical)).not.toThrow();

		const incompatible = startRun({ companyName: "Acme Labs" }, 42);
		completeTextFamilyUnlock(incompatible);
		incompatible.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "ready",
				projectId: "project_001",
				family: "text",
				tier: "lean",
			},
		];
		incompatible.projects.items = [
			{
				kind: "research",
				id: "project_001",
				teamId: null,
				nodeId: "node_001",
				status: "completed",
				progress: 1,
				duration: 1,
			},
		];
		expect(() => assertGameState(incompatible)).toThrow(
			/compatible|model project/i,
		);
	});

	it("rejects cycles, negative zero, non-JSON values, array own-key extensions, and deliberately rejects null-prototype objects", () => {
		const cyclic = startRun({ companyName: "Acme Labs" }, 42);
		asRecord(cyclic).cycle = cyclic;
		expect(() => assertGameState(cyclic)).toThrow(/cycle/i);

		const negativeZero = startRun({ companyName: "Acme Labs" }, 42);
		negativeZero.rng.seed = -0;
		expect(() => assertGameState(negativeZero)).toThrow(/negative zero|JSON/i);

		const extraArrayKey = startRun({ companyName: "Acme Labs" }, 42);
		asRecord(extraArrayKey.teams.items).extra = undefined;
		expect(() => assertGameState(extraArrayKey)).toThrow(/array|own|JSON/i);

		const symbolArrayKey = startRun({ companyName: "Acme Labs" }, 42);
		const symbol = Symbol("extra");
		(symbolArrayKey.teams.items as unknown as Record<PropertyKey, unknown>)[
			symbol
		] = "invalid";
		expect(() => assertGameState(symbolArrayKey)).toThrow(/symbol|array/i);

		const nonJson = startRun({ companyName: "Acme Labs" }, 42);
		asRecord(nonJson).unexpected = () => undefined;
		expect(() => assertGameState(nonJson)).toThrow(/non-JSON/i);

		const nullPrototype = startRun({ companyName: "Acme Labs" }, 42);
		const company = Object.create(null) as StateRecord;
		company.name = "Acme Labs";
		company.cash = 0;
		company.insight = 0;
		company.trust = 60;
		company.hype = 0;
		nullPrototype.company = company as unknown as GameState["company"];
		expect(() => assertGameState(nullPrototype)).toThrow(/plain object/i);
	});

	it("validates choices before deferring command implementation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		addLaunchDecision(state);

		expect(() =>
			applyDecision(state, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "invalid" as never,
			}),
		).toThrow(/channel/i);

		expect(() =>
			applyDecision(state, {
				kind: "evaluate",
				decisionId: "decision_001",
				evaluation: "capability",
			}),
		).toThrow(/compatible|decision/i);

		expect(() =>
			applyDecision(state, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			}),
		).toThrow(/not implemented/i);

		const clean = startRun({ companyName: "Acme Labs" }, 42);
		expect(advanceWeek(clean).state.meta.week).toBe(2);
	});

	it("validates setup and asserts the completed initial state", () => {
		expect(() => startRun({ companyName: "   " }, 42)).toThrow(/company name/i);
		expect(() => startRun({ companyName: "Acme Labs" }, -0)).toThrow(
			/seed|zero/i,
		);

		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(() => assertGameState(state)).not.toThrow();
	});

	it("stores replayable command payloads and keeps the root API minimal", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(state.commandLog[0]).toEqual({
			id: "command_001",
			kind: "start_run",
			week: 1,
			setup: { companyName: "Acme Labs" },
			seed: 42,
		});

		const applyEntry = cloneState(state);
		applyEntry.commandLog = [
			...state.commandLog,
			{
				id: "command_002",
				kind: "apply_decision",
				week: 1,
				choice: {
					kind: "launch",
					decisionId: "decision_001",
					channel: "chat",
				},
			},
		];
		expect(() => assertGameState(applyEntry)).not.toThrow();

		const advanceEntry = cloneState(state);
		advanceEntry.commandLog = [
			...state.commandLog,
			{ id: "command_002", kind: "advance_week", week: 1 },
		];
		expect(() => assertGameState(advanceEntry)).not.toThrow();

		const projectEntries = cloneState(state);
		projectEntries.commandLog = [
			...state.commandLog,
			{
				id: "command_002",
				kind: "assign_project",
				week: 1,
				teamId: "team_001",
				projectId: "project_001",
			},
			{
				id: "command_003",
				kind: "cancel_project",
				week: 1,
				teamId: "team_001",
				projectId: "project_001",
			},
		];
		expect(() => assertGameState(projectEntries)).not.toThrow();

		const deferredCommandFixtures: Array<GameState["commandLog"][number]> = [
			{
				id: "command_002",
				kind: "buy_compute",
				week: 1,
				amount: 4,
			},
			{
				id: "command_002",
				kind: "hire_team",
				week: 1,
				name: "Research Team",
			},
			{
				id: "command_002",
				kind: "product_resume",
				week: 1,
				productId: "product_001",
			},
		];
		for (const command of deferredCommandFixtures) {
			const deferred = cloneState(state);
			deferred.commandLog.push(command);
			expect(() => assertGameState(deferred)).not.toThrow(command.kind);
		}

		const invalidEntry = cloneState(state);
		(asRecord(invalidEntry.commandLog[0]) as StateRecord).seed = 1.5;
		expect(() => assertGameState(invalidEntry)).toThrow(/seed|integer/i);

		const publicRuntimeKeys = Object.keys(Engine).sort();
		expect(publicRuntimeKeys).toEqual([
			"ENGINE_PACKAGE_NAME",
			"GAME_STATE_SCHEMA_VERSION",
			"advanceWeek",
			"applyDecision",
			"applyProductResume",
			"assertGameState",
			"assignProject",
			"buyCompute",
			"cancelProject",
			"deserializeGameState",
			"deserializeGameStateWithMetadata",
			"designModel",
			"fundingFactors",
			"hireTeam",
			"launchProduct",
			"replayCommandLog",
			"runEvaluation",
			"selectAvailableProjects",
			"selectFunding",
			"selectNextObjective",
			"selectPendingDecisions",
			"selectProducts",
			"selectRecentReports",
			"selectResearchNodes",
			"selectResearchParadigm",
			"selectResourceBar",
			"selectRivals",
			"selectTeams",
			"selectTerminalObjective",
			"selectTerminalProjection",
			"selectVisibleModels",
			"selectVisibleState",
			"serializeGameState",
			"setAssertionsEnabled",
			"startRun",
			"upgradeGameState",
			"upgradeGameStateWithMetadata",
		]);
	});

	it("requires a non-empty command log replay anchor", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.commandLog = [];

		expect(() => assertGameState(state)).toThrow(
			/non-empty|command log|start_run/i,
		);
	});

	it("requires the start_run command at index zero", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const anchor = state.commandLog[0];
		if (anchor === undefined || anchor.kind !== "start_run") {
			throw new Error("Expected the initial start_run command");
		}
		state.commandLog = [
			{ id: "command_002", kind: "advance_week", week: 1 },
			anchor,
		];

		expect(() => assertGameState(state)).toThrow(
			/first|index|start_run|sequential/i,
		);
	});

	it("requires the start_run command at week one", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const anchor = state.commandLog[0];
		if (anchor === undefined || anchor.kind !== "start_run") {
			throw new Error("Expected the initial start_run command");
		}
		state.meta.week = 2;
		anchor.week = 2;

		expect(() => assertGameState(state)).toThrow(/start_run|week|anchor/i);
	});

	it("rejects later start_run commands", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.commandLog.push({
			id: "command_002",
			kind: "start_run",
			week: 1,
			setup: { companyName: "Acme Labs" },
			seed: 42,
		});

		expect(() => assertGameState(state)).toThrow(/only|later|start_run/i);
	});

	it("requires the start_run seed to match the state RNG seed", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.rng.seed = 43;

		expect(() => assertGameState(state)).toThrow(/seed/i);
	});

	it("requires the start_run setup name to match the company state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.name = "Other Labs";

		expect(() => assertGameState(state)).toThrow(/company|setup|name/i);
	});

	it("requires command weeks to be non-decreasing in log order", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.week = 2;
		state.commandLog.push(
			{ id: "command_002", kind: "advance_week", week: 2 },
			{ id: "command_003", kind: "advance_week", week: 1 },
		);

		expect(() => assertGameState(state)).toThrow(/non-decreasing|order|week/i);
	});

	it("rejects command weeks beyond the current meta week", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.commandLog.push({
			id: "command_002",
			kind: "advance_week",
			week: 2,
		});

		expect(() => assertGameState(state)).toThrow(/future week|meta week/i);
	});

	it("declares deeply readonly system inputs", () => {
		const system: GameSystem = (state) => {
			// @ts-expect-error nested company values are readonly
			state.company.cash = 0;
			// @ts-expect-error component arrays are readonly
			state.teams.items.push({
				id: "team_001",
				name: "Team",
				activeProjectId: null,
			});
			// @ts-expect-error nested arrays are readonly
			state.research.nodes[0]?.prerequisites.push("node_001");

			return {
				state: createInitialGameState({ companyName: "Acme Labs" }, 42),
				facts: [],
				pending: [],
			};
		};

		void system;
	});

	it("declares ownership for every registered weekly system", () => {
		expect(WEEKLY_SYSTEMS).toHaveLength(11);
		for (const registration of WEEKLY_SYSTEMS) {
			expect(registration.reads.length, registration.phase).toBeGreaterThan(0);
			expect(registration.writes.length, registration.phase).toBeGreaterThan(0);
		}
	});

	it("keeps newly created decisions in both state and queue before returning", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const result = advanceWeek(state);
		expect(result.state.queue.decisionIds).toEqual(
			result.state.decisions.pending.map((decision) => decision.id),
		);
	});
});
