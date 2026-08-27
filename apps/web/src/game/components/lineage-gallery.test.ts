import { type GameState, type Model, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { buildLineageFamilies, modelFate } from "./lineage-gallery";

describe("model lineage projections", () => {
	it("groups visible models by family and preserves parent connectors", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.models.items = [
			{
				id: "model_001",
				name: "Atlas",
				foundation: "fresh",
				status: "launched",
				projectId: null,
				family: "text",
			},
			{
				id: "model_002",
				name: "Atlas Continued",
				foundation: "continued",
				status: "ready",
				projectId: null,
				family: "text",
				parentModelId: "model_001",
			},
		] satisfies Model[];
		state.models.activeModelId = "model_002";

		const families = buildLineageFamilies(state);

		expect(families).toHaveLength(1);
		expect(families[0]?.models.map((model) => model.name)).toEqual([
			"Atlas",
			"Atlas Continued",
		]);
		expect(families[0]?.connectors).toEqual([
			{
				childId: "model_002",
				childIndex: 1,
				parentId: "model_001",
				parentIndex: 0,
			},
		]);
	});

	it("maps active launched models to flagship without exposing private scores", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const model: Model = {
			id: "model_001",
			name: "Atlas",
			foundation: "fresh",
			status: "launched",
			projectId: null,
		};
		state.models.items = [model];
		state.models.activeModelId = model.id;

		expect(modelFate(model, state)).toBe("FLAGSHIP");
		expect(
			Object.hasOwn(
				buildLineageFamilies(state)[0]?.models[0] ?? {},
				"trueScores",
			),
		).toBe(false);
	});

	it("returns an empty family wall before the first model", () => {
		const state: GameState = startRun({ companyName: "Acme Labs" }, 42);
		expect(buildLineageFamilies(state)).toEqual([]);
	});
});
