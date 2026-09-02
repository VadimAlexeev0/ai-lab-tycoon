import { describe, expect, it } from "vitest";

import { RESEARCH_NODES } from "./data/research.js";

type ContentNode = Record<string, unknown> & {
	id: string;
	prerequisites: string[];
};

const nodes = RESEARCH_NODES as readonly unknown[] as readonly ContentNode[];
const nodeById = (id: string): ContentNode => {
	const node = nodes.find((candidate) => candidate.id === id);
	if (node === undefined) throw new Error(`Expected research node ${id}`);
	return node;
};

describe("LLM-history research content", () => {
	it("ships the ten requested content groups across the three engine eras", () => {
		expect(nodes).toHaveLength(49);
		expect(new Set(nodes.map((node) => node.category))).toEqual(
			new Set([
				"foundations",
				"transformer",
				"pretraining_era",
				"scaling_era",
				"giants_era",
				"tree_split",
				"efficiency_school",
				"reasoning_era",
				"multimodal_agents",
				"convergence",
			]),
		);
		expect(
			nodes
				.filter((node) =>
					["foundations", "transformer"].includes(node.category as string),
				)
				.every((node) => node.era === "text"),
		).toBe(true);
		expect(
			nodes
				.filter((node) =>
					[
						"pretraining_era",
						"scaling_era",
						"giants_era",
						"tree_split",
						"efficiency_school",
					].includes(node.category as string),
				)
				.every((node) => node.era === "assistant"),
		).toBe(true);
		expect(
			nodes
				.filter((node) =>
					["reasoning_era", "multimodal_agents", "convergence"].includes(
						node.category as string,
					),
				)
				.every((node) => node.era === "multimodal"),
		).toBe(true);
	});

	it("keeps descriptions concise and insight pacing within the tiered tree budget", () => {
		expect(
			nodes.every(
				(node) =>
					typeof node.description === "string" &&
					(node.description as string).length > 0 &&
					(node.description as string).length < 160,
			),
		).toBe(true);
		expect(new Set(RESEARCH_NODES.map((node) => node.insightCost))).toEqual(
			new Set([1, 2, 4]),
		);
		expect(
			RESEARCH_NODES.reduce((total, node) => total + node.insightCost, 0),
		).toBeGreaterThanOrEqual(70);
		expect(
			RESEARCH_NODES.reduce((total, node) => total + node.insightCost, 0),
		).toBeLessThanOrEqual(80);
	});

	it("makes capability and efficiency schools depend on each other across branches", () => {
		expect(nodeById("chain_of_thought").prerequisites).toEqual(
			expect.arrayContaining(["text_products_evaluation", "rlhf_alignment"]),
		);
		expect(nodeById("sparse_moe").prerequisites).toEqual(
			expect.arrayContaining(["scaling_laws_keystone", "training_stability"]),
		);
		expect(nodeById("computer_use").prerequisites).toEqual(
			expect.arrayContaining(["tool_calling", "vision_encoders"]),
		);
		expect(nodeById("multimodal_models_fusion").prerequisites).toEqual(
			expect.arrayContaining(["computer_use", "inference_price_war"]),
		);
	});

	it("labels the preserved engine keystones with their historical concepts", () => {
		expect(nodeById("text_models_keystone")).toMatchObject({
			label: "Transformer architecture",
		});
		expect(nodeById("assistant_models_keystone")).toMatchObject({
			label: "Proprietary frontier",
		});
		expect(nodeById("multimodal_models_fusion")).toMatchObject({
			label: "Agentic frontier",
		});
	});
});
