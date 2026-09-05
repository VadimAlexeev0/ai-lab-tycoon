import { describe, expect, it } from "vitest";
import { assertRivalsState } from "./components/rivals.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import {
	serializeGameState,
	upgradeGameStateWithMetadata,
} from "./migrations.js";
import { replayCommandLog } from "./replay.js";
import type { CommandLogEntry } from "./state.js";
import { rivalsSystem } from "./systems/rivals.js";

type V10Fixture = Record<string, unknown> & {
	meta: { schemaVersion: number };
	rivals: { items: Record<string, unknown>[] };
	commandLog: CommandLogEntry[];
};

function asRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected a plain object fixture");
	}
	return value as Record<string, unknown>;
}

function fixtureRival(fixture: V10Fixture): Record<string, unknown> {
	const rival = fixture.rivals.items[0];
	if (rival === undefined) throw new Error("Expected v10 rival");
	return rival;
}

function v10ReplayFixture(): V10Fixture {
	let state = startRun({ companyName: "Legacy Replay Labs" }, 42);
	for (let index = 0; index < 5; index += 1) {
		state = advanceWeek(state).state;
		const blocking = state.decisions.pending.find(
			(decision) => decision.blocking,
		);
		if (blocking?.kind !== "paradigm") continue;
		const paradigmId = blocking.choices[0];
		if (paradigmId === undefined) throw new Error("Expected a paradigm choice");
		state = applyDecision(state, {
			kind: "paradigm",
			decisionId: blocking.id,
			paradigmId,
		}).state;
	}

	const fixture = JSON.parse(serializeGameState(state)) as V10Fixture;
	const reports = asRecord(fixture.reports);
	const reportItems = reports.items;
	if (!Array.isArray(reportItems)) throw new Error("Expected report items");
	const removedReportIds = new Set<string>();
	const keptReports = reportItems.filter((item) => {
		const report = asRecord(item);
		const fact = asRecord(report.fact);
		const isWaveFiveStrategyFact =
			fact.kind === "rival_published" || fact.kind === "rival_launched";
		if (isWaveFiveStrategyFact && typeof report.id === "string") {
			removedReportIds.add(report.id);
		}
		return !isWaveFiveStrategyFact;
	});
	const reportIdMap = new Map<string, string>();
	reports.items = keptReports.map((item, index) => {
		const report = asRecord(item);
		const oldId = report.id;
		const newId = `report_${String(index + 1).padStart(3, "0")}`;
		if (typeof oldId === "string") reportIdMap.set(oldId, newId);
		report.id = newId;
		return report;
	});
	reports.totalCount = keptReports.length;
	const counters = asRecord(fixture.counters);
	counters.report = keptReports.length + 1;
	const queue = asRecord(fixture.queue);
	if (!Array.isArray(queue.reportIds)) throw new Error("Expected report queue");
	queue.reportIds = queue.reportIds
		.filter(
			(reportId) =>
				typeof reportId !== "string" || !removedReportIds.has(reportId),
		)
		.map((reportId) =>
			typeof reportId === "string"
				? (reportIdMap.get(reportId) ?? reportId)
				: reportId,
		);
	for (const rival of fixture.rivals.items) {
		delete rival.publishedNodeIds;
		delete rival.launchedFamilyIds;
		delete rival.eventCursor;
	}
	fixture.meta.schemaVersion = 10;
	return fixture;
}

describe("rival migration replay correction", () => {
	it("does not let ordinary rival validation opt into legacy v10 fields", () => {
		const fixture = v10ReplayFixture();
		const forgedValidator = assertRivalsState as unknown as (
			value: unknown,
			options?: unknown,
		) => void;

		expect(() =>
			forgedValidator(fixture.rivals, {
				allowMissingStrategyFields: true,
			}),
		).toThrow(/strategy field/i);
	});

	it("replays a real v10 save to the exact migrated v11 canonical state", () => {
		const fixture = v10ReplayFixture();
		expect(fixture.rivals.items.map((rival) => rival.progress)).toEqual([
			35, 45, 0,
		]);
		const before = JSON.stringify(fixture);

		const migrated = upgradeGameStateWithMetadata(fixture).state;
		const replayed = replayCommandLog({
			schemaVersion: 10,
			commands: fixture.commandLog,
		});
		const replayedRaw = replayCommandLog(migrated.commandLog, {
			expectedState: migrated,
		});

		expect(JSON.stringify(fixture)).toBe(before);
		expect(() => assertGameState(migrated)).not.toThrow();
		expect(serializeGameState(migrated)).toBe(serializeGameState(replayed));
		expect(serializeGameState(migrated)).toBe(serializeGameState(replayedRaw));
	});

	it("keeps the migrated replay boundary after current v11 commands", () => {
		const migrated = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
		const advanced = advanceWeek(migrated).state;
		const replayed = replayCommandLog(advanced.commandLog, {
			expectedState: advanced,
		});

		expect(advanced.rivals.items.map((rival) => rival.eventCursor)).toEqual([
			1, 1, 0,
		]);
		expect(
			advanced.reports.items.filter(
				(report) =>
					report.fact.kind === "rival_published" ||
					report.fact.kind === "rival_launched",
			),
		).toHaveLength(2);
		expect(serializeGameState(replayed)).toBe(serializeGameState(advanced));
	});

	it("rejects malformed, partial, and future-shaped v10 rival fields", () => {
		const cases = [
			{
				name: "malformed progress",
				mutate: (fixture: V10Fixture) => {
					fixtureRival(fixture).progress = "35";
				},
				message: /progress/i,
			},
			{
				name: "partial strategy fields",
				mutate: (fixture: V10Fixture) => {
					fixtureRival(fixture).eventCursor = 0;
				},
				message: /unexpected.*strategy/i,
			},
			{
				name: "future rival field",
				mutate: (fixture: V10Fixture) => {
					fixtureRival(fixture).futureStrategy = true;
				},
				message: /unexpected field/i,
			},
		] as const;

		for (const testCase of cases) {
			const fixture = v10ReplayFixture();
			testCase.mutate(fixture);
			const before = JSON.stringify(fixture);
			expect(() => upgradeGameStateWithMetadata(fixture)).toThrow(
				testCase.message,
			);
			expect(JSON.stringify(fixture)).toBe(before);
		}
	});

	it("chains v9 through v10 into the same marked v11 rival state", () => {
		const v10 = v10ReplayFixture();
		const v9 = v10ReplayFixture();
		v9.meta.schemaVersion = 9;
		const before = JSON.stringify(v9);

		const direct = upgradeGameStateWithMetadata(v10);
		const chained = upgradeGameStateWithMetadata(v9);

		expect(direct.sourceSchemaVersion).toBe(10);
		expect(chained.sourceSchemaVersion).toBe(9);
		expect(serializeGameState(chained.state)).toBe(
			serializeGameState(direct.state),
		);
		const replayedV9 = replayCommandLog({
			schemaVersion: 9,
			commands: v9.commandLog,
		});
		expect(serializeGameState(replayedV9)).toBe(
			serializeGameState(chained.state),
		);
		expect(JSON.stringify(v9)).toBe(before);
	});

	it("keeps migration idempotent and isolates invalid replay markers", () => {
		const fixture = v10ReplayFixture();
		const migrated = upgradeGameStateWithMetadata(fixture).state;
		const repeated = upgradeGameStateWithMetadata(migrated).state;
		expect(repeated).toEqual(migrated);

		const markerKey = Object.keys(asRecord(migrated.commandLog[0])).find(
			(key) => key.includes("legacyV10RivalStrategy"),
		);
		if (markerKey === undefined) throw new Error("Expected replay marker");
		asRecord(migrated.commandLog[0])[markerKey] = "command_999";
		expect(() => assertGameState(migrated)).toThrow(/unknown command/i);

		const current = advanceWeek(
			startRun({ companyName: "Current v11 Labs" }, 42),
		).state;
		expect(
			serializeGameState(
				replayCommandLog(current.commandLog, { expectedState: current }),
			),
		).toBe(serializeGameState(current));
	});

	it("keeps current v11 rival validation strict after migration support", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected rival");
		delete (rival as unknown as Record<string, unknown>).eventCursor;

		expect(() => assertRivalsState(state.rivals)).toThrow(/strategy field/i);
		expect(() => assertGameState(state)).toThrow(/strategy field/i);
	});

	it("keeps repeated direct v11 rival system calls deterministic", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected rival");
		rival.progress = 24;

		const first = rivalsSystem(state, { phase: "rivals", week: 1 });
		const second = rivalsSystem(state, { phase: "rivals", week: 1 });

		expect(second).toEqual(first);
		expect(first.state.rivals.items[0]?.eventCursor).toBe(1);
		expect(
			first.facts.filter((fact) => fact.kind === "rival_published"),
		).toHaveLength(1);
	});
});
