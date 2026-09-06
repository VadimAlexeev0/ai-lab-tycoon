import { describe, expect, it } from "vitest";
import type { Model } from "./components/models.js";
import { assertFact } from "./components/reports.js";
import { assertRivalsState } from "./components/rivals.js";
import { BALANCE } from "./data/balance.js";
import {
	assertRivalStrategyActions,
	RIVAL_STRATEGY_ACTIONS,
} from "./data/rivals.js";
import {
	advanceWeek,
	applyDecision,
	GAME_STATE_SCHEMA_VERSION,
	launchProduct,
	startRun,
} from "./index.js";
import { assertGameState } from "./invariants.js";
import {
	deserializeGameState,
	serializeGameState,
	upgradeGameStateWithMetadata,
} from "./migrations.js";
import { isProductLaunchEligible, rivalLaunchPressure } from "./products.js";
import { replayCommandLog } from "./replay.js";
import { selectRecentReports, selectRivals } from "./selectors.js";
import { appendFactsAsReports } from "./systems/reporting.js";
import { rivalsSystem } from "./systems/rivals.js";
import { terminalSystem } from "./systems/terminal.js";

describe("deterministic rival strategy pressure", () => {
	it("publishes research, launches a model family, and raises the launch gate once", () => {
		const state = startRun({ companyName: "Strategy Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected opening rival");
		rival.progress = 100;
		const baseMinimumHype = BALANCE.productChannels.chat.minimumHype;
		const beforePressure = rivalLaunchPressure(state, baseMinimumHype);

		const result = rivalsSystem(state, { phase: "rivals", week: 1 });

		expect(result.facts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "rival_published",
					rivalId: rival.id,
					nodeId: "text_infrastructure_compute",
					week: 1,
				}),
				expect.objectContaining({
					kind: "rival_launched",
					rivalId: rival.id,
					familyId: "assistant",
					week: 1,
				}),
			]),
		);
		expect(result.state.rivals.items[0]).toMatchObject({
			publishedNodeIds: ["text_infrastructure_compute"],
			launchedFamilyIds: ["assistant"],
			eventCursor: 2,
		});
		expect(rivalLaunchPressure(result.state, baseMinimumHype)).toBeGreaterThan(
			beforePressure,
		);
	});

	it("catches up threshold jumps in deck order and does not replay actions", () => {
		const state = startRun({ companyName: "Strategy Labs" }, 42);
		const northstar = state.rivals.items[0];
		const marketSpring = state.rivals.items[1];
		if (northstar === undefined || marketSpring === undefined) {
			throw new Error("Expected the two opening rivals");
		}
		northstar.progress = 24;
		marketSpring.progress = 59;

		const result = rivalsSystem(state, { phase: "rivals", week: 1 });
		const strategyFacts = result.facts.filter(
			(fact) =>
				fact.kind === "rival_published" || fact.kind === "rival_launched",
		);

		expect(strategyFacts.map((fact) => fact.actionId)).toEqual([
			"northstar_publish_infrastructure_compute",
			"marketspring_publish_inference_price_war",
			"marketspring_launch_local_edge",
		]);
		expect(result.state.rivals.items[0]?.eventCursor).toBe(1);
		expect(result.state.rivals.items[1]?.eventCursor).toBe(2);

		const repeat = rivalsSystem(result.state, { phase: "rivals", week: 2 });
		expect(
			repeat.facts.filter(
				(fact) =>
					fact.kind === "rival_published" || fact.kind === "rival_launched",
			),
		).toEqual([]);
	});

	it("keeps all three rival clocks and family action decks deterministic in Assistant", () => {
		const state = assistantState();
		const opening = rivalsSystem(state, { phase: "rivals", week: 1 });
		expect(opening.state.rivals.items.map((rival) => rival.progress)).toEqual([
			7, 9, 6,
		]);
		expect(
			opening.facts.filter(
				(fact) =>
					fact.kind === "rival_published" || fact.kind === "rival_launched",
			),
		).toEqual([]);

		for (const rival of opening.state.rivals.items) rival.progress = 100;
		const jumped = rivalsSystem(opening.state, {
			phase: "rivals",
			week: 2,
		});
		expect(
			jumped.facts
				.filter(
					(fact) =>
						fact.kind === "rival_published" || fact.kind === "rival_launched",
				)
				.map((fact) =>
					fact.kind === "rival_published"
						? `publication:${fact.rivalId}:${fact.nodeId}`
						: `launch:${fact.rivalId}:${fact.familyId}`,
				),
		).toEqual([
			"publication:rival_001:text_infrastructure_compute",
			"launch:rival_001:assistant",
			"publication:rival_002:inference_price_war",
			"launch:rival_002:local_edge",
			"launch:rival_002:agent",
			"publication:rival_003:sparse_moe",
			"launch:rival_003:text",
		]);
	});

	it("rejects malformed strategy content and persisted action state", () => {
		expect(() =>
			assertRivalStrategyActions([
				...RIVAL_STRATEGY_ACTIONS,
				{ ...RIVAL_STRATEGY_ACTIONS[0] },
			]),
		).toThrow(/duplicate.*action/i);

		const unknownNodeActions = RIVAL_STRATEGY_ACTIONS.map((action, index) =>
			index === 0 ? { ...action, nodeId: "unknown_research_node" } : action,
		);
		expect(() => assertRivalStrategyActions(unknownNodeActions)).toThrow(
			/unknown.*research node/i,
		);

		const duplicateReferenceActions = [
			...RIVAL_STRATEGY_ACTIONS,
			{
				...RIVAL_STRATEGY_ACTIONS[0],
				id: "northstar_publish_duplicate",
				threshold: 75,
			},
		];
		expect(() => assertRivalStrategyActions(duplicateReferenceActions)).toThrow(
			/duplicate|repeat/i,
		);

		const invalidThresholdActions = RIVAL_STRATEGY_ACTIONS.map(
			(action, index) => (index === 0 ? { ...action, threshold: 0 } : action),
		);
		expect(() => assertRivalStrategyActions(invalidThresholdActions)).toThrow(
			/threshold/i,
		);

		const invalidKindActions = RIVAL_STRATEGY_ACTIONS.map((action, index) =>
			index === 0 ? ({ ...action, kind: "unknown" } as never) : action,
		);
		expect(() => assertRivalStrategyActions(invalidKindActions)).toThrow(
			/kind/i,
		);

		const missingFieldState = startRun({ companyName: "Strategy Labs" }, 42);
		const missingFieldRival = missingFieldState.rivals.items[0];
		if (missingFieldRival === undefined) throw new Error("Expected rival");
		delete (missingFieldRival as unknown as Record<string, unknown>)
			.eventCursor;
		expect(() => assertGameState(missingFieldState)).toThrow(/strategy field/i);

		const unknownReferenceState = startRun(
			{ companyName: "Strategy Labs" },
			42,
		);
		const unknownReferenceRival = unknownReferenceState.rivals.items[0];
		if (unknownReferenceRival === undefined) throw new Error("Expected rival");
		unknownReferenceRival.publishedNodeIds = ["unknown_research_node"];
		expect(() => assertGameState(unknownReferenceState)).toThrow(
			/unknown.*published.*node/i,
		);

		const impossibleState = startRun({ companyName: "Strategy Labs" }, 42);
		const impossibleRival = impossibleState.rivals.items[0];
		if (impossibleRival === undefined) throw new Error("Expected rival");
		impossibleRival.progress = 0;
		impossibleRival.eventCursor = 1;
		impossibleRival.publishedNodeIds = ["text_infrastructure_compute"];
		expect(() => assertRivalsState(impossibleState.rivals)).toThrow(
			/before.*threshold/i,
		);

		const inactiveState = startRun({ companyName: "Strategy Labs" }, 42);
		const inactiveRival = inactiveState.rivals.items[0];
		if (inactiveRival === undefined) throw new Error("Expected rival");
		inactiveRival.active = false;
		inactiveRival.progress = 25;
		inactiveRival.eventCursor = 1;
		inactiveRival.publishedNodeIds = ["text_infrastructure_compute"];
		expect(() => assertGameState(inactiveState)).toThrow(
			/inactive.*completed/i,
		);
	});

	it("validates rival action facts against canonical content and balance", () => {
		const published = {
			kind: "rival_published" as const,
			rivalId: "rival_001",
			actionId: "northstar_publish_infrastructure_compute",
			nodeId: "text_infrastructure_compute",
			commandId: "command_002",
			threshold: 25,
			progress: 31,
			pressure: BALANCE.rivalStrategy.publicationPressure,
			week: 1,
		};
		const launched = {
			kind: "rival_launched" as const,
			rivalId: "rival_001",
			actionId: "northstar_launch_assistant",
			familyId: "assistant" as const,
			commandId: "command_002",
			threshold: 50,
			progress: 50,
			pressure: BALANCE.rivalStrategy.launchPressure,
			week: 1,
		};

		expect(() => assertFact(published)).not.toThrow();
		expect(() => assertFact(launched)).not.toThrow();
		expect(() => assertFact({ ...published, nodeId: "unknown" })).toThrow(
			/action|node/i,
		);
		expect(() => assertFact({ ...launched, familyId: "unknown" })).toThrow(
			/family/i,
		);
		expect(() => assertFact({ ...published, progress: 24 })).toThrow(
			/progress|threshold/i,
		);

		const terminal = terminalSystem(
			{
				...startRun({ companyName: "Strategy Labs" }, 42),
				company: {
					...startRun({ companyName: "Strategy Labs" }, 42).company,
					cash: 0,
				},
			},
			{
				phase: "terminal",
				week: 1,
				facts: [published],
			},
		);
		expect(terminal.state.terminal.contributors[0]).toMatchObject({
			kind: "rival_published",
			impact: published.pressure,
		});

		const forgedReportState = appendFactsAsReports(
			startRun({ companyName: "Strategy Labs" }, 42),
			[published],
		);
		expect(() => assertGameState(forgedReportState)).toThrow(
			/history|cursor|strategy/i,
		);
	});

	it("persists rival facts in the report queue and exposes action history safely", () => {
		const state = startRun({ companyName: "Strategy Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected opening rival");
		rival.progress = 100;
		const before = serializeGameState(state);

		const result = advanceWeek(state);
		const strategyReports = result.state.reports.items.filter(
			(report) =>
				report.fact.kind === "rival_published" ||
				report.fact.kind === "rival_launched",
		);
		expect(strategyReports).toHaveLength(2);
		expect(
			strategyReports.every((report) => report.priority === "important"),
		).toBe(true);
		expect(
			strategyReports.every((report) =>
				result.state.queue.reportIds.includes(report.id),
			),
		).toBe(true);

		const visibleRival = selectRivals(result.state)[0];
		if (visibleRival === undefined) throw new Error("Expected visible rival");
		expect(visibleRival).toMatchObject({
			publishedNodeIds: ["text_infrastructure_compute"],
			launchedFamilyIds: ["assistant"],
			eventCursor: 2,
		});
		const visibleReport = selectRecentReports(result.state).find(
			(report) => report.fact.kind === "rival_published",
		);
		if (visibleReport === undefined) throw new Error("Expected rival report");
		if (visibleRival.publishedNodeIds === undefined) {
			throw new Error("Expected published node history");
		}
		visibleRival.publishedNodeIds.push("tampered");
		(visibleReport.fact as Record<string, unknown>).rivalId = "tampered";
		expect(result.state.rivals.items[0]?.publishedNodeIds).toEqual([
			"text_infrastructure_compute",
		]);
		expect(
			strategyReports.some(
				(report) =>
					(report.fact.kind === "rival_published" ||
						report.fact.kind === "rival_launched") &&
					report.fact.rivalId === "tampered",
			),
		).toBe(false);
		expect(serializeGameState(state)).toBe(before);
	});

	it("makes the existing product launch gate harder after a rival strategy move", () => {
		const state = readyTextState();
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected opening rival");
		rival.progress = 100;
		state.company.hype = 9;

		expect(isProductLaunchEligible(state, "model_001", "chat")).toBe(true);
		const result = rivalsSystem(state, { phase: "rivals", week: 1 });
		expect(rivalLaunchPressure(result.state, 5)).toBe(10);
		expect(isProductLaunchEligible(result.state, "model_001", "chat")).toBe(
			false,
		);
		expect(() => launchProduct(result.state, "model_001", "chat")).toThrow(
			/Hype 10/i,
		);
	});

	it("migrates v10 rival saves with deterministic defaults and rejects future fields", () => {
		const fixture = v10Fixture();
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameStateWithMetadata(fixture);
		expect(upgraded.sourceSchemaVersion).toBe(10);
		expect(upgraded.currentSchemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
		expect(upgraded.state.meta.schemaVersion).toBe(11);
		expect(
			upgraded.state.rivals.items.every(
				(rival) =>
					rival.publishedNodeIds.length === 0 &&
					rival.launchedFamilyIds.length === 0 &&
					rival.eventCursor === 0,
			),
		).toBe(true);
		expect(JSON.stringify(fixture)).toBe(before);
		expect(upgradeGameStateWithMetadata(upgraded.state).state).toEqual(
			upgraded.state,
		);

		const future = v10Fixture();
		const futureRival = future.rivals.items[0];
		if (futureRival === undefined) throw new Error("Expected v10 rival");
		futureRival.eventCursor = 0;
		const futureBefore = JSON.stringify(future);
		expect(() => upgradeGameStateWithMetadata(future)).toThrow(
			/future|unexpected|strategy/i,
		);
		expect(JSON.stringify(future)).toBe(futureBefore);
	});

	it("keeps rival strategy state, reports, and command replay save-equal", () => {
		const state = runUntilRivalLaunchAction();
		const serialized = serializeGameState(state);
		const restored = deserializeGameState(serialized);

		expect(serializeGameState(restored)).toBe(serialized);
		expect(
			restored.reports.items.some(
				(report) => report.fact.kind === "rival_published",
			),
		).toBe(true);
		expect(
			restored.reports.items.some(
				(report) => report.fact.kind === "rival_launched",
			),
		).toBe(true);
		const replayed = replayCommandLog(restored.commandLog, {
			expectedState: restored,
		});
		expect(serializeGameState(replayed)).toBe(serialized);
	});
});

function v10Fixture(): V10Fixture {
	const fixture = JSON.parse(
		serializeGameState(startRun({ companyName: "Strategy Labs" }, 42)),
	) as V10Fixture;
	for (const rival of fixture.rivals.items) {
		delete rival.publishedNodeIds;
		delete rival.launchedFamilyIds;
		delete rival.eventCursor;
	}
	fixture.meta.schemaVersion = 10;
	return fixture;
}

type V10Fixture = Record<string, unknown> & {
	meta: { schemaVersion: number };
	rivals: { items: Record<string, unknown>[] };
};

function runUntilRivalLaunchAction(): ReturnType<typeof startRun> {
	let state = startRun({ companyName: "Strategy Labs" }, 42);
	const opening = advanceWeek(state);
	const paradigm = opening.state.decisions.pending.find(
		(decision) => decision.kind === "paradigm",
	);
	if (paradigm === undefined) throw new Error("Expected opening paradigm");
	const paradigmId = paradigm.choices[0];
	if (paradigmId === undefined) throw new Error("Expected paradigm choice");
	state = applyDecision(opening.state, {
		kind: "paradigm",
		decisionId: paradigm.id,
		paradigmId,
	}).state;
	for (let index = 0; index < 7; index += 1) {
		state = advanceWeek(state).state;
	}
	return state;
}

function assistantState(): ReturnType<typeof startRun> {
	const state = readyTextState();
	for (const node of state.research.nodes) {
		if (node.era === "text") node.status = "completed";
	}
	const launched = launchProduct(state, "model_001", "chat").state;
	launched.meta.era = "assistant";
	launched.research.currentEra = "assistant";
	return launched;
}

function readyTextState(): ReturnType<typeof startRun> {
	const state = startRun({ companyName: "Strategy Labs" }, 42);
	const unlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (unlock === undefined) throw new Error("Expected Text model unlock");
	unlock.status = "completed";
	const model: Model = {
		id: "model_001",
		name: "Aurora-1",
		foundation: "fresh",
		status: "ready",
		projectId: null,
		family: "text",
		tier: "standard",
		scoreCeiling: 88,
		dataMix: { general: 70, code: 20, multimodal: 10 },
		emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		trueScores: {
			capability: 100,
			coding: 100,
			reliability: 100,
			safety: 100,
			efficiency: 100,
			multimodal: 0,
		},
		estimates: {
			capability: { estimate: 100, lower: 80, upper: 100 },
			coding: { estimate: 100, lower: 80, upper: 100 },
			reliability: { estimate: 100, lower: 80, upper: 100 },
			safety: { estimate: 100, lower: 80, upper: 100 },
			efficiency: { estimate: 100, lower: 80, upper: 100 },
			multimodal: { estimate: 0, lower: 0, upper: 20 },
		},
	};
	state.models.items = [model];
	state.company.hype = 10;
	return state;
}
