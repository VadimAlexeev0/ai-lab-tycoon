import { describe, expect, it } from "vitest";
import { canonicalEqual } from "./canonical.js";
import type { DecisionChoice } from "./components/decisions.js";
import {
	assertRiskState,
	type RiskMemory as ComponentRiskMemory,
	createRiskState,
} from "./components/risk.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { incidentDefinition } from "./data/incidents.js";
import {
	advanceWeek,
	applyDecision,
	assertGameState,
	assignProject,
	buyCompute,
	deserializeGameState,
	designModel,
	launchProduct,
	runEvaluation,
	selectAvailableProjects,
	serializeGameState,
	startRun,
	upgradeGameState,
} from "./index.js";
import { applyProductResume } from "./products.js";
import { replayCommandLog } from "./replay.js";
import type { GameState } from "./state.js";
import { applyIncidentResponse, incidentsSystem } from "./systems/incidents.js";

type RiskMemory = {
	id: string;
	incident: string;
	condition: string;
	severity: number;
	affectedProductId: string | null;
	affectedModelId: string | null;
	unresolved: boolean;
	recurrenceCount: number;
	unresolvedRecurrenceCount: number;
	lastOccurrenceWeek: number;
};

type RiskCrisis = {
	id: string;
	riskMemoryId: string;
	kind: string;
	status: string;
	openedWeek: number;
	resolvedWeek: number | null;
	choice: string | null;
};

type StateWithRisk = GameState & {
	risk: { memories: RiskMemory[]; crises: RiskCrisis[] };
};

function forcedOutageState(): GameState {
	const state = startRun({ companyName: "Risk Labs" }, 42);
	state.research.paradigmId = "scale_maximalism";
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) throw new Error("Expected model unlock");
	familyUnlock.status = "completed";
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "launched",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 88,
			dataMix: { general: 70, code: 20, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 70,
				coding: 60,
				reliability: 60,
				safety: 60,
				efficiency: 60,
				multimodal: 0,
			},
			estimates: {
				capability: { estimate: 60, lower: 40, upper: 80 },
				coding: { estimate: 60, lower: 40, upper: 80 },
				reliability: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 60, lower: 40, upper: 80 },
				efficiency: { estimate: 60, lower: 40, upper: 80 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
	state.products.items = [
		{
			id: "product_001",
			channel: "chat",
			modelId: "model_001",
			status: "operating",
			users: 10,
			lastRevenue: 0,
			cumulativeRevenue: 0,
			servingDemand: incidentDefinition("outage").threshold + 1,
			effectiveQuality: 60,
		},
	];
	state.compute.capacity = 12;
	state.compute = withRecomputedCompute(state);
	return state;
}

function repeatablePressure(state: GameState, week: number): GameState {
	const next: GameState = {
		...state,
		meta: { ...state.meta, week },
		products: {
			items: state.products.items.map((product) => ({
				...product,
				status: "operating",
				servingDemand: incidentDefinition("outage").threshold + 1,
				lastRevenue: 0,
			})),
		},
	};
	return { ...next, compute: withRecomputedCompute(next) };
}

function firstOccurrence(): {
	state: GameState;
	decisionId: string;
} {
	const state = forcedOutageState();
	const result = incidentsSystem(state, {
		phase: "incidents",
		week: 1,
		incidentRoll: 0,
	});
	const decision = result.pending[0];
	if (decision === undefined) throw new Error("Expected incident decision");
	return { state: result.state, decisionId: decision.id };
}

const MISS_ROLLS: readonly number[] = [99, 99, 99, 99, 99, 99];
const REPLAY_INITIAL_CASH = 10_000;
const REPLAY_MODEL_SPEC = {
	name: "Risk-Replay-1",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function publicRiskChain(): GameState {
	let state = startRun({ companyName: "Risk Replay Labs" }, 42);
	state.company.cash = REPLAY_INITIAL_CASH;
	state = advanceWeek(state, { incidentRolls: MISS_ROLLS }).state;
	const paradigm = state.decisions.pending.find(
		(decision) => decision.kind === "paradigm",
	);
	if (paradigm?.kind !== "paradigm") {
		throw new Error("Expected opening paradigm decision");
	}
	const paradigmId = paradigm.choices[0];
	if (paradigmId === undefined) throw new Error("Expected paradigm choice");
	state = applyDecision(state, {
		kind: "paradigm",
		decisionId: paradigm.id,
		paradigmId,
	}).state;

	const team = state.teams.items[0];
	const researchProject = selectAvailableProjects(state).find(
		(project) =>
			project.kind === "research" &&
			project.nodeId === "text_models_principles",
	);
	if (team === undefined || researchProject === undefined) {
		throw new Error("Expected opening research project");
	}
	state = assignProject(state, team.id, researchProject.id).state;
	state = advanceWeek(state, { incidentRolls: MISS_ROLLS }).state;
	for (let index = 0; index < 8 && state.company.insight < 2; index += 1) {
		state = advanceWeek(state, { incidentRolls: MISS_ROLLS }).state;
	}
	state = designModel(state, REPLAY_MODEL_SPEC).state;
	for (let index = 0; index < 8; index += 1) {
		if (state.models.items.some((model) => model.status === "ready")) break;
		state = advanceWeek(state, { incidentRolls: MISS_ROLLS }).state;
	}
	const model = state.models.items.find(
		(candidate) => candidate.status === "ready",
	);
	if (model === undefined) throw new Error("Expected a ready model");
	state = runEvaluation(state, model.id, "capability").state;
	state = launchProduct(state, model.id, "chat").state;
	state = buyCompute(state).state;

	let occurrences = 0;
	for (let index = 0; index < 12; index += 1) {
		state = advanceWeek(state, { incidentRolls: [0] }).state;
		while (state.decisions.pending.length > 0) {
			const decision = state.decisions.pending[0];
			if (decision === undefined) break;
			if (decision.kind === "incident") {
				occurrences += 1;
				state = applyDecision(state, {
					kind: "incident",
					decisionId: decision.id,
					response: "repair",
				}).state;
				const paused = state.products.items.find(
					(product) => product.status === "paused",
				);
				if (paused !== undefined) {
					state = applyProductResume(state, paused.id).state;
				}
				continue;
			}
			if (decision.kind === "crisis") {
				state = applyDecision(state, {
					kind: "crisis",
					decisionId: decision.id,
					crisisId: decision.crisisId,
					choice: "investigate",
				}).state;
				if (occurrences < 2) throw new Error("Crisis opened too early");
				return state;
			}
			throw new Error(`Unexpected blocking decision: ${decision.kind}`);
		}
	}
	throw new Error("Expected the repeated-risk crisis chain");
}

describe("persistent incident risk memory", () => {
	it("creates a stable unresolved memory without mutating the incident input", () => {
		const state = forcedOutageState();
		const before = JSON.stringify(state);
		const result = incidentsSystem(state, {
			phase: "incidents",
			week: 1,
			incidentRoll: 0,
		});
		const riskState = result.state as StateWithRisk;
		const memory = riskState.risk.memories[0];

		expect(result.state).not.toBe(state);
		expect(memory).toMatchObject({
			id: "risk_outage_product_001",
			incident: "outage",
			condition: "serving_overload",
			severity: 88,
			affectedProductId: "product_001",
			affectedModelId: "model_001",
			unresolved: true,
			recurrenceCount: 1,
			lastOccurrenceWeek: 1,
		});
		expect(JSON.stringify(state)).toBe(before);
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "risk_memory_updated",
				riskMemoryId: "risk_outage_product_001",
				recurrenceCount: 1,
				week: 1,
			}),
		);
	});

	it("clones risk state deeply and enforces its exact serializable shape", () => {
		const source = firstOccurrence().state as StateWithRisk;
		const sourceMemory = source.risk.memories[0];
		if (sourceMemory === undefined) throw new Error("Expected risk memory");
		const cloned = createRiskState([
			sourceMemory as unknown as ComponentRiskMemory,
		]);
		assertRiskState(cloned, { currentWeek: 1 });
		const clonedMemory = cloned.memories[0];
		if (clonedMemory === undefined) throw new Error("Expected cloned memory");
		clonedMemory.severity = 1;
		expect(source.risk.memories[0]?.severity).toBe(88);

		const malformed = structuredClone(cloned) as unknown as Record<
			string,
			unknown
		>;
		const memories = malformed.memories as Record<string, unknown>[];
		const malformedMemory = memories[0];
		if (malformedMemory === undefined)
			throw new Error("Expected cloned memory");
		malformedMemory.futureField = true;
		expect(() => assertRiskState(malformed)).toThrow(/unexpected field/i);
	});

	it("raises recurrence probability and severity when a cheap repair leaves risk unresolved", () => {
		const first = firstOccurrence();
		const repaired = applyIncidentResponse(
			repeatablePressure(first.state, 2),
			"outage",
			"repair",
			first.decisionId,
		);
		const repairedRisk = (repaired.state as StateWithRisk).risk.memories[0];
		expect(repairedRisk).toMatchObject({
			unresolved: true,
			recurrenceCount: 1,
		});

		const recurrence = incidentsSystem(repeatablePressure(repaired.state, 2), {
			phase: "incidents",
			week: 2,
			// Outage's base probability is 2; this roll must only hit after
			// the unresolved-memory recurrence bonus is applied.
			incidentRoll: 2,
		});
		const repeatedRisk = (recurrence.state as StateWithRisk).risk.memories[0];
		expect(recurrence.pending).toHaveLength(1);
		expect(repeatedRisk?.recurrenceCount).toBe(2);
		expect(repeatedRisk?.severity).toBeGreaterThan(repairedRisk?.severity ?? 0);
		expect(recurrence.state.warnings).toContainEqual({
			code: "risk_escalation",
			severity: "critical",
		});
		expect(recurrence.facts).toContainEqual(
			expect.objectContaining({
				kind: "risk_memory_updated",
				recurrenceCount: 2,
				unresolved: true,
			}),
		);
	});

	it("reduces risk on rollback-style response while retaining recurrence history", () => {
		const first = firstOccurrence();
		const before = JSON.stringify(first.state);
		const reduced = applyIncidentResponse(
			repeatablePressure(first.state, 1),
			"outage",
			"reduce_scope",
			first.decisionId,
		);
		const memory = (reduced.state as StateWithRisk).risk.memories[0];

		expect(memory).toMatchObject({
			unresolved: false,
			recurrenceCount: 1,
			lastOccurrenceWeek: 1,
		});
		expect(memory?.severity).toBeLessThan(
			(first.state as StateWithRisk).risk.memories[0]?.severity ?? 0,
		);
		expect(reduced.facts).toContainEqual(
			expect.objectContaining({
				kind: "risk_memory_updated",
				unresolved: false,
			}),
		);
		expect(JSON.stringify(first.state)).toBe(before);
	});

	it("fails closed when an incident response is reintroduced after resolution", () => {
		const occurrence = firstOccurrence();
		const offered: GameState = {
			...occurrence.state,
			decisions: {
				pending: [
					{
						kind: "incident",
						id: occurrence.decisionId,
						incidentId: occurrence.decisionId,
						riskMemoryId: "risk_outage_product_001",
						incident: "outage",
						blocking: true,
					},
				],
			},
			queue: {
				...occurrence.state.queue,
				decisionIds: [occurrence.decisionId],
			},
		};
		const choice = {
			kind: "incident" as const,
			decisionId: occurrence.decisionId,
			response: "repair" as const,
		};
		const resolved = applyDecision(offered, choice);
		expect(() => applyDecision(resolved.state, choice)).toThrow(
			/unknown decision/i,
		);
	});

	it("clears risk severity on disclosure without erasing recurrence history", () => {
		const first = firstOccurrence();
		const disclosed = applyIncidentResponse(
			repeatablePressure(first.state, 1),
			"outage",
			"disclose",
			first.decisionId,
		);
		const memory = (disclosed.state as StateWithRisk).risk.memories[0];
		expect(memory).toMatchObject({
			unresolved: false,
			recurrenceCount: 1,
			lastOccurrenceWeek: 1,
			severity: 0,
		});
	});

	it("opens and resolves one later-week blocking crisis for a repeated unresolved memory", () => {
		const first = firstOccurrence();
		const repaired = applyIncidentResponse(
			repeatablePressure(first.state, 2),
			"outage",
			"repair",
			first.decisionId,
		);
		const repeated = incidentsSystem(repeatablePressure(repaired.state, 2), {
			phase: "incidents",
			week: 2,
			incidentRoll: 0,
		});
		const repeatedDecision = repeated.pending[0];
		if (repeatedDecision === undefined) throw new Error("Expected recurrence");
		const repairedAgain = applyIncidentResponse(
			repeatablePressure(repeated.state, 3),
			"outage",
			"repair",
			repeatedDecision.id,
		);

		const crisis = incidentsSystem(repeatablePressure(repairedAgain.state, 3), {
			phase: "incidents",
			week: 3,
			incidentRoll: 99,
		});
		const crisisDecision = (crisis.pending as readonly { kind: string }[]).find(
			(decision) => decision.kind === "crisis",
		);
		expect(crisisDecision).toBeDefined();
		expect(crisis.facts).toContainEqual(
			expect.objectContaining({ kind: "crisis_opened", week: 3 }),
		);

		if (crisisDecision === undefined) return;
		const offeredState: GameState = {
			...crisis.state,
			decisions: {
				pending: crisis.pending.map((decision) => ({ ...decision })),
			},
			queue: {
				...crisis.state.queue,
				decisionIds: crisis.pending.map((decision) => decision.id),
			},
		};
		const resolved = applyDecision(offeredState, {
			kind: "crisis",
			decisionId: (crisisDecision as unknown as { id: string }).id,
			crisisId: (crisisDecision as unknown as { crisisId: string }).crisisId,
			choice: "investigate",
		} as unknown as DecisionChoice);
		expect((resolved.state as StateWithRisk).risk.crises[0]).toMatchObject({
			status: "resolved",
			choice: "investigate",
			resolvedWeek: 3,
		});
		expect(resolved.facts).toContainEqual(
			expect.objectContaining({
				kind: "crisis_resolved",
				choice: "investigate",
			}),
		);
	});

	it("round-trips the public incident-repair-recurrence-crisis chain without RNG drift", () => {
		const original = publicRiskChain();
		const serialized = serializeGameState(original);
		const loaded = deserializeGameState(serialized);
		const replayed = replayCommandLog(original.commandLog, {
			initialCash: REPLAY_INITIAL_CASH,
		});

		expect(canonicalEqual(loaded, original)).toBe(true);
		expect(serializeGameState(loaded)).toBe(serialized);
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(original));
		expect(replayed.rng).toEqual(original.rng);
		expect(replayed.risk).toEqual(original.risk);
		expect(original.risk.crises).toHaveLength(1);
	});

	it("rejects malformed recurrence, severity, future-week, and entity references", () => {
		const source = firstOccurrence().state as StateWithRisk;
		const malformed = structuredClone(source) as StateWithRisk;
		const memory = malformed.risk.memories[0];
		if (memory === undefined) throw new Error("Expected risk memory");

		memory.recurrenceCount = 0;
		expect(() => assertGameState(malformed)).toThrow(/recurrence/i);

		memory.recurrenceCount = 1;
		memory.severity = -1;
		expect(() => assertGameState(malformed)).toThrow(/severity/i);

		memory.severity = 88;
		memory.lastOccurrenceWeek = malformed.meta.week + 1;
		expect(() => assertGameState(malformed)).toThrow(/future|occurrence/i);

		memory.lastOccurrenceWeek = 1;
		memory.affectedProductId = "product_404";
		expect(() => assertGameState(malformed)).toThrow(/unknown product/i);

		memory.affectedProductId = "product_001";
		memory.affectedModelId = "model_404";
		expect(() => assertGameState(malformed)).toThrow(/unknown model/i);
	});

	it("rejects duplicate memories and duplicate crisis offers", () => {
		const source = firstOccurrence().state as StateWithRisk;
		const duplicateMemory = structuredClone(source) as StateWithRisk;
		const firstMemory = duplicateMemory.risk.memories[0];
		if (firstMemory === undefined) throw new Error("Expected risk memory");
		duplicateMemory.risk.memories.push({ ...firstMemory });
		expect(() => assertGameState(duplicateMemory)).toThrow(
			/duplicate.*risk memory/i,
		);

		const eligible = structuredClone(source) as StateWithRisk;
		const eligibleMemory = eligible.risk.memories[0];
		if (eligibleMemory === undefined) throw new Error("Expected risk memory");
		eligibleMemory.recurrenceCount = 2;
		eligibleMemory.unresolvedRecurrenceCount = 2;
		eligible.meta.week = 2;
		const opened = incidentsSystem(eligible, {
			phase: "incidents",
			week: 2,
			incidentRoll: 99,
		});
		const crisisDecision = opened.pending[0];
		if (crisisDecision === undefined)
			throw new Error("Expected crisis decision");
		const duplicatedOffer: GameState = {
			...opened.state,
			decisions: {
				pending: [
					{ ...crisisDecision },
					{ ...crisisDecision, id: "decision_999" },
				],
			},
			queue: {
				...opened.state.queue,
				decisionIds: [crisisDecision.id, "decision_999"],
			},
		};
		expect(() => assertGameState(duplicatedOffer)).toThrow(/duplicate crisis/i);
	});

	it("requires the v7 risk field, defaults it only through the v6 migration, and rejects future-shaped v6 saves", () => {
		const current = JSON.parse(
			serializeGameState(startRun({ companyName: "Migration Labs" }, 17)),
		) as Record<string, unknown>;
		delete current.risk;
		expect(() => assertGameState(current)).toThrow(/risk/i);
		expect(() => deserializeGameState(JSON.stringify(current))).toThrow(
			/risk/i,
		);

		const v6 = JSON.parse(
			serializeGameState(startRun({ companyName: "Migration Labs" }, 17)),
		) as Record<string, unknown>;
		delete v6.risk;
		const v6Meta = v6.meta as Record<string, unknown>;
		v6Meta.schemaVersion = 6;
		const upgraded = upgradeGameState(v6) as StateWithRisk;
		expect(upgraded.meta.schemaVersion).toBe(7);
		expect(upgraded.risk).toEqual({ memories: [], crises: [] });

		const futureShaped = JSON.parse(JSON.stringify(v6)) as Record<
			string,
			unknown
		>;
		futureShaped.risk = { memories: [], crises: [] };
		expect(() => upgradeGameState(futureShaped)).toThrow(/unexpected.*risk/i);
	});
});
