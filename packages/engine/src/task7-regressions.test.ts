import { describe, expect, it } from "vitest";
import { WEEKLY_SYSTEMS } from "./advance-week.js";
import { BALANCE } from "./data/balance.js";
import { runEvaluation } from "./evaluations.js";
import { advanceWeek, applyDecision, designModel, startRun } from "./index.js";
import { launchProduct } from "./products.js";
import type { GameState } from "./state.js";

const SPEC = {
	name: "Aurora-1",
	family: "text" as const,
	foundation: "fresh" as const,
	tier: "lean" as const,
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function scenario(): { state: GameState; events: unknown[] } {
	let state = startRun({ companyName: "Acme Labs" }, 42);
	const researchNode = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (researchNode === undefined)
		throw new Error("Expected text model research");
	researchNode.status = "completed";
	state = designModel(state, SPEC).state;
	state.company.cash = 10_000;
	const events: unknown[] = [];

	for (let week = 0; week < 20; week += 1) {
		const advanced = advanceWeek(state);
		state = advanced.state;
		events.push({ facts: advanced.facts, pending: advanced.pending });
		while (state.decisions.pending.length > 0) {
			const decision = state.decisions.pending[0];
			if (decision === undefined) break;
			const choice =
				decision.kind === "launch"
					? {
							kind: "launch" as const,
							decisionId: decision.id,
							channel: "chat" as const,
						}
					: decision.kind === "funding"
						? {
								kind: "funding" as const,
								decisionId: decision.id,
								round: decision.round,
								accept: true,
							}
						: decision.kind === "incident"
							? {
									kind: "incident" as const,
									decisionId: decision.id,
									response: "disclose" as const,
								}
							: {
									kind: "evaluate" as const,
									decisionId: decision.id,
									evaluation: decision.evaluation,
								};
			const resolved = applyDecision(state, choice);
			state = resolved.state;
			if (decision.kind === "incident") state.compute.capacity = 100;
			events.push({ facts: resolved.facts, pending: resolved.pending });
		}
	}
	return { state, events };
}

describe("Task 7 integration and replay regressions", () => {
	it("keeps the documented weekly system order", () => {
		expect(WEEKLY_SYSTEMS.map(({ phase }) => phase)).toEqual([
			"upkeep",
			"projects",
			"research",
			"training",
			"products",
			"rivals",
			"funding",
			"incidents",
			"terminal",
		]);
	});

	it("is byte-stable for a 20-week design, train, launch, and incident run", () => {
		const first = scenario();
		const second = scenario();
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(first.state.products.items.length).toBeGreaterThan(0);
		expect(
			first.events.flatMap((event) => (event as { facts: unknown[] }).facts),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "model_trained" }),
				expect.objectContaining({ kind: "product_launched" }),
				expect.objectContaining({ kind: "incident_occurred" }),
			]),
		);
	});

	it("records direct evaluation and launch commands so they can be replayed", () => {
		const state = startRun({ companyName: "Acme Labs" }, 9);
		state.company.insight = BALANCE.evaluations.capability.insightCost;
		state.company.hype = 100;
		state.company.trust = 100;
		state.meta.era = "assistant";
		state.research.currentEra = "assistant";
		state.models.items = [
			{
				id: "model_001",
				name: "Assistant-1",
				foundation: "fresh",
				status: "ready",
				projectId: null,
				family: "assistant",
				tier: "standard",
				scoreCeiling: 88,
				dataMix: { general: 70, code: 20, multimodal: 10 },
				emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
				trueScores: {
					capability: 70,
					coding: 70,
					reliability: 70,
					safety: 70,
					efficiency: 70,
					multimodal: 40,
				},
				estimates: {
					capability: { estimate: 50, lower: 30, upper: 70 },
					coding: { estimate: 50, lower: 30, upper: 70 },
					reliability: { estimate: 50, lower: 30, upper: 70 },
					safety: { estimate: 50, lower: 30, upper: 70 },
					efficiency: { estimate: 50, lower: 30, upper: 70 },
					multimodal: { estimate: 40, lower: 20, upper: 60 },
				},
			},
		];
		const evaluated = runEvaluation(state, "model_001", "capability").state;
		const launched = launchProduct(evaluated, "model_001", "chat").state;
		const kinds = launched.commandLog.map((entry) => entry.kind);
		expect(kinds).toContain("run_evaluation");
		expect(kinds).toContain("launch_product");
	});
});
