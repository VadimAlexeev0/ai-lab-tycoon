import { describe, expect, it } from "vitest";

import { assignProject } from "./commands/projects.js";
import {
	assertDecisionChoice,
	assertDecisionsState,
} from "./components/decisions.js";
import { assertFact } from "./components/reports.js";
import { PUBLICATION_BALANCE } from "./data/balance.js";
import {
	assertResearchDefinitions,
	RESEARCH_NODES,
	type ResearchDefinition,
	RNN_LSTM_ID,
	WORD_VECTORS_ID,
} from "./data/research.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";
import { deserializeGameState, serializeGameState } from "./migrations.js";
import { replayCommandLog } from "./replay.js";
import { researchSystem } from "./systems/research.js";

describe("research publication decisions", () => {
	it("completing the early recurrent-memory node creates one blocking publication decision", () => {
		let state = startRun({ companyName: "Publication Labs" }, 1);
		const paradigmOffer = advanceWeek(state);
		const paradigm = paradigmOffer.state.decisions.pending.find(
			(decision) => decision.kind === "paradigm",
		);
		if (paradigm === undefined) {
			throw new Error("Expected a blocking paradigm decision");
		}
		const paradigmChoice = paradigm.choices[0];
		if (paradigmChoice === undefined) {
			throw new Error("Expected a paradigm choice");
		}
		state = applyDecision(paradigmOffer.state, {
			kind: "paradigm",
			decisionId: paradigm.id,
			paradigmId: paradigmChoice,
		}).state;

		state = advanceWeek(state).state;
		const project = state.projects.items.find(
			(candidate) =>
				candidate.kind === "research" && candidate.nodeId === RNN_LSTM_ID,
		);
		const team = state.teams.items[0];
		if (project === undefined || team === undefined) {
			throw new Error(
				"Expected the opening recurrent-memory project and founding team",
			);
		}
		state = assignProject(state, team.id, project.id).state;
		state = advanceWeek(state).state;

		const publicationDecisions = state.decisions.pending.filter(
			(decision) =>
				decision.kind === "publication" && decision.nodeId === RNN_LSTM_ID,
		);

		expect(publicationDecisions).toHaveLength(1);
		expect(publicationDecisions[0]).toMatchObject({
			kind: "publication",
			nodeId: RNN_LSTM_ID,
			blocking: true,
		});
	});

	it("marks only the canonical recurrent-memory node publishable and validates the optional key", () => {
		const definitions = (publishable: unknown, extra = false) =>
			RESEARCH_NODES.map((definition) =>
				definition.id === RNN_LSTM_ID
					? {
							...definition,
							publishable,
							...(extra ? { unexpected: true } : {}),
						}
					: definition,
			) as unknown as ResearchDefinition[];

		expect(
			RESEARCH_NODES.filter(
				(definition) =>
					"publishable" in definition && definition.publishable === true,
			).map((definition) => definition.id),
		).toEqual([RNN_LSTM_ID]);
		expect(() => assertResearchDefinitions(RESEARCH_NODES)).not.toThrow();
		expect(() => assertResearchDefinitions(definitions(false))).not.toThrow();
		expect(() => assertResearchDefinitions(definitions("yes"))).toThrow(
			/publishable.*boolean/i,
		);
		expect(() => assertResearchDefinitions(definitions(true, true))).toThrow(
			/unexpected field/i,
		);
	});

	it("rejects malformed publication decisions and accepts the exact contract", () => {
		const decision = {
			kind: "publication" as const,
			id: "decision_001",
			nodeId: RNN_LSTM_ID,
			blocking: true as const,
		};
		const choice = {
			kind: "publication" as const,
			decisionId: decision.id,
			nodeId: RNN_LSTM_ID,
			outcome: "publish" as const,
		};

		expect(() => assertDecisionsState({ pending: [decision] })).not.toThrow();
		expect(() => assertDecisionChoice(choice)).not.toThrow();
		expect(() =>
			assertDecisionsState({
				pending: [{ ...decision, blocking: false }],
			}),
		).toThrow(/blocking/i);
		expect(() =>
			assertDecisionsState({ pending: [{ ...decision, extra: true }] }),
		).toThrow(/unexpected field/i);
		expect(() =>
			assertDecisionChoice({ ...choice, outcome: "release" }),
		).toThrow(/outcome|unsupported/i);
		expect(() =>
			assertDecisionChoice({ ...choice, nodeId: "unknown_research_node" }),
		).toThrow(/unknown|publishable|node/i);
		expect(() => assertDecisionChoice({ ...choice, unexpected: true })).toThrow(
			/unexpected field/i,
		);
	});

	it("rejects publication facts for unknown research nodes", () => {
		expect(() =>
			assertFact({
				kind: "research_publication_resolved",
				nodeId: "unknown_research_node",
				outcome: "publish",
				week: 1,
			}),
		).toThrow(/unknown research node/i);
	});

	it("rejects publication facts for non-publishable research nodes", () => {
		expect(() =>
			assertFact({
				kind: "research_publication_resolved",
				nodeId: WORD_VECTORS_ID,
				outcome: "publish",
				week: 1,
			}),
		).toThrow(/publishable/i);
	});

	it("rejects duplicate publication offers for the same node", () => {
		const decision = {
			kind: "publication" as const,
			id: "decision_001",
			nodeId: RNN_LSTM_ID,
			blocking: true as const,
		};

		expect(() =>
			assertDecisionsState({
				pending: [decision, { ...decision, id: "decision_002" }],
			}),
		).toThrow(/duplicate publication node/i);
	});

	it("does not enqueue a second offer for a completed node", () => {
		const { state } = completedPublicationState(7);
		const rerun = researchSystem(state, {
			phase: "research",
			week: state.meta.week,
		});
		const publicationDecisions = rerun.pending.filter(
			(decision) =>
				decision.kind === "publication" && decision.nodeId === RNN_LSTM_ID,
		);

		expect(publicationDecisions).toHaveLength(1);
		expect(
			rerun.facts.filter(
				(fact) => fact.kind === "research_publication_resolved",
			),
		).toEqual([]);
	});

	it("publishes with explicit gains, caps trust and active rival progress, and reports once", () => {
		const { state, decision } = completedPublicationState(11);
		const prepared = {
			...state,
			company: { ...state.company, trust: 99, hype: 20 },
			rivals: {
				items: [
					{
						id: "rival_001",
						name: "Active Rival",
						archetype: "research_lab" as const,
						focus: "capability" as const,
						progress: 99,
						active: true,
					},
					{
						id: "rival_002",
						name: "Dormant Rival",
						archetype: "platform" as const,
						focus: "distribution" as const,
						progress: 40,
						active: false,
					},
				],
			},
		};
		const before = serializeGameState(prepared);
		const choice = {
			kind: "publication" as const,
			decisionId: decision.id,
			nodeId: RNN_LSTM_ID,
			outcome: "publish" as const,
		};
		const result = applyDecision(prepared, choice);
		const publicationFact = result.facts[0];

		expect(serializeGameState(prepared)).toBe(before);
		expect(result.state.company.hype).toBe(
			20 + PUBLICATION_BALANCE.publishHypeGain,
		);
		expect(result.state.company.trust).toBe(100);
		expect(result.state.rivals.items).toEqual([
			{ ...prepared.rivals.items[0], progress: 100 },
			prepared.rivals.items[1],
		]);
		expect(result.state.decisions.pending).toEqual([]);
		expect(result.state.queue.decisionIds).toEqual([]);
		expect(result.facts).toEqual([
			{
				kind: "research_publication_resolved",
				nodeId: RNN_LSTM_ID,
				outcome: "publish",
				week: prepared.meta.week,
			},
		]);
		expect(() => assertFact(publicationFact)).not.toThrow();
		const report = result.state.reports.items.find(
			(candidate) => candidate.fact.kind === "research_publication_resolved",
		);
		if (report === undefined) throw new Error("Expected publication report");
		expect(report.priority).toBe("important");
		expect(result.state.queue.reportIds).toContain(report.id);
	});

	it("hoards with a trust floor, leaves hype and rivals unchanged, and rejects replay", () => {
		const { state, decision } = completedPublicationState(13);
		const prepared = {
			...state,
			company: { ...state.company, trust: 3, hype: 77 },
			rivals: {
				items: [
					{
						id: "rival_001",
						name: "Active Rival",
						archetype: "research_lab" as const,
						focus: "capability" as const,
						progress: 32,
						active: true,
					},
				],
			},
		};
		const rivalsBefore = prepared.rivals.items.map((rival) => ({ ...rival }));
		const choice = {
			kind: "publication" as const,
			decisionId: decision.id,
			nodeId: RNN_LSTM_ID,
			outcome: "hoard" as const,
		};
		const result = applyDecision(prepared, choice);

		expect(result.state.company.hype).toBe(77);
		expect(result.state.company.trust).toBe(
			3 - PUBLICATION_BALANCE.hoardTrustPenalty < 0
				? 0
				: 3 - PUBLICATION_BALANCE.hoardTrustPenalty,
		);
		expect(result.state.rivals.items).toEqual(rivalsBefore);
		expect(result.facts).toEqual([
			{
				kind: "research_publication_resolved",
				nodeId: RNN_LSTM_ID,
				outcome: "hoard",
				week: prepared.meta.week,
			},
		]);
		const beforeReplay = serializeGameState(result.state);
		expect(() => applyDecision(result.state, choice)).toThrow(
			/unknown decision/i,
		);
		expect(serializeGameState(result.state)).toBe(beforeReplay);
	});

	it("preserves publication facts through canonical save and command-log replay", () => {
		const { state, decision } = completedPublicationState(17);
		const choice = {
			kind: "publication" as const,
			decisionId: decision.id,
			nodeId: RNN_LSTM_ID,
			outcome: "publish" as const,
		};
		const result = applyDecision(state, choice);
		const serialized = serializeGameState(result.state);
		const restored = deserializeGameState(serialized);
		const restoredFacts = restored.reports.items.filter(
			(report) => report.fact.kind === "research_publication_resolved",
		);

		expect(serializeGameState(restored)).toBe(serialized);
		expect(restoredFacts).toHaveLength(1);
		expect(restoredFacts[0]?.fact).toEqual(result.facts[0]);
		expect(
			replayCommandLog(result.state.commandLog, {
				expectedState: result.state,
			}),
		).toEqual(result.state);
	});
});

function completedPublicationState(seed: number) {
	let state = startRun({ companyName: "Publication Labs" }, seed);
	const paradigmOffer = advanceWeek(state);
	const paradigm = paradigmOffer.state.decisions.pending.find(
		(decision) => decision.kind === "paradigm",
	);
	if (paradigm === undefined) throw new Error("Expected paradigm decision");
	const paradigmChoice = paradigm.choices[0];
	if (paradigmChoice === undefined) throw new Error("Expected paradigm choice");
	state = applyDecision(paradigmOffer.state, {
		kind: "paradigm",
		decisionId: paradigm.id,
		paradigmId: paradigmChoice,
	}).state;
	state = advanceWeek(state).state;
	const project = state.projects.items.find(
		(candidate) =>
			candidate.kind === "research" && candidate.nodeId === RNN_LSTM_ID,
	);
	const team = state.teams.items[0];
	if (project === undefined || team === undefined) {
		throw new Error("Expected recurrent-memory project and founding team");
	}
	state = assignProject(state, team.id, project.id).state;
	state = advanceWeek(state).state;
	const decision = state.decisions.pending.find(
		(candidate) =>
			candidate.kind === "publication" && candidate.nodeId === RNN_LSTM_ID,
	);
	if (decision === undefined) throw new Error("Expected publication decision");
	return { state, decision };
}
