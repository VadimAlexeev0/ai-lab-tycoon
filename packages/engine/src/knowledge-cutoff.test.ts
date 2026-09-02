import { describe, expect, it } from "vitest";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import { acquireData } from "./data-inventory.js";
import * as Engine from "./index.js";
import {
	advanceWeek,
	applyDecision,
	assignProject,
	selectAvailableProjects,
	startRun,
} from "./index.js";
import { assertGameState } from "./invariants.js";
import { designModel, type ModelDesignSpec } from "./model-design.js";
import { replayCommandLog } from "./replay.js";
import type { EngineResult, GameState } from "./state.js";
import { productsSystem } from "./systems/products.js";
import { projectsSystem } from "./systems/projects.js";
import { trainingSystem } from "./systems/training.js";

const SPEC: ModelDesignSpec = {
	name: "Cutoff-1",
	family: "text",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function designableState(): GameState {
	const state = startRun({ companyName: "Cutoff Labs" }, 42);
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) {
		throw new Error("Expected the Text model family unlock");
	}
	familyUnlock.status = "completed";
	return state;
}

describe("knowledge cutoff", () => {
	it("records the newest allocated data week and weighted freshness at training completion", () => {
		const state = designableState();
		const general = state.dataInventory.items.find(
			(record) => record.id === "data_001",
		);
		if (general === undefined) throw new Error("Expected general starter data");
		general.sourceId = "legacy_forum_dump";
		general.quality = 45;
		general.freshness = 20;
		general.rightsRisk = 70;
		general.quantity = 300;
		general.usageRestrictions = ["no_external_release"];

		const designed = designModel(state, SPEC).state;
		const trainingProject = designed.projects.items.at(-1);
		if (trainingProject === undefined || trainingProject.kind !== "training") {
			throw new Error("Expected an active training project");
		}
		trainingProject.duration = 1;
		const before = JSON.stringify(designed);

		const result = trainingSystem(designed, { phase: "training", week: 1 });
		const model = result.state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected the trained model");

		expect(model).toMatchObject({
			knowledgeCutoff: 1,
			knowledgeFreshness: 52,
		});
		expect(JSON.stringify(designed)).toBe(before);
	});

	it("applies bounded aging and stale pressure to live products without mutating the cutoff", () => {
		const liveProductState = (week: number, capacity = 200): GameState => {
			const state = startRun({ companyName: "Market Labs" }, 7);
			const familyUnlock = state.research.nodes.find(
				(node) => node.id === "text_models_principles",
			);
			if (familyUnlock === undefined) {
				throw new Error("Expected the Text model family unlock");
			}
			familyUnlock.status = "completed";
			state.meta.week = week;
			state.models.items = [
				{
					id: "model_001",
					name: "Market-1",
					foundation: "fresh",
					status: "launched",
					projectId: null,
					family: "text",
					tier: "standard",
					scoreCeiling: 88,
					knowledgeCutoff: 1,
					knowledgeFreshness: 100,
					trueScores: {
						capability: 100,
						coding: 100,
						reliability: 100,
						safety: 100,
						efficiency: 100,
						multimodal: 100,
					},
					estimates: {
						capability: { estimate: 100, lower: 80, upper: 100 },
						coding: { estimate: 100, lower: 80, upper: 100 },
						reliability: { estimate: 100, lower: 80, upper: 100 },
						safety: { estimate: 100, lower: 80, upper: 100 },
						efficiency: { estimate: 100, lower: 80, upper: 100 },
						multimodal: { estimate: 100, lower: 80, upper: 100 },
					},
				},
			];
			state.products.items = [
				{
					id: "product_001",
					channel: "chat",
					modelId: "model_001",
					status: "operating",
					users: 100,
					lastRevenue: 0,
					cumulativeRevenue: 0,
					servingDemand: 100,
					effectiveQuality: 100,
				},
			];
			state.compute.capacity = capacity;
			state.compute = withRecomputedCompute(state);
			return state;
		};

		const fresh = productsSystem(liveProductState(1), {
			phase: "products",
			week: 1,
		});
		const aging = productsSystem(
			liveProductState(1 + BALANCE.knowledgeCutoff.freshThroughWeeks + 1),
			{
				phase: "products",
				week: 1 + BALANCE.knowledgeCutoff.freshThroughWeeks + 1,
			},
		);
		const stale = productsSystem(
			liveProductState(1 + BALANCE.knowledgeCutoff.staleAfterWeeks),
			{ phase: "products", week: 1 + BALANCE.knowledgeCutoff.staleAfterWeeks },
		);
		const freshProduct = fresh.state.products.items[0];
		const agingProduct = aging.state.products.items[0];
		const staleProduct = stale.state.products.items[0];
		if (
			freshProduct === undefined ||
			agingProduct === undefined ||
			staleProduct === undefined
		) {
			throw new Error("Expected the live product");
		}

		expect(agingProduct.servingDemand).toBeLessThan(
			freshProduct.servingDemand ?? 0,
		);
		expect(staleProduct.servingDemand).toBeLessThan(
			agingProduct.servingDemand ?? 0,
		);
		expect(agingProduct.effectiveQuality).toBeLessThan(
			freshProduct.effectiveQuality ?? 0,
		);
		expect(staleProduct.effectiveQuality).toBeLessThan(
			agingProduct.effectiveQuality ?? 0,
		);
		expect(agingProduct.lastRevenue).toBeLessThan(
			freshProduct.lastRevenue ?? 0,
		);
		expect(staleProduct.lastRevenue).toBeLessThan(
			agingProduct.lastRevenue ?? 0,
		);
		expect(stale.state.models.items[0]).toMatchObject({
			knowledgeCutoff: 1,
			knowledgeFreshness: 100,
		});
		expect(stale.state.terminal.status).toBe("active");
		expect(stale.state.warnings).toContainEqual({
			code: "stale_model",
			severity: "warning",
		});
		expect(stale.facts).toContainEqual(
			expect.objectContaining({
				kind: "model_staleness",
				modelId: "model_001",
				status: "stale",
			}),
		);

		const congestedFresh = productsSystem(liveProductState(1, 12), {
			phase: "products",
			week: 1,
		});
		const congestedAging = productsSystem(
			liveProductState(1 + BALANCE.knowledgeCutoff.freshThroughWeeks + 1, 12),
			{
				phase: "products",
				week: 1 + BALANCE.knowledgeCutoff.freshThroughWeeks + 1,
			},
		);
		const congestedStale = productsSystem(
			liveProductState(1 + BALANCE.knowledgeCutoff.staleAfterWeeks, 12),
			{ phase: "products", week: 1 + BALANCE.knowledgeCutoff.staleAfterWeeks },
		);
		expect(congestedAging.state.products.items[0]?.lastRevenue).toBeLessThan(
			congestedFresh.state.products.items[0]?.lastRevenue ?? 0,
		);
		expect(congestedStale.state.products.items[0]?.lastRevenue).toBeLessThan(
			congestedAging.state.products.items[0]?.lastRevenue ?? 0,
		);
	});

	type RefreshFunction = (
		state: GameState,
		request: {
			modelId: string;
			dataMix: { general: number; code: number; multimodal: number };
		},
	) => EngineResult;

	const invokeRefresh = (state: GameState): EngineResult => {
		const refresh = (Engine as unknown as { refreshModel?: RefreshFunction })
			.refreshModel;
		if (typeof refresh !== "function") {
			throw new Error("refreshModel export missing");
		}
		return refresh(state, {
			modelId: "model_001",
			dataMix: { general: 60, code: 30, multimodal: 10 },
		});
	};

	const trainedState = (): GameState => {
		const designed = designModel(designableState(), SPEC).state;
		const project = designed.projects.items.at(-1);
		if (project === undefined || project.kind !== "training") {
			throw new Error("Expected an active training project");
		}
		project.duration = 1;
		return trainingSystem(designed, { phase: "training", week: 1 }).state;
	};

	it("starts a refresh by reserving fresh data and shared compute immutably", () => {
		const state = trainedState();
		const before = JSON.stringify(state);
		const result = invokeRefresh(state);
		const project = result.state.projects.items.at(-1);
		if (project === undefined || project.kind !== "refresh") {
			throw new Error("Expected an active refresh project");
		}

		expect(project).toMatchObject({
			kind: "refresh",
			modelId: "model_001",
			teamId: "team_001",
			status: "active",
			progress: 0,
			duration: BALANCE.knowledgeCutoff.refreshDuration,
			dataMix: { general: 60, code: 30, multimodal: 10 },
			dataAllocation: [
				{ recordId: "data_001", amount: 60 },
				{ recordId: "data_002", amount: 30 },
				{ recordId: "data_003", amount: 10 },
			],
		});
		expect(result.state.models.items[0]?.projectId).toBe(project.id);
		expect(result.state.compute.trainingDemand).toBe(
			BALANCE.knowledgeCutoff.refreshCompute,
		);
		expect(result.state.compute.allocated).toBe(
			BALANCE.knowledgeCutoff.refreshCompute,
		);
		expect(result.state.commandLog.at(-1)).toEqual({
			id: "command_003",
			kind: "refresh_model",
			week: 1,
			modelId: "model_001",
			projectId: project.id,
			teamId: "team_001",
			dataMix: { general: 60, code: 30, multimodal: 10 },
		});
		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "model_refresh_started",
				modelId: "model_001",
				projectId: project.id,
				dataAmount: 100,
			}),
		);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("completes refresh with a newer batch while preserving model history and debt", () => {
		const state = trainedState();
		const acquired = acquireData(state, { sourceId: "web_corpus" }).state;
		acquired.meta.week = 2;
		const oldGeneral = acquired.dataInventory.items.find(
			(record) => record.id === "data_001",
		);
		if (oldGeneral === undefined) throw new Error("Expected old general data");
		oldGeneral.consumedAmount = oldGeneral.quantity;
		const modelBefore = acquired.models.items[0];
		if (modelBefore === undefined) throw new Error("Expected trained model");
		modelBefore.dataDebt = 37;
		const scoresBefore = JSON.stringify(modelBefore.trueScores);
		const estimatesBefore = JSON.stringify(modelBefore.estimates);
		const started = invokeRefresh(acquired);
		const project = started.state.projects.items.at(-1);
		if (project === undefined || project.kind !== "refresh") {
			throw new Error("Expected an active refresh project");
		}

		const completed = projectsSystem(started.state, {
			phase: "projects",
			week: 2,
		});
		const model = completed.state.models.items[0];
		if (model === undefined) throw new Error("Expected refreshed model");
		const refreshedProject = completed.state.projects.items.at(-1);
		if (refreshedProject === undefined || refreshedProject.kind !== "refresh") {
			throw new Error("Expected the completed refresh project");
		}

		expect(model).toMatchObject({
			knowledgeCutoff: 2,
			knowledgeFreshness: 100,
			dataDebt: 37,
			foundation: "fresh",
			parentModelId: null,
			projectId: null,
		});
		expect(JSON.stringify(model.trueScores)).toBe(scoresBefore);
		expect(JSON.stringify(model.estimates)).toBe(estimatesBefore);
		expect(refreshedProject).toMatchObject({
			status: "completed",
			teamId: null,
			progress: refreshedProject.duration,
		});
		expect(
			completed.state.dataInventory.items.find(
				(record) => record.id === "data_004",
			),
		).toMatchObject({
			consumedAmount: 60,
			reservedAmount: 0,
		});
		expect(completed.state.compute.trainingDemand).toBe(0);
		expect(completed.facts).toContainEqual(
			expect.objectContaining({
				kind: "model_refreshed",
				modelId: "model_001",
				projectId: project.id,
				knowledgeCutoff: 2,
			}),
		);
	});

	it("rejects stale refresh data without consuming it", () => {
		const state = trainedState();
		const general = state.dataInventory.items.find(
			(record) => record.id === "data_001",
		);
		if (general === undefined) throw new Error("Expected general data");
		general.sourceId = "legacy_forum_dump";
		general.quality = 45;
		general.freshness = 20;
		general.rightsRisk = 70;
		general.usageRestrictions = ["no_external_release"];
		const before = JSON.stringify(state);

		expect(() => invokeRefresh(state)).toThrow(/fresh|available|quantity/i);
		expect(JSON.stringify(state)).toBe(before);
	});

	it("rejects malformed, partial, and future knowledge fields", () => {
		const fractional = trainedState();
		const fractionalModel = fractional.models.items[0];
		if (fractionalModel === undefined)
			throw new Error("Expected trained model");
		fractionalModel.knowledgeCutoff = 1.5;
		expect(() => assertGameState(fractional)).toThrow(/integer|cutoff/i);

		const partial = trainedState();
		const partialModel = partial.models.items[0];
		if (partialModel === undefined) throw new Error("Expected trained model");
		delete partialModel.knowledgeFreshness;
		expect(() => assertGameState(partial)).toThrow(
			/together|freshness|cutoff/i,
		);

		const future = trainedState();
		const futureModel = future.models.items[0];
		if (futureModel === undefined) throw new Error("Expected trained model");
		futureModel.knowledgeCutoff = future.meta.week + 1;
		expect(() => assertGameState(future)).toThrow(/future|cutoff/i);
	});

	it("does not auto-refresh a model when the calendar advances", () => {
		const state = trainedState();
		state.meta.week = 1 + BALANCE.knowledgeCutoff.staleAfterWeeks;
		const beforeCommandCount = state.commandLog.length;
		const result = productsSystem(state, {
			phase: "products",
			week: state.meta.week,
		});
		const model = result.state.models.items[0];
		if (model === undefined) throw new Error("Expected trained model");

		expect(model.knowledgeCutoff).toBe(1);
		expect(
			result.state.projects.items.some((project) => project.kind === "refresh"),
		).toBe(false);
		expect(result.state.commandLog).toHaveLength(beforeCommandCount);
	});

	it("replays an explicit refresh command to byte-identical state", () => {
		let state = startRun({ companyName: "Replay Cutoff Labs" }, 13);
		state = advanceWeek(state).state;
		const paradigm = state.decisions.pending.find(
			(decision) => decision.kind === "paradigm",
		);
		if (paradigm === undefined || paradigm.kind !== "paradigm") {
			throw new Error("Expected a paradigm decision");
		}
		const paradigmId = paradigm.choices[0];
		if (paradigmId === undefined) throw new Error("Expected a paradigm choice");
		state = applyDecision(state, {
			kind: "paradigm",
			decisionId: paradigm.id,
			paradigmId,
		}).state;

		const team = state.teams.items[0];
		const principles = selectAvailableProjects(state).find(
			(project) =>
				project.kind === "research" &&
				project.nodeId === "text_models_principles",
		);
		if (team === undefined || principles === undefined) {
			throw new Error("Expected the opening research project");
		}
		state = assignProject(state, team.id, principles.id).state;
		state = advanceWeek(state).state;
		while (state.company.insight < 2) {
			state = advanceWeek(state).state;
		}
		state = designModel(state, SPEC).state;
		for (let index = 0; index < 6; index += 1) {
			if (state.models.items.some((model) => model.status === "ready")) break;
			state = advanceWeek(state).state;
		}
		if (!state.models.items.some((model) => model.status === "ready")) {
			throw new Error("Expected a ready model");
		}
		const refreshed = invokeRefresh(state).state;
		const replayed = replayCommandLog(refreshed.commandLog);

		expect(JSON.stringify(replayed)).toBe(JSON.stringify(refreshed));
	});
});
