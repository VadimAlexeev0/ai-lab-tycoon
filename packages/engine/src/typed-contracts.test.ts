import { describe, expect, it } from "vitest";

import {
	assertDecisionChoice,
	assertDecisionsState,
	type DecisionChoice,
	type PendingDecision,
} from "./components/decisions.js";
import { assertFact, type Fact } from "./components/reports.js";
import { assertTerminalState } from "./components/terminal.js";
import {
	applyDecision,
	deserializeGameState,
	serializeGameState,
	startRun,
} from "./index.js";
import { applyProductResume } from "./products.js";
import type { GameState } from "./state.js";

function pausedProductState(): GameState {
	const state = startRun({ companyName: "Contract Labs" }, 42);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) {
		throw new Error("Expected Text model family unlock");
	}
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
			status: "paused",
			users: 17,
			lastRevenue: 0,
			cumulativeRevenue: 123,
			servingDemand: 0,
			effectiveQuality: 60,
		},
	];
	return state;
}

type FactContractCase = {
	name: string;
	value: Fact;
	required: readonly string[];
	wrong: readonly [string, unknown];
};

const FACT_CASES: readonly FactContractCase[] = [
	{
		name: "resource_changed",
		value: {
			kind: "resource_changed",
			resource: "cash",
			amount: -4,
			week: 1,
		},
		required: ["kind", "resource", "amount", "week"],
		wrong: ["resource", "invalid_resource"],
	},
	{
		name: "project_progressed",
		value: {
			kind: "project_progressed",
			projectId: "project_001",
			amount: 1,
			week: 1,
		},
		required: ["kind", "projectId", "amount", "week"],
		wrong: ["amount", 1.5],
	},
	{
		name: "project_completed",
		value: {
			kind: "project_completed",
			projectId: "project_001",
			week: 1,
		},
		required: ["kind", "projectId", "week"],
		wrong: ["projectId", ""],
	},
	{
		name: "research_completed",
		value: {
			kind: "research_completed",
			nodeId: "research_001",
			week: 1,
		},
		required: ["kind", "nodeId", "week"],
		wrong: ["week", 0],
	},
	{
		name: "model_trained",
		value: {
			kind: "model_trained",
			modelId: "model_001",
			week: 1,
		},
		required: ["kind", "modelId", "week"],
		wrong: ["modelId", ""],
	},
	{
		name: "evaluation_completed",
		value: {
			kind: "evaluation_completed",
			modelId: "model_001",
			evaluation: "capability",
			coverage: 35,
			week: 1,
		},
		required: ["kind", "modelId", "evaluation", "coverage", "week"],
		wrong: ["coverage", 101],
	},
	{
		name: "product_launched",
		value: {
			kind: "product_launched",
			productId: "product_001",
			channel: "chat",
			week: 1,
		},
		required: ["kind", "productId", "channel", "week"],
		wrong: ["channel", "invalid_channel"],
	},
	{
		name: "product_resumed",
		value: {
			kind: "product_resumed",
			productId: "product_001",
			channel: "chat",
			week: 1,
		},
		required: ["kind", "productId", "channel", "week"],
		wrong: ["channel", "invalid_channel"],
	},
	{
		name: "revenue",
		value: {
			kind: "revenue",
			productId: "product_001",
			channel: "chat",
			amount: 25,
			effectiveQuality: 60,
			servedShare: 50,
			week: 1,
		},
		required: [
			"kind",
			"productId",
			"channel",
			"amount",
			"effectiveQuality",
			"week",
		],
		wrong: ["servedShare", 50.5],
	},
	{
		name: "serving_throttled",
		value: {
			kind: "serving_throttled",
			productId: "product_001",
			week: 1,
			unmetDemand: 3,
		},
		required: ["kind", "productId", "week", "unmetDemand"],
		wrong: ["unmetDemand", -1],
	},
	{
		name: "training_starved",
		value: {
			kind: "training_starved",
			week: 1,
			capacity: 12,
			servingDemand: 15,
			evaluationDemand: 2,
			trainingDemand: 4,
		},
		required: [
			"kind",
			"week",
			"capacity",
			"servingDemand",
			"evaluationDemand",
			"trainingDemand",
		],
		wrong: ["capacity", 12.5],
	},
	{
		name: "rival_progressed",
		value: {
			kind: "rival_progressed",
			rivalId: "rival_001",
			amount: 2,
			week: 1,
		},
		required: ["kind", "rivalId", "amount", "week"],
		wrong: ["amount", 2.5],
	},
	{
		name: "rival_milestone",
		value: {
			kind: "rival_milestone",
			rivalId: "rival_001",
			milestone: "first_launch",
			week: 1,
		},
		required: ["kind", "rivalId", "milestone", "week"],
		wrong: ["milestone", ""],
	},
	{
		name: "funding_resolved",
		value: {
			kind: "funding_resolved",
			round: "seed",
			outcome: "accepted",
			factors: {
				hype: 50,
				trust: 60,
				modelScore: 55,
				operatingProducts: 1,
				cumulativeRevenue: 250,
			},
			week: 1,
		},
		required: ["kind", "round", "outcome", "week"],
		wrong: ["outcome", "invalid_outcome"],
	},
	{
		name: "incident_occurred",
		value: {
			kind: "incident_occurred",
			incident: "outage",
			condition: "serving_overload",
			affectedEntity: "product_001",
			metric: "servingDemand",
			measurement: 13,
			threshold: 12,
			severity: -5,
			week: 1,
		},
		required: [
			"kind",
			"incident",
			"condition",
			"affectedEntity",
			"metric",
			"measurement",
			"threshold",
			"severity",
			"week",
		],
		wrong: ["severity", "high"],
	},
	{
		name: "incident_resolved",
		value: {
			kind: "incident_resolved",
			incidentId: "decision_001",
			incident: "outage",
			response: "repair",
			week: 1,
		},
		required: ["kind", "incidentId", "incident", "response", "week"],
		wrong: ["response", "invalid_response"],
	},
	{
		name: "milestone_reached",
		value: {
			kind: "milestone_reached",
			milestone: "first_multimodal_launch",
			week: 1,
		},
		required: ["kind", "milestone", "week"],
		wrong: ["milestone", "other_milestone"],
	},
	{
		name: "terminal",
		value: {
			kind: "terminal",
			reason: "cash_depleted",
			contributors: [
				{ kind: "resource_changed", impact: -3, week: 1, index: 0 },
				{ kind: "rival_progressed", impact: -2, week: 1, index: 1 },
				{ kind: "project_completed", impact: -1, week: 1, index: 2 },
			],
			week: 1,
		},
		required: ["kind", "reason", "contributors", "week"],
		wrong: ["reason", "invalid_reason"],
	},
];

type PendingDecisionContractCase = {
	name: string;
	value: PendingDecision;
	required: readonly string[];
	wrong: readonly [string, unknown];
};

const PENDING_DECISION_CASES: readonly PendingDecisionContractCase[] = [
	{
		name: "launch",
		value: {
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			channel: "chat",
			blocking: true,
		},
		required: ["kind", "id", "modelId", "blocking"],
		wrong: ["modelId", ""],
	},
	{
		name: "evaluation",
		value: {
			kind: "evaluation",
			id: "decision_001",
			modelId: "model_001",
			evaluation: "capability",
			blocking: true,
		},
		required: ["kind", "id", "modelId", "evaluation", "blocking"],
		wrong: ["evaluation", "unknown_evaluation"],
	},
	{
		name: "funding",
		value: {
			kind: "funding",
			id: "decision_001",
			round: "seed",
			blocking: false,
		},
		required: ["kind", "id", "round", "blocking"],
		wrong: ["round", "series_b"],
	},
	{
		name: "incident",
		value: {
			kind: "incident",
			id: "decision_001",
			incidentId: "incident_001",
			incident: "outage",
			blocking: true,
		},
		required: ["kind", "id", "incident", "blocking"],
		wrong: ["incident", "unknown_incident"],
	},
	{
		name: "paradigm",
		value: {
			kind: "paradigm",
			id: "decision_001",
			era: "text",
			choices: [
				"scale_maximalism",
				"data_curation_doctrine",
				"architecture_tinkering",
			],
			blocking: true,
		},
		required: ["kind", "id", "era", "choices", "blocking"],
		wrong: ["era", "assistant"],
	},
];

type DecisionChoiceContractCase = {
	name: string;
	value: DecisionChoice;
	required: readonly string[];
	wrong: readonly [string, unknown];
};

const CHOICE_CASES: readonly DecisionChoiceContractCase[] = [
	{
		name: "launch",
		value: {
			kind: "launch",
			decisionId: "decision_001",
			channel: "chat",
		},
		required: ["kind", "decisionId", "channel"],
		wrong: ["channel", "invalid_channel"],
	},
	{
		name: "evaluate",
		value: {
			kind: "evaluate",
			decisionId: "decision_001",
			evaluation: "capability",
		},
		required: ["kind", "decisionId", "evaluation"],
		wrong: ["evaluation", "unknown_evaluation"],
	},
	{
		name: "funding",
		value: {
			kind: "funding",
			decisionId: "decision_001",
			round: "seed",
			accept: false,
		},
		required: ["kind", "decisionId", "round", "accept"],
		wrong: ["accept", "false"],
	},
	{
		name: "incident",
		value: {
			kind: "incident",
			decisionId: "decision_001",
			response: "repair",
		},
		required: ["kind", "decisionId", "response"],
		wrong: ["response", "invalid_response"],
	},
	{
		name: "shelve",
		value: {
			kind: "shelve",
			decisionId: "decision_001",
		},
		required: ["kind", "decisionId"],
		wrong: ["decisionId", ""],
	},
	{
		name: "paradigm",
		value: {
			kind: "paradigm",
			decisionId: "decision_001",
			paradigmId: "scale_maximalism",
		},
		required: ["kind", "decisionId", "paradigmId"],
		wrong: ["paradigmId", "unknown_paradigm"],
	},
];

type DecisionRoundTripCase = {
	name: string;
	decision: PendingDecision;
	choice: DecisionChoice;
};

function requireAt<T>(values: readonly T[], index: number): T {
	const value = values[index];
	if (value === undefined) {
		throw new Error(`Missing contract fixture at index ${index}`);
	}
	return value;
}

const DECISION_ROUND_TRIP_CASES: readonly DecisionRoundTripCase[] = [
	{
		name: "launch",
		decision: requireAt(PENDING_DECISION_CASES, 0).value,
		choice: requireAt(CHOICE_CASES, 0).value,
	},
	{
		name: "evaluation",
		decision: requireAt(PENDING_DECISION_CASES, 1).value,
		choice: requireAt(CHOICE_CASES, 1).value,
	},
	{
		name: "funding",
		decision: requireAt(PENDING_DECISION_CASES, 2).value,
		choice: requireAt(CHOICE_CASES, 2).value,
	},
	{
		name: "incident",
		decision: requireAt(PENDING_DECISION_CASES, 3).value,
		choice: requireAt(CHOICE_CASES, 3).value,
	},
	{
		name: "shelve",
		decision: requireAt(PENDING_DECISION_CASES, 0).value,
		choice: requireAt(CHOICE_CASES, 4).value,
	},
	{
		name: "paradigm",
		decision: requireAt(PENDING_DECISION_CASES, 4).value,
		choice: requireAt(CHOICE_CASES, 5).value,
	},
];

function readyModelState(): GameState {
	const state = pausedProductState();
	const model = state.models.items[0];
	if (model === undefined) throw new Error("Expected model fixture");
	model.status = "ready";
	state.products.items = [];
	state.company.insight = 2;
	state.company.trust = 100;
	state.company.hype = 100;
	return state;
}

function withPending(state: GameState, decision: PendingDecision): GameState {
	return {
		...state,
		decisions: { pending: [decision] },
		queue: {
			...state.queue,
			decisionIds: [decision.id],
		},
	};
}

function stateForDecision(decision: PendingDecision): GameState {
	const base =
		decision.kind === "launch" || decision.kind === "evaluation"
			? readyModelState()
			: startRun({ companyName: "Contract Labs" }, 42);
	return withPending(base, decision);
}

function stateWithDecisionAndChoice(
	decision: PendingDecision,
	choice: DecisionChoice,
): GameState {
	const state = stateForDecision(decision);
	return {
		...state,
		commandLog: [
			...state.commandLog,
			{
				id: "command_002",
				kind: "apply_decision",
				week: 1,
				choice,
			},
		],
	};
}

describe("typed Fact contracts", () => {
	it("validates every player-visible product resume outcome", () => {
		const result = applyProductResume(pausedProductState(), "product_001");
		const fact = result.facts[0];

		expect(fact).toEqual({
			kind: "product_resumed",
			productId: "product_001",
			channel: "chat",
			week: 1,
		});
		expect(() => assertFact(fact)).not.toThrow();
	});

	it("accepts every Fact variant and rejects malformed payloads", () => {
		for (const testCase of FACT_CASES) {
			expect(
				() => assertFact(testCase.value),
				`${testCase.name} valid fixture`,
			).not.toThrow();

			for (const key of testCase.required) {
				const missing = { ...testCase.value } as Record<string, unknown>;
				delete missing[key];
				expect(
					() => assertFact(missing),
					`${testCase.name} missing ${key}`,
				).toThrow(/missing|required|unsupported|must be/i);
			}

			const extra = {
				...testCase.value,
				unexpectedField: true,
			};
			expect(() => assertFact(extra), `${testCase.name} extra field`).toThrow(
				/unexpected field/i,
			);

			const wrong = {
				...testCase.value,
				[testCase.wrong[0]]: testCase.wrong[1],
			};
			expect(
				() => assertFact(wrong),
				`${testCase.name} wrong ${testCase.wrong[0]}`,
			).toThrow(/unsupported|must be|between|integer|empty/i);
		}

		expect(() => assertFact({ kind: "unknown_fact", week: 1 })).toThrow(
			/fact kind.*unsupported/i,
		);

		const revenue = FACT_CASES.find((item) => item.name === "revenue");
		if (revenue?.value.kind !== "revenue") {
			throw new Error("Expected revenue fixture");
		}
		const revenueWithoutOptional = { ...revenue.value };
		delete revenueWithoutOptional.servedShare;
		expect(() => assertFact(revenueWithoutOptional)).not.toThrow();

		const funding = FACT_CASES.find((item) => item.name === "funding_resolved");
		if (funding?.value.kind !== "funding_resolved") {
			throw new Error("Expected funding fixture");
		}
		const fundingWithoutOptional = { ...funding.value };
		delete fundingWithoutOptional.factors;
		expect(() => assertFact(fundingWithoutOptional)).not.toThrow();
	});

	it("accepts every PendingDecision variant and rejects malformed payloads", () => {
		for (const testCase of PENDING_DECISION_CASES) {
			expect(
				() => assertDecisionsState({ pending: [testCase.value] }),
				`${testCase.name} valid fixture`,
			).not.toThrow();

			const serialized = JSON.stringify(testCase.value);
			const roundTripped: unknown = JSON.parse(serialized);
			expect(() =>
				assertDecisionsState({ pending: [roundTripped] }),
			).not.toThrow();
			expect(roundTripped).toEqual(testCase.value);

			for (const key of testCase.required) {
				const missing = { ...testCase.value } as Record<string, unknown>;
				delete missing[key];
				expect(
					() => assertDecisionsState({ pending: [missing] }),
					`${testCase.name} missing ${key}`,
				).toThrow(/missing|required|unsupported|must be/i);
			}

			const extra = {
				...testCase.value,
				unexpectedField: true,
			};
			expect(
				() => assertDecisionsState({ pending: [extra] }),
				`${testCase.name} extra field`,
			).toThrow(/unexpected field/i);

			const wrong = {
				...testCase.value,
				[testCase.wrong[0]]: testCase.wrong[1],
			};
			expect(
				() => assertDecisionsState({ pending: [wrong] }),
				`${testCase.name} wrong ${testCase.wrong[0]}`,
			).toThrow(/unsupported|must be|boolean|empty/i);
		}

		expect(() =>
			assertDecisionsState({
				pending: [{ kind: "unknown_decision", id: "decision_001" }],
			}),
		).toThrow(/pending decision kind.*unsupported/i);
	});

	it("accepts every DecisionChoice variant and rejects malformed payloads", () => {
		for (const testCase of CHOICE_CASES) {
			expect(
				() => assertDecisionChoice(testCase.value),
				`${testCase.name} valid fixture`,
			).not.toThrow();

			const serialized = JSON.stringify(testCase.value);
			const roundTripped: unknown = JSON.parse(serialized);
			expect(() => assertDecisionChoice(roundTripped)).not.toThrow();
			expect(roundTripped).toEqual(testCase.value);

			for (const key of testCase.required) {
				const missing = { ...testCase.value } as Record<string, unknown>;
				delete missing[key];
				expect(
					() => assertDecisionChoice(missing),
					`${testCase.name} missing ${key}`,
				).toThrow(/missing|required|unsupported|must be/i);
			}

			const extra = {
				...testCase.value,
				unexpectedField: true,
			};
			expect(
				() => assertDecisionChoice(extra),
				`${testCase.name} extra field`,
			).toThrow(/unexpected field/i);

			const wrong = {
				...testCase.value,
				[testCase.wrong[0]]: testCase.wrong[1],
			};
			expect(
				() => assertDecisionChoice(wrong),
				`${testCase.name} wrong ${testCase.wrong[0]}`,
			).toThrow(/unsupported|must be|boolean|empty/i);
		}

		expect(() =>
			assertDecisionChoice({
				kind: "unknown_choice",
				decisionId: "decision_001",
			}),
		).toThrow(/choice kind.*unsupported/i);
	});

	it("round-trips every pending decision and choice through the state boundary", () => {
		for (const testCase of DECISION_ROUND_TRIP_CASES) {
			const state = stateWithDecisionAndChoice(
				testCase.decision,
				testCase.choice,
			);
			const restored = deserializeGameState(serializeGameState(state));
			const command = restored.commandLog.at(-1);

			expect(restored.decisions.pending).toEqual([testCase.decision]);
			expect(command).toMatchObject({
				kind: "apply_decision",
				choice: testCase.choice,
			});
			expect(() => assertDecisionsState(restored.decisions)).not.toThrow();
			expect(() => assertDecisionChoice(testCase.choice)).not.toThrow();
		}
	});

	it("applies every DecisionChoice variant without mutating input state", () => {
		const scenarios: readonly DecisionRoundTripCase[] = [
			{
				name: "launch",
				decision: requireAt(PENDING_DECISION_CASES, 0).value,
				choice: requireAt(CHOICE_CASES, 0).value,
			},
			{
				name: "evaluate",
				decision: requireAt(PENDING_DECISION_CASES, 1).value,
				choice: requireAt(CHOICE_CASES, 1).value,
			},
			{
				name: "funding",
				decision: requireAt(PENDING_DECISION_CASES, 2).value,
				choice: requireAt(CHOICE_CASES, 2).value,
			},
			{
				name: "incident",
				decision: requireAt(PENDING_DECISION_CASES, 3).value,
				choice: requireAt(CHOICE_CASES, 3).value,
			},
			{
				name: "shelve",
				decision: requireAt(PENDING_DECISION_CASES, 0).value,
				choice: requireAt(CHOICE_CASES, 4).value,
			},
		];

		for (const scenario of scenarios) {
			const state = stateForDecision(scenario.decision);
			const before = serializeGameState(state);
			const result = applyDecision(state, scenario.choice);

			expect(serializeGameState(state), scenario.name).toBe(before);
			expect(result.state.decisions.pending, scenario.name).toEqual([]);
			expect(result.state.commandLog.at(-1), scenario.name).toMatchObject({
				kind: "apply_decision",
				choice: scenario.choice,
			});
			expect(() => serializeGameState(result.state)).not.toThrow();
		}
	});

	it("rejects invalid choices before mutating state", () => {
		const state = stateForDecision(requireAt(PENDING_DECISION_CASES, 0).value);
		const before = serializeGameState(state);

		expect(() =>
			applyDecision(state, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "invalid_channel" as never,
			}),
		).toThrow(/channel/i);
		expect(serializeGameState(state)).toBe(before);

		expect(() =>
			applyDecision(state, {
				kind: "evaluate",
				decisionId: "decision_001",
				evaluation: "capability",
			}),
		).toThrow(/compatible|decision/i);
		expect(serializeGameState(state)).toBe(before);
	});

	it("accepts every Fact kind as a terminal contributor", () => {
		expect(() =>
			assertTerminalState({
				status: "lost",
				reason: "cash_depleted",
				frontierReached: false,
				contributors: [
					{
						kind: "serving_throttled",
						impact: -3,
						week: 1,
						index: 0,
					},
					{
						kind: "training_starved",
						impact: -2,
						week: 1,
						index: 1,
					},
					{
						kind: "product_resumed",
						impact: -1,
						week: 1,
						index: 2,
					},
				],
			}),
		).not.toThrow();
	});
});
