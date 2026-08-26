import { describe, expect, it } from "vitest";
import { runEvaluation } from "./evaluations.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";
import type { GameState } from "./state.js";

function scoredState(): GameState {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.insight = 10;
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
			emphasis: { capability: 1, reliability: 3, safety: 1, efficiency: 1 },
			trueScores: {
				capability: 80,
				coding: 70,
				reliability: 30,
				safety: 20,
				efficiency: 60,
				multimodal: 10,
			},
			estimates: {
				capability: { estimate: 40, lower: 20, upper: 60 },
				coding: { estimate: 60, lower: 40, upper: 80 },
				reliability: { estimate: 70, lower: 50, upper: 90 },
				safety: { estimate: 50, lower: 30, upper: 70 },
				efficiency: { estimate: 55, lower: 35, upper: 75 },
				multimodal: { estimate: 20, lower: 0, upper: 40 },
			},
		},
	];
	return state;
}

describe("evaluations", () => {
	it("surfaces an evaluation choice from the normal weekly ready-model path", () => {
		const result = advanceWeek(scoredState());
		expect(result.pending).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "evaluation",
					modelId: "model_001",
					evaluation: "capability",
					blocking: true,
				}),
			]),
		);
	});

	it("accepts evaluate from a generated decision and starts the project", () => {
		const offered = advanceWeek(scoredState());
		const decision = offered.state.decisions.pending.find(
			(item) => item.kind === "evaluation",
		);
		if (decision?.kind !== "evaluation")
			throw new Error("Expected evaluation decision");

		const result = applyDecision(offered.state, {
			kind: "evaluate",
			decisionId: decision.id,
			evaluation: decision.evaluation,
		});
		expect(result.state.projects.items).toContainEqual(
			expect.objectContaining({
				kind: "evaluation",
				status: "active",
				modelId: "model_001",
			}),
		);
		expect(result.state.decisions.pending).not.toContainEqual(decision);
	});

	it("starts a real evaluation project with exact resources and no completion fact", () => {
		const state = scoredState();
		const result = runEvaluation(state, "model_001", "capability");
		const project = result.state.projects.items.find(
			(item) => item.kind === "evaluation",
		);

		expect(project).toMatchObject({
			kind: "evaluation",
			modelId: "model_001",
			evaluation: "capability",
			status: "active",
			teamId: "team_001",
			progress: 0,
		});
		expect(result.state.company.insight).toBe(8);
		expect(result.state.compute.allocated).toBe(2);
		expect(result.facts).not.toContainEqual(
			expect.objectContaining({ kind: "evaluation_completed" }),
		);
	});

	it("rejects an evaluation that cannot reserve all compute before mutation", () => {
		const state = scoredState();
		state.compute.capacity = 1;
		const before = JSON.stringify(state);

		expect(() => runEvaluation(state, "model_001", "capability")).toThrow(
			/compute|capacity/i,
		);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("completes the project on a later week and narrows only relevant dimensions", () => {
		const state = scoredState();
		const started = runEvaluation(state, "model_001", "capability");
		const before = started.state.models.items[0];
		if (before?.estimates === undefined) throw new Error("Expected estimates");
		const completed = advanceWeek(started.state);
		const after = completed.state.models.items[0];
		if (after?.estimates === undefined) throw new Error("Expected estimates");

		expect(completed.facts).toContainEqual(
			expect.objectContaining({
				kind: "evaluation_completed",
				modelId: "model_001",
				evaluation: "capability",
			}),
		);
		expect(after.estimates.capability).not.toEqual(before.estimates.capability);
		expect(after.estimates.coding).not.toEqual(before.estimates.coding);
		expect(after.estimates.reliability).toEqual(before.estimates.reliability);
		expect(completed.state.compute.allocated).toBe(0);
		expect(
			completed.state.projects.items.find((item) => item.kind === "evaluation"),
		).toMatchObject({
			status: "completed",
			teamId: null,
		});
	});
	it("never moves an estimate past the hidden score and safety emphasis improves safety evaluation coverage", () => {
		const state = scoredState();
		const started = runEvaluation(state, {
			modelId: "model_001",
			evaluation: "safety_reliability",
		});
		const result = advanceWeek(started.state);
		const model = result.state.models.items[0];
		if (model?.estimates === undefined || model.trueScores === undefined) {
			throw new Error("Expected evaluated model fixture");
		}

		expect(model.estimates.reliability.estimate).toBeLessThan(70);
		expect(model.estimates.reliability.estimate).toBeGreaterThanOrEqual(30);
		expect(model.estimates.safety.estimate).toBeGreaterThanOrEqual(20);
		expect(model.estimates.capability).toEqual(
			scoredState().models.items[0]?.estimates?.capability,
		);
	});

	it("narrows capability bands by exactly the coverage-weighted movement", () => {
		const state = scoredState();
		const started = runEvaluation(state, "model_001", "capability");
		const project = started.state.projects.items.find(
			(item) => item.kind === "evaluation",
		);
		if (project === undefined) throw new Error("Expected evaluation project");
		project.duration = 1;
		const result = advanceWeek(started.state);
		const model = result.state.models.items[0];
		if (model?.estimates === undefined) throw new Error("Expected estimates");
		const completion = result.facts.find(
			(fact) => fact.kind === "evaluation_completed",
		);

		expect(model.estimates.capability).toEqual({
			estimate: 54,
			lower: 41,
			upper: 67,
		});
		expect(model.estimates.coding).toEqual({
			estimate: 63,
			lower: 50,
			upper: 77,
		});
		expect(model.estimates.reliability).toEqual({
			estimate: 70,
			lower: 50,
			upper: 90,
		});
		expect(completion).toMatchObject({
			kind: "evaluation_completed",
			coverage: 35,
		});
	});

	it("applies the safety emphasis bonus to safety evaluation coverage and bands", () => {
		const state = scoredState();
		const started = runEvaluation(state, {
			modelId: "model_001",
			evaluation: "safety_reliability",
		});
		const project = started.state.projects.items.find(
			(item) => item.kind === "evaluation",
		);
		if (project === undefined) throw new Error("Expected evaluation project");
		project.duration = 1;
		const result = advanceWeek(started.state);
		const model = result.state.models.items[0];
		if (model?.estimates === undefined) throw new Error("Expected estimates");
		const completion = result.facts.find(
			(fact) => fact.kind === "evaluation_completed",
		);

		expect(model.estimates.reliability).toEqual({
			estimate: 48,
			lower: 39,
			upper: 57,
		});
		expect(model.estimates.safety).toEqual({
			estimate: 34,
			lower: 25,
			upper: 43,
		});
		expect(model.estimates.capability).toEqual({
			estimate: 40,
			lower: 20,
			upper: 60,
		});
		expect(completion).toMatchObject({
			kind: "evaluation_completed",
			coverage: 55,
		});
	});
});
