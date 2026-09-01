import { type GameState, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import {
	buildNotebookTiles,
	countDiscoveredNotebookTiles,
	NOTEBOOK_TILE_COUNT,
} from "./lab-notebook";

describe("lab notebook projections", () => {
	it("always exposes a 4x3 set of slots and only opens recorded facts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const tiles = buildNotebookTiles(state);

		expect(tiles).toHaveLength(NOTEBOOK_TILE_COUNT);
		expect(NOTEBOOK_TILE_COUNT).toBe(12);
		expect(countDiscoveredNotebookTiles(state)).toBe(0);
		expect(tiles.every((tile) => tile.discovered === false)).toBe(true);
	});

	it("finds first events and maps research completions to their real eras", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const textNode = state.research.nodes.find((node) => node.era === "text");
		if (textNode === undefined)
			throw new Error("Expected a text research node");
		state.reports.items = [
			{
				id: "report_002",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "evaluation_completed",
					modelId: "model_001",
					evaluation: "capability",
					coverage: 40,
					week: 6,
				},
			},
			{
				id: "report_001",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "incident_occurred",
					incident: "outage",
					condition: "serving_overload",
					affectedEntity: "product_001",
					metric: "latency",
					measurement: 20,
					threshold: 10,
					severity: 30,
					week: 3,
				},
			},
			{
				id: "report_003",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "research_completed",
					nodeId: textNode.id,
					week: 4,
				},
			},
		] satisfies GameState["reports"]["items"];
		state.queue.reportIds = ["report_001", "report_002", "report_003"];

		const tiles = buildNotebookTiles(state);
		const incident = tiles.find((tile) => tile.id === "first-incident");
		const evaluation = tiles.find((tile) => tile.id === "first-evaluation");
		const textEra = tiles.find((tile) => tile.id === "era-text");

		expect(incident).toMatchObject({ discovered: true, week: 3 });
		expect(evaluation).toMatchObject({ discovered: true, week: 6 });
		expect(textEra).toMatchObject({ discovered: true, week: 4 });
		expect(countDiscoveredNotebookTiles(state)).toBe(5);
	});

	it("gives product-resumed first entries a player-facing annotation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.reports.items = [
			{
				id: "report_001",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "product_resumed",
					productId: "product_001",
					channel: "chat",
					week: 2,
				},
			},
		];

		const firstPage = buildNotebookTiles(state).find(
			(tile) => tile.id === "first-report",
		);

		expect(firstPage).toMatchObject({
			discovered: true,
			annotation: "Week 2 · product_001 resumed on Chat.",
		});
	});

	it("makes research Spark discoveries reachable with their player-facing annotation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.reports.items = [
			{
				id: "report_spark",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "research_spark_discovered",
					sparkId: "inference_optimization",
					nodeId: "inference_price_war",
					discount: 1,
					trigger: "serving_throttled",
					week: 7,
				},
			},
		];
		state.queue.reportIds = ["report_spark"];

		const sparkTile = buildNotebookTiles(state).find(
			(tile) => tile.id === "first-research-spark",
		);

		expect(sparkTile).toMatchObject({
			label: "First research Spark",
			discovered: true,
			week: 7,
			evidence: "research_spark_discovered",
			annotation:
				"Week 7 · Research Spark inference_optimization discounted inference_price_war by 1 Insight.",
		});
	});
});
