import { describe, expect, it } from "vitest";
import {
	advanceWeek,
	applyDecision,
	applyProductResume,
	assignProject,
	buyCompute,
	type DecisionChoice,
	designModel,
	type ModelDesignSpec,
	type PendingDecision,
	replayCommandLog,
	selectAvailableProjects,
	startRun,
} from "./index.js";
import {
	assertGameState,
	assertionsEnabled,
	setAssertionsEnabled,
} from "./invariants.js";
import type { GameState } from "./state.js";

type ResearchProject = Extract<
	ReturnType<typeof selectAvailableProjects>[number],
	{ kind: "research" }
>;

type ScenarioAction =
	| { kind: "assign_project"; teamId: string; projectId: string }
	| { kind: "buy_compute" }
	| { kind: "design_model"; spec: ModelDesignSpec }
	| { kind: "resume_product"; productId: string }
	| { kind: "advance_week" };

const MODEL_RESEARCH_NODES = {
	text: "text_models_principles",
	assistant: "assistant_models_reasoning",
	multimodal: "multimodal_models_fusion",
} as const;

// Keep this order in lockstep with the sim CLI's efficiency-first policy. The
// scenario intentionally exercises the same public-command path as a seeded
// balance run without importing the CLI's process entrypoint into the engine.
const EFFICIENCY_RESEARCH_ORDER = [
	"text_models_principles",
	"text_models_keystone",
	"assistant_models_reasoning",
	"assistant_models_tool_use",
	"assistant_models_keystone",
	"multimodal_models_fusion",
	"text_infrastructure_compute",
	"text_infrastructure_scaling",
] as const;

const MODEL_DATA_MIXES = {
	text: { general: 60, code: 30, multimodal: 10 },
	assistant: { general: 50, code: 30, multimodal: 20 },
	multimodal: { general: 40, code: 20, multimodal: 40 },
} as const;

const MODEL_FOUNDATIONS = {
	text: "fresh",
	assistant: "continued",
	multimodal: "distilled",
} as const;

const MODEL_DESIGN_COSTS = {
	text: 80,
	assistant: 200,
	multimodal: 260,
} as const;

/**
 * Drive a long-lived seeded run with the efficiency-first public policy used
 * by apps/sim-cli. The loop resolves real decision cards, uses real research
 * selectors, and invokes only exported engine transitions.
 */
function efficiencyFirstRun(seed: number, steps = 120): GameState {
	let state = startRun({ companyName: "Replay Labs" }, seed);

	for (let step = 0; step < steps; step += 1) {
		if (state.terminal.status === "lost") break;

		let decisionSteps = 0;
		while (state.decisions.pending.length > 0 && decisionSteps < 16) {
			decisionSteps += 1;
			const choice = chooseDecision(state);
			if (choice === null) {
				throw new Error(
					"Efficiency-first policy left a pending decision unresolved",
				);
			}
			state = applyDecision(state, choice).state;
		}
		if (state.decisions.pending.length > 0) {
			throw new Error("Efficiency-first policy exceeded the decision guard");
		}

		state = applyScenarioAction(state, chooseAction(state));
		state = advanceWeek(state).state;
	}

	return state;
}

function chooseDecision(state: GameState): DecisionChoice | null {
	const decision =
		state.decisions.pending.find((candidate) => candidate.blocking) ??
		state.decisions.pending[0];
	if (decision === undefined) return null;

	switch (decision.kind) {
		case "launch":
			return {
				kind: "launch",
				decisionId: decision.id,
				channel: decision.channel ?? "chat",
			};
		case "evaluation":
			return {
				kind: "evaluate",
				decisionId: decision.id,
				evaluation: decision.evaluation,
			};
		case "funding":
			return {
				kind: "funding",
				decisionId: decision.id,
				round: decision.round,
				accept: true,
			};
		case "incident":
			return {
				kind: "incident",
				decisionId: decision.id,
				response: incidentResponse(state, decision),
			};
	}
}

function incidentResponse(
	state: GameState,
	decision: Extract<PendingDecision, { kind: "incident" }>,
): "repair" | "reduce_scope" | "disclose" {
	if (
		decision.incident === "quality_safety_scandal" ||
		decision.incident === "data_privacy_incident"
	) {
		return "disclose";
	}
	return state.company.cash >= 120 ? "repair" : "disclose";
}

function chooseAction(state: GameState): ScenarioAction {
	const pausedProduct = state.products.items.find(
		(product) => product.status === "paused",
	);
	if (pausedProduct !== undefined) {
		return { kind: "resume_product", productId: pausedProduct.id };
	}

	const design = chooseModelDesign(state);
	if (design !== undefined) return design;

	const shortage =
		state.compute.trainingDemand + state.compute.servingDemand >
		state.compute.capacity;
	if (shortage && state.company.cash >= 300) return { kind: "buy_compute" };

	const assignment = chooseResearchAssignment(state);
	if (assignment !== undefined) return assignment;

	return { kind: "advance_week" };
}

function chooseModelDesign(
	state: GameState,
): Extract<ScenarioAction, { kind: "design_model" }> | undefined {
	if (
		state.models.items.some(
			(model) => model.status === "designing" || model.status === "training",
		) ||
		!state.teams.items.some((team) => team.activeProjectId === null)
	) {
		return undefined;
	}

	const family = state.meta.era;
	const researchNode = state.research.nodes.find(
		(node) => node.id === MODEL_RESEARCH_NODES[family],
	);
	const alreadyDesigned = state.models.items.some(
		(model) => model.family === family && model.status !== "shelved",
	);
	if (researchNode?.status !== "completed" || alreadyDesigned) return undefined;

	const parent =
		family === "text"
			? undefined
			: state.models.items.find(
					(model) =>
						model.family === (family === "assistant" ? "text" : "assistant") &&
						(model.status === "ready" || model.status === "launched"),
				);
	const foundation = MODEL_FOUNDATIONS[family];
	if (parent === undefined && foundation !== "fresh") return undefined;
	if (state.company.cash < MODEL_DESIGN_COSTS[family]) return undefined;

	return {
		kind: "design_model",
		spec: {
			name: `${family === "text" ? "Text" : family === "assistant" ? "Assistant" : "Fusion"}-Replay-${String(state.models.items.length + 1).padStart(2, "0")}`,
			family,
			foundation,
			...(foundation === "fresh" ? {} : { parentModelId: parent?.id ?? null }),
			tier: "lean",
			dataMix: { ...MODEL_DATA_MIXES[family] },
			emphasis: { capability: 1, reliability: 1, safety: 1, efficiency: 3 },
		},
	};
}

function chooseResearchAssignment(
	state: GameState,
): Extract<ScenarioAction, { kind: "assign_project" }> | undefined {
	const team = state.teams.items.find(
		(candidate) => candidate.activeProjectId === null,
	);
	if (team === undefined || state.company.insight <= 0) return undefined;

	const affordable = selectAvailableProjects(state).filter(
		(project): project is ResearchProject =>
			project.kind === "research" &&
			(state.research.nodes.find((node) => node.id === project.nodeId)
				?.insightCost ?? Number.MAX_SAFE_INTEGER) <= state.company.insight,
	);
	const selected = [...affordable].sort((left, right) => {
		const leftRank = EFFICIENCY_RESEARCH_ORDER.indexOf(
			left.nodeId as (typeof EFFICIENCY_RESEARCH_ORDER)[number],
		);
		const rightRank = EFFICIENCY_RESEARCH_ORDER.indexOf(
			right.nodeId as (typeof EFFICIENCY_RESEARCH_ORDER)[number],
		);
		return (
			(leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
				(rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank) ||
			left.id.localeCompare(right.id)
		);
	})[0];
	if (selected === undefined) return undefined;
	return { kind: "assign_project", teamId: team.id, projectId: selected.id };
}

function applyScenarioAction(
	state: GameState,
	action: ScenarioAction,
): GameState {
	switch (action.kind) {
		case "assign_project":
			return assignProject(state, action.teamId, action.projectId).state;
		case "buy_compute":
			return buyCompute(state).state;
		case "design_model":
			return designModel(state, action.spec).state;
		case "resume_product":
			return applyProductResume(state, action.productId).state;
		case "advance_week":
			return state;
	}
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, canonicalize(child)]),
		);
	}
	return value;
}

// The full invariant walk is intentionally quadratic once report retention is
// saturated. Skip intermediate walks for this 100+ week fixture, then force
// the same complete validation on both canonical endpoints below.
function withoutIntermediateAssertions<T>(run: () => T): T {
	const previous = assertionsEnabled;
	setAssertionsEnabled(false);
	try {
		return run();
	} finally {
		setAssertionsEnabled(previous);
	}
}

describe("long-run command-log replay", () => {
	it("replays a surviving 100+ week public-command run canonically", {
		timeout: 400_000,
	}, () => {
		const live = withoutIntermediateAssertions(() => efficiencyFirstRun(43));
		assertGameState(live, {}, true);

		expect(live.meta.week).toBeGreaterThanOrEqual(101);
		expect(live.terminal.status).toBe("active");
		expect(live.products.items.length).toBeGreaterThan(0);
		expect(live.reports.totalCount).toBeGreaterThan(200);
		const replayed = withoutIntermediateAssertions(() =>
			replayCommandLog(live.commandLog, { expectedState: live }),
		);
		assertGameState(replayed, {}, true);
		expect(
			live.commandLog.some((entry) => entry.kind === "product_resume"),
		).toBe(true);
		expect([...new Set(live.commandLog.map((entry) => entry.kind))]).toEqual(
			expect.arrayContaining([
				"start_run",
				"advance_week",
				"apply_decision",
				"assign_project",
				"design_model",
				"buy_compute",
				"product_resume",
			]),
		);
		expect(canonicalize(replayed)).toEqual(canonicalize(live));
		expect(replayed.reports).toEqual(live.reports);
		expect(replayed.products).toEqual(live.products);
		expect(replayed.decisions).toEqual(live.decisions);
		expect(replayed.queue).toEqual(live.queue);
		expect(replayed.terminal).toEqual(live.terminal);
		expect(replayed.commandLog).toEqual(live.commandLog);
	});

	it("replays the incident decision and product-resume command seam", {
		timeout: 120_000,
	}, () => {
		const live = withoutIntermediateAssertions(() =>
			efficiencyFirstRun(43, 30),
		);
		assertGameState(live, {}, true);
		const resumeIndex = live.commandLog.findIndex(
			(entry) => entry.kind === "product_resume",
		);
		expect(resumeIndex).toBeGreaterThan(0);
		expect(live.decisions.pending).toEqual([]);

		const replayed = withoutIntermediateAssertions(() =>
			replayCommandLog(live.commandLog, { expectedState: live }),
		);
		assertGameState(replayed, {}, true);
		expect(canonicalize(replayed)).toEqual(canonicalize(live));
		expect(replayed.commandLog[resumeIndex]).toEqual(
			live.commandLog[resumeIndex],
		);
		expect(replayed.products).toEqual(live.products);
	});
});
