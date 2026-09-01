import { describe, expect, it } from "vitest";

import { advanceWeek } from "./advance-week.js";
import { assignProject } from "./commands/projects.js";
import { hireTeam } from "./commands/teams.js";
import type { Model } from "./components/models.js";
import { assertFact, type Fact } from "./components/reports.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	ATTENTION_MECHANISM_ID,
	assertResearchDefinitions,
	assertResearchEffect,
	PARALLEL_TRAINING_ID,
	RESEARCH_EFFECT_BALANCE,
	RESEARCH_NODES,
	RNN_LSTM_ID,
	WORD_VECTORS_ID,
} from "./data/research.js";
import { runEvaluation } from "./evaluations.js";
import {
	deserializeGameState,
	replayCommandLog,
	serializeGameState,
	startRun,
} from "./index.js";
import { assertGameState } from "./invariants.js";
import { designModel, type ModelDesignSpec } from "./model-design.js";
import { deriveResearchEffects } from "./research-effects.js";
import type { GameState } from "./state.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";
import { trainingSystem } from "./systems/training.js";

const MODEL_SPEC: ModelDesignSpec = {
	name: "Aurora-1",
	family: "text",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function getResearchNode(state: GameState, nodeId: string) {
	const node = state.research.nodes.find(
		(candidate) => candidate.id === nodeId,
	);
	if (node === undefined) throw new Error(`Expected research node ${nodeId}`);
	return node;
}

function completePrerequisites(
	state: GameState,
	nodeId: string,
	visiting = new Set<string>(),
): void {
	if (visiting.has(nodeId)) throw new Error(`Fixture cycle at ${nodeId}`);
	const definition = RESEARCH_NODES.find((node) => node.id === nodeId);
	if (definition === undefined)
		throw new Error(`Expected definition ${nodeId}`);
	const stateNode = getResearchNode(state, nodeId);
	visiting.add(nodeId);
	for (const prerequisite of definition.prerequisites) {
		completePrerequisites(state, prerequisite, visiting);
	}
	visiting.delete(nodeId);
	stateNode.status = "completed";
}

function completeResearchNodeThroughCommands(
	initial: GameState,
	nodeId: string,
): { state: GameState; facts: Fact[] } {
	let state = initial;
	const facts: Fact[] = [];
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const node = getResearchNode(state, nodeId);
		if (node.status === "completed") return { state, facts };
		const project = state.projects.items.find(
			(candidate) =>
				candidate.kind === "research" &&
				candidate.nodeId === nodeId &&
				candidate.status === "available",
		);
		if (project === undefined) {
			const result = advanceWeek(state);
			state = result.state;
			facts.push(...result.facts);
			continue;
		}
		const team = state.teams.items.find(
			(candidate) => candidate.activeProjectId === null,
		);
		if (team === undefined) throw new Error("Expected an idle research team");
		if (state.company.insight < node.insightCost) {
			const result = advanceWeek(state);
			state = result.state;
			facts.push(...result.facts);
			continue;
		}
		state = assignProject(state, team.id, project.id).state;
		const result = advanceWeek(state);
		state = result.state;
		facts.push(...result.facts);
	}
	throw new Error(`Research node ${nodeId} did not complete in fixture`);
}

function completeParallelTrainingResearch(): {
	state: GameState;
	facts: Fact[];
} {
	let state = startRun({ companyName: "Effects Lab" }, 42);
	const facts: Fact[] = [];
	for (const nodeId of [
		"text_products_safety_basics",
		ATTENTION_MECHANISM_ID,
		"self_attention",
		"multi_head_attention",
		"positional_encoding",
		PARALLEL_TRAINING_ID,
	]) {
		const completed = completeResearchNodeThroughCommands(state, nodeId);
		state = completed.state;
		facts.push(...completed.facts);
	}
	return { state, facts };
}

function modelForEvaluation(): Model {
	return {
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
	};
}

function evaluationState(withResearchEffect: boolean): GameState {
	const state = startRun({ companyName: "Evaluation Effects Lab" }, 42);
	getResearchNode(state, WORD_VECTORS_ID).status = "completed";
	completePrerequisites(state, "text_products_safety_basics");
	if (withResearchEffect) {
		getResearchNode(state, ATTENTION_MECHANISM_ID).status = "completed";
	}
	state.company.insight = 10;
	state.models.items = [modelForEvaluation()];
	return state;
}

function trainingState(effectNodeId?: string): GameState {
	const state = startRun({ companyName: "Training Effects Lab" }, 42);
	getResearchNode(state, WORD_VECTORS_ID).status = "completed";
	if (effectNodeId !== undefined) {
		completePrerequisites(state, effectNodeId);
	}
	return designModel(state, MODEL_SPEC).state;
}

describe("typed research effects", () => {
	it("declares typed effects on a coherent first research slice", () => {
		expect(
			RESEARCH_NODES.find((node) => node.id === RNN_LSTM_ID)?.effects,
		).toEqual([
			{
				kind: "model_score_bonus",
				dimension: "reliability",
				amount: RESEARCH_EFFECT_BALANCE.recurrentReliabilityScoreBonus,
			},
		]);
		expect(
			RESEARCH_NODES.find((node) => node.id === PARALLEL_TRAINING_ID)?.effects,
		).toEqual([
			{
				kind: "training_compute_reduction",
				amount: RESEARCH_EFFECT_BALANCE.parallelTrainingComputeReduction,
			},
		]);
		expect(
			RESEARCH_NODES.find((node) => node.id === ATTENTION_MECHANISM_ID)
				?.effects,
		).toEqual([
			{
				kind: "evaluation_coverage_bonus",
				evaluation: "capability",
				amount:
					RESEARCH_EFFECT_BALANCE.attentionCapabilityEvaluationCoverageBonus,
			},
		]);
	});

	it.each(["locked", "available"] as const)(
		"keeps a %s node effect inactive",
		(status) => {
			const state = startRun({ companyName: "Inactive Effects Lab" }, 42);
			getResearchNode(state, RNN_LSTM_ID).status = status;
			const effects = deriveResearchEffects(state.research);
			expect(effects.modelScoreBonus.reliability).toBe(0);
			expect(effects.trainingComputeReduction).toBe(0);
		},
	);

	it("activates an effect when the node completes through normal research", () => {
		const completed = completeResearchNodeThroughCommands(
			startRun({ companyName: "Normal Effects Lab" }, 42),
			RNN_LSTM_ID,
		);
		const fact = completed.facts.find(
			(candidate) =>
				candidate.kind === "research_completed" &&
				candidate.nodeId === RNN_LSTM_ID,
		);
		if (fact === undefined || fact.kind !== "research_completed") {
			throw new Error("Expected the typed research completion fact");
		}
		expect(
			deriveResearchEffects(completed.state.research).modelScoreBonus
				.reliability,
		).toBe(RESEARCH_EFFECT_BALANCE.recurrentReliabilityScoreBonus);
		expect(fact.effects).toEqual([
			{
				kind: "model_score_bonus",
				dimension: "reliability",
				amount: RESEARCH_EFFECT_BALANCE.recurrentReliabilityScoreBonus,
			},
		]);
		expect(() => assertFact(fact)).not.toThrow();
		const report = completed.state.reports.items.find(
			(candidate) =>
				candidate.fact.kind === "research_completed" &&
				candidate.fact.nodeId === RNN_LSTM_ID,
		);
		expect(report?.fact).toEqual(fact);
	});

	it("recomputes training reservations when an effect activates during advanceWeek", () => {
		const state = startRun({ companyName: "Activation Boundary Lab" }, 42);
		getResearchNode(state, WORD_VECTORS_ID).status = "completed";
		completePrerequisites(state, PARALLEL_TRAINING_ID);
		getResearchNode(state, PARALLEL_TRAINING_ID).status = "available";
		state.company.insight = 1;

		const staffed = hireTeam(state, "Research Team").state;
		const materialized = researchSystem(staffed, {
			phase: "research",
			week: staffed.meta.week,
		}).state;
		const researchProject = materialized.projects.items.find(
			(project) =>
				project.kind === "research" &&
				project.nodeId === PARALLEL_TRAINING_ID &&
				project.status === "available",
		);
		if (researchProject === undefined) {
			throw new Error("Expected the scaling research project");
		}
		const designed = designModel(materialized, MODEL_SPEC).state;
		const assigned = assignProject(
			designed,
			"team_002",
			researchProject.id,
		).state;

		const advanced = advanceWeek(assigned);

		expect(
			advanced.state.research.nodes.find(
				(node) => node.id === PARALLEL_TRAINING_ID,
			)?.status,
		).toBe("completed");
		expect(advanced.state.compute.trainingDemand).toBe(
			BALANCE.modelTiers.standard.trainingCompute -
				RESEARCH_EFFECT_BALANCE.parallelTrainingComputeReduction,
		);
		expect(advanced.state.compute.allocated).toBe(
			advanced.state.compute.trainingDemand,
		);
	});

	it("derives effects idempotently across repeated research ticks", () => {
		const completed = completeParallelTrainingResearch();
		const before = deriveResearchEffects(completed.state.research);
		const firstTick = researchSystem(completed.state, {
			phase: "research",
			week: completed.state.meta.week,
		});
		const secondTick = researchSystem(firstTick.state, {
			phase: "research",
			week: firstTick.state.meta.week,
		});

		expect(deriveResearchEffects(secondTick.state.research)).toEqual(before);
		expect(
			firstTick.facts.filter((fact) => fact.kind === "research_completed"),
		).toEqual([]);
		expect(
			secondTick.facts.filter((fact) => fact.kind === "research_completed"),
		).toEqual([]);
	});

	it("changes training compute demand and progress without an active effect", () => {
		const inactive = trainingState();
		const active = trainingState(PARALLEL_TRAINING_ID);
		for (const state of [inactive, active]) {
			state.compute.capacity = 4;
			state.compute = withRecomputedCompute(state);
		}

		const inactiveTick = trainingSystem(inactive, {
			phase: "training",
			week: 1,
		});
		const activeTick = trainingSystem(active, { phase: "training", week: 1 });

		expect(inactiveTick.state.compute.trainingDemand).toBe(5);
		expect(activeTick.state.compute.trainingDemand).toBe(4);
		expect(inactiveTick.state.projects.items.at(-1)?.progress).toBe(0);
		expect(activeTick.state.projects.items.at(-1)?.progress).toBe(1);
	});

	it("changes generated model scores from a completed score-effect node", () => {
		const inactive = trainingState();
		const active = trainingState(RNN_LSTM_ID);
		for (const state of [inactive, active]) {
			const project = state.projects.items.at(-1);
			if (project === undefined || project.kind !== "training") {
				throw new Error("Expected a training project");
			}
			project.duration = 1;
		}

		const inactiveResult = trainingSystem(inactive, {
			phase: "training",
			week: 1,
		});
		const activeResult = trainingSystem(active, { phase: "training", week: 1 });
		const inactiveScores = inactiveResult.state.models.items.at(-1)?.trueScores;
		const activeScores = activeResult.state.models.items.at(-1)?.trueScores;
		if (inactiveScores === undefined || activeScores === undefined) {
			throw new Error("Expected generated model scores");
		}

		expect(activeScores.reliability).toBe(
			inactiveScores.reliability +
				RESEARCH_EFFECT_BALANCE.recurrentReliabilityScoreBonus,
		);
	});

	it("changes evaluation coverage from a completed evaluation-effect node", () => {
		const inactive = runCapabilityEvaluation(evaluationState(false));
		const active = runCapabilityEvaluation(evaluationState(true));
		const inactiveCompletion = inactive.facts.find(
			(fact) => fact.kind === "evaluation_completed",
		);
		const activeCompletion = active.facts.find(
			(fact) => fact.kind === "evaluation_completed",
		);
		if (
			inactiveCompletion?.kind !== "evaluation_completed" ||
			activeCompletion?.kind !== "evaluation_completed"
		) {
			throw new Error("Expected evaluation completion facts");
		}

		expect(inactiveCompletion.coverage).toBe(
			BALANCE.evaluations.capability.coveragePercent,
		);
		expect(activeCompletion.coverage).toBe(
			BALANCE.evaluations.capability.coveragePercent +
				RESEARCH_EFFECT_BALANCE.attentionCapabilityEvaluationCoverageBonus,
		);
	});

	it("rejects malformed effect definitions, facts, and persisted effect-shaped state", () => {
		const source = RESEARCH_NODES[0];
		if (source === undefined) throw new Error("Expected a source definition");
		expect(() =>
			assertResearchDefinitions([
				{
					...source,
					id: "malformed_effect_node",
					effects: [
						{
							kind: "model_score_bonus",
							dimension: "capability",
							amount: 0,
						},
					] as never,
				},
			]),
		).toThrow(/positive|effect/i);

		expect(() =>
			assertResearchEffect({
				kind: "training_compute_reduction",
				amount: 101,
			}),
		).toThrow(/at most|bounded|reduction/i);

		expect(() =>
			assertFact({
				kind: "research_completed",
				nodeId: RNN_LSTM_ID,
				week: 1,
				effects: [
					{
						kind: "unknown_effect",
						amount: 1,
					},
				],
			} as never),
		).toThrow(/effect|unsupported/i);

		const malformedState = startRun(
			{ companyName: "Malformed Effects Lab" },
			42,
		);
		(malformedState.research as unknown as Record<string, unknown>).effects =
			[];
		expect(() => assertGameState(malformedState)).toThrow(/unexpected field/i);
	});

	it("preserves typed effects through save/load and deterministic replay reports", () => {
		const live = completeParallelTrainingResearch();
		const serialized = serializeGameState(live.state);
		const restored = deserializeGameState(serialized);
		expect(deriveResearchEffects(restored.research)).toEqual(
			deriveResearchEffects(live.state.research),
		);
		expect(restored.reports.items.map((report) => report.fact)).toEqual(
			live.state.reports.items.map((report) => report.fact),
		);

		const replayed = replayCommandLog(live.state.commandLog, {
			expectedState: live.state,
		});
		expect(JSON.stringify(replayed)).toBe(JSON.stringify(live.state));
		expect(
			replayed.reports.items.some(
				(report) =>
					report.fact.kind === "research_completed" &&
					report.fact.effects !== undefined,
			),
		).toBe(true);
	}, 30_000);
});

function runCapabilityEvaluation(
	state: GameState,
): ReturnType<typeof projectsSystem> {
	const started = runEvaluation(state, "model_001", "capability");
	const project = started.state.projects.items.find(
		(item) => item.kind === "evaluation",
	);
	if (project === undefined) throw new Error("Expected an evaluation project");
	project.duration = 1;
	return projectsSystem(started.state, { phase: "projects", week: 1 });
}
