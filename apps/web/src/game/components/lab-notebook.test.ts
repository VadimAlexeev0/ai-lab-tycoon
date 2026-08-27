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
});
