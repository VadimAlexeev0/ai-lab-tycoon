import { describe, expect, it } from "vitest";
import { advanceWeek, appendFactsAsReports } from "./advance-week.js";
import { canonicalEqual } from "./canonical.js";
import type { Model } from "./components/models.js";
import { assertFact } from "./components/reports.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import {
	assertResearchDefinitions,
	RESEARCH_NODES,
	type ResearchDefinition,
} from "./data/research.js";
import {
	assertGameState,
	deserializeGameState,
	serializeGameState,
	startRun,
} from "./index.js";
import type { GameState } from "./state.js";

function shortageState(): GameState {
	const state = startRun({ companyName: "Spark Lab" }, 42);
	state.research.paradigmId = "scale_maximalism";
	const familyUnlock = state.research.nodes.find(
		(node) => node.id === "text_models_principles",
	);
	if (familyUnlock === undefined) {
		throw new Error("Expected Text model family unlock");
	}
	familyUnlock.status = "completed";

	const model: Model = {
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
			capability: 100,
			coding: 100,
			reliability: 100,
			safety: 100,
			efficiency: 100,
			multimodal: 0,
		},
		estimates: {
			capability: { estimate: 80, lower: 70, upper: 90 },
			coding: { estimate: 80, lower: 70, upper: 90 },
			reliability: { estimate: 80, lower: 70, upper: 90 },
			safety: { estimate: 80, lower: 70, upper: 90 },
			efficiency: { estimate: 80, lower: 70, upper: 90 },
			multimodal: { estimate: 0, lower: 0, upper: 20 },
		},
	};
	state.models.items = [model];
	state.products.items = [
		{
			id: "product_001",
			channel: "chat",
			modelId: model.id,
			status: "operating",
			users: 10,
			lastRevenue: 0,
			cumulativeRevenue: 0,
			servingDemand: 10,
			effectiveQuality: 80,
		},
	];
	state.compute = withRecomputedCompute({
		...state,
		compute: { ...state.compute, capacity: 12 },
	});
	return state;
}

describe("serving-shortage research spark", () => {
	it("discovers Inference Optimization and discounts inference_price_war after a real shortage", () => {
		const state = shortageState();
		const definition = RESEARCH_NODES.find(
			(node) => node.id === "inference_price_war",
		);
		if (definition === undefined)
			throw new Error("Expected inference price war node");

		const result = advanceWeek(state);
		const node = result.state.research.nodes.find(
			(candidate) => candidate.id === definition.id,
		);

		expect(result.facts).toContainEqual(
			expect.objectContaining({
				kind: "serving_throttled",
				productId: "product_001",
				week: 1,
			}),
		);
		expect(result.facts).toContainEqual({
			kind: "research_spark_discovered",
			sparkId: "inference_optimization",
			nodeId: "inference_price_war",
			discount: 1,
			trigger: "serving_throttled",
			week: 1,
		});
		expect(result.state.research.discoveredSparkIds).toEqual([
			"inference_optimization",
		]);
		expect(node?.insightCost).toBe(Math.max(1, definition.insightCost - 1));
		const sparkReports = result.state.reports.items.filter(
			(report) => report.fact.kind === "research_spark_discovered",
		);
		expect(sparkReports).toHaveLength(1);
		expect(sparkReports[0]).toMatchObject({ priority: "important" });
		expect(result.state.queue.reportIds).toContain(sparkReports[0]?.id);
		expect(
			canonicalEqual(
				deserializeGameState(serializeGameState(result.state)),
				result.state,
			),
		).toBe(true);
	});

	it("does not rediscover the same Spark on a subsequent matching shortage tick", () => {
		const first = advanceWeek(shortageState());
		const second = advanceWeek(first.state);

		expect(second.state.research.discoveredSparkIds).toEqual([
			"inference_optimization",
		]);
		expect(
			second.facts.filter((fact) => fact.kind === "research_spark_discovered"),
		).toEqual([]);
		expect(
			second.state.research.nodes.find(
				(node) => node.id === "inference_price_war",
			)?.insightCost,
		).toBe(1);
	});

	it("does not discover from a fake serving_throttled report persisted without a current shortage", () => {
		const state = appendFactsAsReports(
			startRun({ companyName: "Forged Lab" }, 42),
			[
				{
					kind: "serving_throttled",
					productId: "product_001",
					week: 1,
					unmetDemand: 999,
				},
			],
		);

		const result = advanceWeek(state);

		expect(result.state.research.discoveredSparkIds).toEqual([]);
		expect(
			result.facts.some((fact) => fact.kind === "research_spark_discovered"),
		).toBe(false);
		expect(
			result.state.reports.items.some(
				(report) => report.fact.kind === "research_spark_discovered",
			),
		).toBe(false);
	});

	it("validates the exact research Spark fact payload", () => {
		const fact = {
			kind: "research_spark_discovered" as const,
			sparkId: "inference_optimization",
			nodeId: "inference_price_war",
			discount: 1,
			trigger: "serving_throttled" as const,
			week: 1,
		};

		expect(() => assertFact(fact)).not.toThrow();
		for (const key of ["sparkId", "nodeId", "discount", "trigger", "week"]) {
			const missing = { ...fact } as Record<string, unknown>;
			delete missing[key];
			expect(() => assertFact(missing), `missing ${key}`).toThrow(
				/missing|required|unsupported|must be/i,
			);
		}
		expect(() => assertFact({ ...fact, extra: true })).toThrow(/unexpected/i);
		expect(() =>
			assertFact({ ...fact, trigger: "training_starved" } as never),
		).toThrow(/trigger|unsupported/i);
	});

	it("rejects malformed Spark catalog content", () => {
		const source = RESEARCH_NODES.find(
			(node) => "spark" in node && node.spark !== undefined,
		);
		if (
			source === undefined ||
			!("spark" in source) ||
			source.spark === undefined
		) {
			throw new Error("Expected the inference optimization Spark");
		}
		const clone = (): ResearchDefinition[] =>
			RESEARCH_NODES.map((node) => ({
				...node,
				prerequisites: [...node.prerequisites],
			})) as ResearchDefinition[];

		const duplicate = clone();
		duplicate.push({
			...source,
			id: "duplicate_spark_target",
			prerequisites: [...source.prerequisites],
			spark: { ...source.spark },
		});
		expect(() => assertResearchDefinitions(duplicate)).toThrow(
			/duplicate.*spark/i,
		);

		const excessive = clone().map((node) =>
			node.id === source.id && node.spark !== undefined
				? {
						...node,
						spark: {
							...node.spark,
							discount: node.insightCost + 1,
						},
					}
				: node,
		);
		expect(() => assertResearchDefinitions(excessive)).toThrow(
			/discount.*base|exceed/i,
		);

		const unsupported = clone().map((node) =>
			node.id === source.id && node.spark !== undefined
				? {
						...node,
						spark: {
							...node.spark,
							trigger: "training_starved" as never,
						},
					}
				: node,
		);
		expect(() => assertResearchDefinitions(unsupported)).toThrow(
			/trigger|unsupported/i,
		);
	});

	it("rejects unknown, duplicate, and forged discovered Spark state", () => {
		const unknown = startRun({ companyName: "Unknown Spark Lab" }, 42);
		unknown.research.discoveredSparkIds = ["unknown_spark"];
		expect(() => assertGameState(unknown)).toThrow(/unknown.*spark/i);

		const duplicate = startRun({ companyName: "Duplicate Spark Lab" }, 42);
		duplicate.research.discoveredSparkIds = [
			"inference_optimization",
			"inference_optimization",
		];
		expect(() => assertGameState(duplicate)).toThrow(/duplicate.*spark/i);

		const forged = startRun({ companyName: "Forged Cost Lab" }, 42);
		const node = forged.research.nodes.find(
			(candidate) => candidate.id === "inference_price_war",
		);
		if (node === undefined)
			throw new Error("Expected inference price war node");
		node.insightCost = 1;
		expect(() => assertGameState(forged)).toThrow(
			/cost.*catalog|Spark discount/i,
		);
	});
});
