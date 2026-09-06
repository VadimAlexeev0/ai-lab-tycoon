import { describe, expect, it } from "vitest";
import type { Model } from "./components/models.js";
import { assertRivalsState } from "./components/rivals.js";
import {
	advanceWeek,
	applyDecision,
	GAME_STATE_SCHEMA_VERSION,
	launchProduct,
	startRun,
} from "./index.js";
import { assertGameState } from "./invariants.js";
import {
	serializeGameState,
	upgradeGameStateWithMetadata,
} from "./migrations.js";
import { replayCommandLog } from "./replay.js";
import type { CommandLogEntry, GameState } from "./state.js";
import { rivalsSystem } from "./systems/rivals.js";

const LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH =
	"legacyV10RivalStrategyReplayThroughCommandId";
const LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF =
	"legacyV10RivalStrategyReplayProof";

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

function v10ReplayFixture(advanceCount = 5): V10Fixture {
	let state = startRun({ companyName: "Legacy Replay Labs" }, 42);
	for (let index = 0; index < advanceCount; index += 1) {
		state = advanceWeek(state).state;
		state = resolveBlockingDecisions(state);
	}
	return v10FixtureFromState(state);
}

function resolveBlockingDecisions(state: GameState): GameState {
	let current = state;
	for (let guard = 0; guard < 32; guard += 1) {
		const decision = current.decisions.pending.find(
			(candidate) => candidate.blocking,
		);
		if (decision === undefined) return current;
		if (decision.kind === "paradigm") {
			const paradigmId = decision.choices[0];
			if (paradigmId === undefined)
				throw new Error("Expected a paradigm choice");
			current = applyDecision(current, {
				kind: "paradigm",
				decisionId: decision.id,
				paradigmId,
			}).state;
			continue;
		}
		if (decision.kind === "publication") {
			current = applyDecision(current, {
				kind: "publication",
				decisionId: decision.id,
				nodeId: decision.nodeId,
				outcome: "hoard",
			}).state;
			continue;
		}
		if (decision.kind === "incident") {
			current = applyDecision(current, {
				kind: "incident",
				decisionId: decision.id,
				response: "repair",
			}).state;
			continue;
		}
		if (decision.kind === "crisis") {
			current = applyDecision(current, {
				kind: "crisis",
				decisionId: decision.id,
				crisisId: decision.crisisId,
				choice: "contain",
			}).state;
			continue;
		}
		throw new Error(`Unexpected blocking decision: ${decision.kind}`);
	}
	throw new Error("Blocking decision resolver exceeded its guard");
}

function v10FixtureFromState(state: GameState): V10Fixture {
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

function setLegacyReplayMarker(state: GameState, value: unknown): void {
	const first = state.commandLog[0];
	if (first === undefined || first.kind !== "start_run") {
		throw new Error("Expected the start command");
	}
	(first as unknown as Record<string, unknown>)[
		LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH
	] = value;
}

function currentV11AfterFiveAdvances(): GameState {
	let state = startRun({ companyName: "Current v11 Labs" }, 42);
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
	return state;
}

function assistantV10ReplayFixture(): V10Fixture {
	let state = assistantState();
	for (let index = 0; index < 7; index += 1) {
		state = advanceWeek(state).state;
		state = resolveBlockingDecisions(state);
	}
	return v10FixtureFromState(state);
}

function assistantState(): GameState {
	const state = startRun({ companyName: "Assistant Era Labs" }, 42);
	for (const node of state.research.nodes) {
		if (node.era === "text") node.status = "completed";
	}
	state.models.items = [
		{
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
		} satisfies Model,
	];
	state.company.hype = 10;
	const launched = launchProduct(state, "model_001", "chat").state;
	launched.meta.era = "assistant";
	launched.research.currentEra = "assistant";
	return launched;
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
		const migratedStart = migrated.commandLog[0];
		if (migratedStart === undefined)
			throw new Error("Expected migrated start command");
		expect(migratedStart).toHaveProperty(
			LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF,
		);
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

	it("rejects a marker-only migrated raw save", () => {
		const migrated = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
		const start = migrated.commandLog[0];
		if (start === undefined) throw new Error("Expected the start command");
		delete (start as unknown as Record<string, unknown>)[
			LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF
		];

		expect(() => assertGameState(migrated)).toThrow(/proof|boundary/i);
		expect(() => replayCommandLog(migrated.commandLog)).toThrow(
			/proof|boundary/i,
		);
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
		expect(advanced.commandLog[0]).toHaveProperty(
			LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF,
		);
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

	it("rejects migration provenance injected into a fresh current v11 state", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		setLegacyReplayMarker(state, "command_001");

		expect(() => assertGameState(state)).toThrow(
			/migration|provenance|boundary/i,
		);
	});

	it("rejects serialization of migration provenance injected into a fresh state", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		setLegacyReplayMarker(state, "command_001");

		expect(() => serializeGameState(state)).toThrow(
			/migration|provenance|boundary/i,
		);
	});

	it("rejects replay against a fresh current state carrying a forged boundary", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		setLegacyReplayMarker(state, "command_001");

		expect(() =>
			replayCommandLog(state.commandLog, { expectedState: state }),
		).toThrow(/migration|provenance|boundary|mismatch|proof|authenticated/i);
	});

	it("rejects an existing threshold command forged onto current strategy history", () => {
		const state = currentV11AfterFiveAdvances();
		if (!state.commandLog.some((command) => command.id === "command_006")) {
			throw new Error("Expected command_006 in the current v11 log");
		}
		if (state.rivals.items.every((rival) => rival.eventCursor === 0)) {
			throw new Error("Expected crossed current rival strategy history");
		}
		setLegacyReplayMarker(state, "command_006");

		expect(() => assertGameState(state)).toThrow(
			/migration|provenance|boundary/i,
		);
	});

	it("rejects replay against current strategy history with a forged threshold boundary", () => {
		const state = currentV11AfterFiveAdvances();
		setLegacyReplayMarker(state, "command_006");

		expect(() =>
			replayCommandLog(state.commandLog, { expectedState: state }),
		).toThrow(/migration|provenance|boundary|mismatch|proof|authenticated/i);
		expect(() => replayCommandLog(state.commandLog)).toThrow(
			/migration|provenance|boundary|mismatch|proof|authenticated/i,
		);
	});

	it.each([
		{ name: "the start command", boundary: "command_001" },
		{ name: "a non-advance command", boundary: "command_003" },
		{ name: "a middle advance command", boundary: "command_004" },
	])("rejects a marker at $name", ({ boundary }) => {
		const state = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
		setLegacyReplayMarker(state, boundary);

		expect(() => assertGameState(state)).toThrow(
			/migration|provenance|boundary/i,
		);
		expect(() =>
			replayCommandLog(state.commandLog, { expectedState: state }),
		).toThrow(/migration|provenance|boundary|mismatch|proof|authenticated/i);
	});

	it("rejects a marker after the current command suffix", () => {
		const migrated = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
		const state = advanceWeek(migrated).state;
		const currentCommand = state.commandLog.at(-1);
		if (currentCommand === undefined)
			throw new Error("Expected current command");
		setLegacyReplayMarker(state, currentCommand.id);

		expect(() => assertGameState(state)).toThrow(
			/migration|provenance|boundary/i,
		);
		expect(() =>
			replayCommandLog(state.commandLog, { expectedState: state }),
		).toThrow(/migration|provenance|boundary|mismatch|proof|authenticated/i);
	});

	it("rejects marker-only provenance on a current v11 state", () => {
		const state = advanceWeek(
			startRun({ companyName: "Current v11 Labs" }, 42),
		).state;
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected rival");
		// A current v11 save can otherwise look like a legacy boundary if its
		// progress is edited without adding strategy history or reports.
		rival.progress = 25;
		setLegacyReplayMarker(state, "command_002");

		expect(() => assertGameState(state)).toThrow(
			/proof|authenticated|boundary/i,
		);
		expect(() => serializeGameState(state)).toThrow(
			/proof|authenticated|boundary/i,
		);
	});

	it("binds rival strategy facts to their exact advance command", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		const rival = state.rivals.items[0];
		if (rival === undefined) throw new Error("Expected rival");
		rival.progress = 24;

		const advanced = advanceWeek(state).state;
		const command = advanced.commandLog.at(-1);
		if (command === undefined || command.kind !== "advance_week") {
			throw new Error("Expected an advance_week command");
		}
		const strategyReport = advanced.reports.items.find(
			(report) => report.fact.kind === "rival_published",
		);
		if (strategyReport?.fact.kind !== "rival_published") {
			throw new Error("Expected a rival publication report");
		}

		expect(
			(strategyReport.fact as unknown as Record<string, unknown>).commandId,
		).toBe(command.id);
		expect(strategyReport.fact.week).toBe(command.week);

		const forged = JSON.parse(JSON.stringify(advanced)) as GameState;
		const forgedReport = forged.reports.items.find(
			(report) => report.fact.kind === "rival_published",
		);
		if (forgedReport?.fact.kind !== "rival_published") {
			throw new Error("Expected a rival publication report in the clone");
		}
		(forgedReport.fact as unknown as Record<string, unknown>).commandId =
			"command_001";

		expect(() => assertGameState(forged)).toThrow(/advance|command|position/i);
	});

	it("rejects strategy facts whose command position is before a migration boundary", () => {
		const migrated = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
		const advanced = advanceWeek(migrated).state;
		const start = advanced.commandLog[0];
		if (start === undefined) throw new Error("Expected migrated start command");
		const proof = asRecord(
			(start as unknown as Record<string, unknown>)[
				LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF
			],
		);
		if (typeof proof.boundaryCommandId !== "string") {
			throw new Error("Expected a migrated boundary command id");
		}
		const forged = JSON.parse(JSON.stringify(advanced)) as GameState;
		const strategyReport = forged.reports.items.find(
			(report) =>
				report.fact.kind === "rival_published" ||
				report.fact.kind === "rival_launched",
		);
		if (
			strategyReport?.fact.kind !== "rival_published" &&
			strategyReport?.fact.kind !== "rival_launched"
		) {
			throw new Error("Expected a post-migration rival strategy report");
		}
		(strategyReport.fact as unknown as Record<string, unknown>).commandId =
			proof.boundaryCommandId;

		expect(() => assertGameState(forged)).toThrow(
			/before|boundary|command|position/i,
		);
	});

	it.each([
		{ name: "null", value: null },
		{ name: "a number", value: 42 },
		{ name: "an object", value: {} },
		{ name: "a future command id", value: "command_999" },
	])("rejects a malformed or future marker ($name)", ({ value }) => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		setLegacyReplayMarker(state, value);

		expect(() => assertGameState(state)).toThrow(
			/identifier|migration|provenance|boundary|unknown/i,
		);
	});

	it.each([
		{
			field: "progress",
			mutate: (rival: Record<string, unknown>) => {
				rival.progress = 36;
			},
		},
		{
			field: "active",
			mutate: (rival: Record<string, unknown>) => {
				rival.active = false;
			},
		},
	])(
		"rejects a migrated proof with tampered rival $field after current commands",
		({ mutate }) => {
			const migrated = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
			const state = advanceWeek(migrated).state;
			const start = state.commandLog[0];
			if (start === undefined)
				throw new Error("Expected migrated start command");
			const proof = asRecord(
				(start as unknown as Record<string, unknown>)[
					LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF
				],
			);
			const rivals = proof.rivals;
			if (!Array.isArray(rivals)) throw new Error("Expected proof rivals");
			const firstRival = asRecord(rivals[0]);
			mutate(firstRival);

			expect(() => assertGameState(state)).toThrow(/proof|prefix|boundary/i);
			expect(() =>
				replayCommandLog(state.commandLog, { expectedState: state }),
			).toThrow(/proof|prefix|boundary|mismatch/i);
			expect(() => replayCommandLog(state.commandLog)).toThrow(
				/proof|prefix|boundary|mismatch/i,
			);
		},
	);

	it("preserves exact capped and dormant rival provenance through migration", () => {
		const fixture = v10ReplayFixture(14);
		const migrated = upgradeGameStateWithMetadata(fixture).state;
		const start = migrated.commandLog[0];
		if (start === undefined) throw new Error("Expected migrated start command");
		const proof = asRecord(
			(start as unknown as Record<string, unknown>)[
				LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF
			],
		);
		const proofRivals = proof.rivals;
		if (!Array.isArray(proofRivals)) throw new Error("Expected proof rivals");

		expect(migrated.rivals.items.map((rival) => rival.progress)).toEqual([
			98, 100, 0,
		]);
		expect(migrated.rivals.items.map((rival) => rival.active)).toEqual([
			true,
			true,
			false,
		]);
		expect(proofRivals.map((rival) => asRecord(rival).progress)).toEqual([
			98, 100, 0,
		]);
		expect(proofRivals.map((rival) => asRecord(rival).active)).toEqual([
			true,
			true,
			false,
		]);
		expect(() => assertGameState(migrated)).not.toThrow();
		expect(serializeGameState(migrated)).toBe(
			serializeGameState(
				replayCommandLog({ schemaVersion: 10, commands: fixture.commandLog }),
			),
		);
	});

	it("rejects a migrated proof with tampered source era", () => {
		const state = upgradeGameStateWithMetadata(v10ReplayFixture()).state;
		const start = state.commandLog[0];
		if (start === undefined) throw new Error("Expected migrated start command");
		const proof = asRecord(
			(start as unknown as Record<string, unknown>)[
				LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF
			],
		);
		proof.era = "assistant";

		expect(() => assertGameState(state)).toThrow(/proof|era|boundary/i);
		expect(() => replayCommandLog(state.commandLog)).toThrow(
			/proof|era|boundary|mismatch/i,
		);
	});

	it("preserves assistant-era active rival provenance through current advances", () => {
		const fixture = assistantV10ReplayFixture();
		const migrated = upgradeGameStateWithMetadata(fixture).state;
		const start = migrated.commandLog[0];
		if (start === undefined) throw new Error("Expected migrated start command");
		const proof = asRecord(
			(start as unknown as Record<string, unknown>)[
				LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF
			],
		);

		expect(migrated.meta.era).toBe("assistant");
		expect(proof.era).toBe("assistant");
		expect(migrated.rivals.items.map((rival) => rival.active)).toEqual([
			true,
			true,
			true,
		]);
		expect(() => assertGameState(migrated)).not.toThrow();

		const advanced = advanceWeek(migrated).state;
		expect(advanced.rivals.items.map((rival) => rival.active)).toEqual([
			true,
			true,
			true,
		]);
		expect(() => assertGameState(advanced)).not.toThrow();
	});

	it("keeps a current v11 state and envelope marker-free", () => {
		const state = currentV11AfterFiveAdvances();
		const start = state.commandLog[0];
		if (start === undefined) throw new Error("Expected current start command");
		expect(start).not.toHaveProperty(LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH);
		expect(start).not.toHaveProperty(LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF);

		const replayed = replayCommandLog(
			{
				schemaVersion: GAME_STATE_SCHEMA_VERSION,
				commands: state.commandLog,
			},
			{ expectedState: state },
		);
		const replayedStart = replayed.commandLog[0];
		if (replayedStart === undefined) {
			throw new Error("Expected replayed current start command");
		}
		expect(replayedStart).not.toHaveProperty(
			LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH,
		);
		expect(replayedStart).not.toHaveProperty(
			LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF,
		);
		expect(serializeGameState(replayed)).toBe(serializeGameState(state));
	});

	it("rejects a marker misplaced on a non-start command", () => {
		const state = startRun({ companyName: "Current v11 Labs" }, 42);
		state.commandLog.push({
			id: "command_002",
			kind: "advance_week",
			week: 1,
			[LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH]: "command_001",
		} as unknown as CommandLogEntry);

		expect(() => assertGameState(state)).toThrow(/unexpected|marker|field/i);
		expect(() => replayCommandLog(state.commandLog)).toThrow(/mismatch|field/i);
	});
});
