import { describe, expect, it } from "vitest";

import { HEADLINE_TEMPLATES, sampleHeadlines } from "@/game/sample-data";

const NEW_TEMPLATE_IDS = [
	"rival-scaling-laws",
	"open-weights-release",
	"export-controls-tighten",
	"million-token-context",
	"alignment-recipe",
	"reasoning-token-market",
	"moe-training-window",
	"computer-use-demo",
	"mcp-protocol-adoption",
	"verification-first",
	"chinchilla-recompute",
	"distillation-price-cut",
] as const;

describe("node-linked industry pulse data", () => {
	it("includes a related research node on every new headline template", () => {
		for (const templateId of NEW_TEMPLATE_IDS) {
			const template = HEADLINE_TEMPLATES.find(
				(candidate) => candidate.id === templateId,
			);
			expect(template?.relatedNodeIds?.length).toBeGreaterThan(0);
		}
	});

	it("returns deterministic headlines with node tags for pulse links", () => {
		const rivals = [
			{ id: "rival_001", name: "Northstar Labs", progress: 72 },
			{ id: "rival_002", name: "MarketSpring", progress: 54 },
		] as const;
		const first = sampleHeadlines(42, 72, 12, rivals);
		const second = sampleHeadlines(42, 72, 12, rivals);

		expect(first).toHaveLength(12);
		expect(first.every((headline) => headline.relatedNodeIds.length > 0)).toBe(
			true,
		);
		expect(
			first.every((headline) =>
				headline.relatedNodeIds.every((id) => id.length > 0),
			),
		).toBe(true);
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});
});
