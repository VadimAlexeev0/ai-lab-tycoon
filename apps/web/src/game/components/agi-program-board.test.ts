import { type GameState, type Model, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import {
	AGI_PROGRAM_SLOT_COUNT,
	buildAgiProgramSlots,
} from "./agi-program-data";

describe("AGI program projections", () => {
	it("keeps six late-game sockets locked until real V1 evidence exists", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const slots = buildAgiProgramSlots(state);

		expect(slots).toHaveLength(AGI_PROGRAM_SLOT_COUNT);
		expect(slots.map((slot) => slot.requirement)).toEqual([
			"Era IV required",
			"Era IV required",
			"Era V required",
			"Era V required",
			"Era VI required",
			"Era VI required",
		]);
		expect(slots.every((slot) => slot.complete === false)).toBe(true);
	});

	it("lights only sockets whose prerequisite evidence is in the real state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const multimodalNode = state.research.nodes.find(
			(node) => node.era === "multimodal",
		);
		if (multimodalNode === undefined) {
			throw new Error("Expected a multimodal research node");
		}
		const models: Model[] = [
			{
				id: "model_001",
				name: "Atlas",
				foundation: "fresh",
				status: "launched",
				projectId: null,
				family: "multimodal",
			},
			{
				id: "model_002",
				name: "Atlas Distilled",
				foundation: "distilled",
				status: "ready",
				projectId: null,
				family: "multimodal",
				parentModelId: "model_001",
			},
		];
		state.models.items = models;
		state.reports.items = [
			{
				id: "report_001",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "research_completed",
					nodeId: multimodalNode.id,
					week: 14,
				},
			},
			{
				id: "report_002",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "evaluation_completed",
					modelId: "model_001",
					evaluation: "safety_reliability",
					coverage: 70,
					week: 15,
				},
			},
			{
				id: "report_003",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "product_launched",
					productId: "product_001",
					channel: "enterprise",
					week: 16,
				},
			},
			{
				id: "report_004",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "milestone_reached",
					milestone: "first_multimodal_launch",
					week: 17,
				},
			},
		] satisfies GameState["reports"]["items"];

		const slots = buildAgiProgramSlots(state);

		expect(slots.map((slot) => slot.complete)).toEqual([
			true,
			true,
			true,
			true,
			true,
			true,
		]);
		expect(slots[0]?.evidence).toBe(multimodalNode.id);
	});
});
