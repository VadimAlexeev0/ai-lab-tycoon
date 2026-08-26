import { describe, expect, it } from "vitest";
import type { PendingDecision } from "./components/decisions.js";
import { BALANCE } from "./data/balance.js";
import { applyDecision, startRun } from "./index.js";
import type { GameState } from "./state.js";

function readyState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.hype = 100;
	state.company.trust = 100;
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
				capability: { estimate: 60, lower: 40, upper: 80 },
				coding: { estimate: 50, lower: 30, upper: 70 },
				reliability: { estimate: 60, lower: 40, upper: 80 },
				safety: { estimate: 50, lower: 30, upper: 70 },
				efficiency: { estimate: 50, lower: 30, upper: 70 },
				multimodal: { estimate: 0, lower: 0, upper: 20 },
			},
		},
	];
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

describe("applyDecision compatibility matrix", () => {
	it("rejects a choice for an unknown decision id", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(() =>
			applyDecision(state, {
				kind: "launch",
				decisionId: "decision_999",
				channel: "chat",
			}),
		).toThrow(/unknown decision/i);
	});

	it("rejects contract violations in choice kinds", () => {
		const launch = withPending(readyState(), {
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			channel: "developer_api",
			blocking: true,
		});
		expect(() =>
			applyDecision(launch, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			}),
		).toThrow(/not compatible/i);

		const evaluation = withPending(readyState(), {
			kind: "evaluation",
			id: "decision_001",
			modelId: "model_001",
			evaluation: "capability",
			blocking: true,
		});
		expect(() =>
			applyDecision(evaluation, {
				kind: "evaluate",
				decisionId: "decision_001",
				evaluation: "safety_reliability",
			}),
		).toThrow(/not compatible/i);
		expect(() =>
			applyDecision(evaluation, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			}),
		).toThrow(/not compatible/i);

		const funding = withPending(startRun({ companyName: "Acme Labs" }, 42), {
			kind: "funding",
			id: "decision_001",
			round: "seed",
			blocking: false,
		});
		expect(() =>
			applyDecision(funding, {
				kind: "funding",
				decisionId: "decision_001",
				round: "series_a",
				accept: true,
			}),
		).toThrow(/not compatible/i);
		expect(() =>
			applyDecision(funding, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			}),
		).toThrow(/not compatible/i);
	});

	it("rejects shelving any non-model decision as incompatible", () => {
		const incident = withPending(readyState(), {
			kind: "incident",
			id: "decision_001",
			incident: "outage",
			blocking: true,
		});
		expect(() =>
			applyDecision(incident, {
				kind: "shelve",
				decisionId: "decision_001",
			}),
		).toThrow(/not compatible/i);

		const funding = withPending(startRun({ companyName: "Acme Labs" }, 42), {
			kind: "funding",
			id: "decision_001",
			round: "seed",
			blocking: false,
		});
		expect(() =>
			applyDecision(funding, {
				kind: "shelve",
				decisionId: "decision_001",
			}),
		).toThrow(/not compatible/i);
	});

	it("resolves a launch decision through the modeled public path", () => {
		const state = withPending(readyState(), {
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			blocking: true,
		});
		const result = applyDecision(state, {
			kind: "launch",
			decisionId: "decision_001",
			channel: "chat",
		});

		expect(result.state.products.items[0]).toMatchObject({
			channel: "chat",
			modelId: "model_001",
			status: "operating",
		});
		expect(result.state.models.items[0]?.status).toBe("launched");
		expect(result.state.decisions.pending).toEqual([]);
		expect(result.state.queue.decisionIds).toEqual([]);
		expect(result.state.commandLog.at(-1)).toMatchObject({
			kind: "apply_decision",
			choice: {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			},
		});
		expect(result.state.company.cash).toBe(
			state.company.cash - BALANCE.productChannels.chat.launchCost,
		);
		expect(result.facts).toContainEqual(
			expect.objectContaining({ kind: "product_launched", channel: "chat" }),
		);
	});

	it("resolves a launch decision with a compatible channel when locked", () => {
		const state = withPending(readyState(), {
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			channel: "chat",
			blocking: true,
		});
		const result = applyDecision(state, {
			kind: "launch",
			decisionId: "decision_001",
			channel: "chat",
		});
		expect(result.state.products.items[0]?.channel).toBe("chat");
	});

	it("reports an estimate-less model launch as not implemented", () => {
		const state = readyState();
		const model = state.models.items[0];
		if (model === undefined) throw new Error("Expected model");
		delete (model as Partial<typeof model>).estimates;
		const withDecision = withPending(state, {
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			blocking: true,
		});
		expect(() =>
			applyDecision(withDecision, {
				kind: "launch",
				decisionId: "decision_001",
				channel: "chat",
			}),
		).toThrow(/not implemented|estimate/i);
	});

	it("re-checks the terminal after an incident response leaves cash negative", () => {
		const state = readyState();
		const withIncident = withPending(state, {
			kind: "incident",
			id: "decision_001",
			incident: "outage",
			blocking: true,
		});
		const incidentState = {
			...withIncident,
			company: {
				...withIncident.company,
				cash: 20,
			},
		};
		const result = applyDecision(incidentState, {
			kind: "incident",
			decisionId: "decision_001",
			response: "repair",
		});
		expect(result.state.terminal).toMatchObject({ status: "lost" });
		expect(result.state.decisions.pending).toEqual([]);
	});
});
