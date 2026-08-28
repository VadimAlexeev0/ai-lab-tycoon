import { describe, expect, it } from "vitest";
import { HEADLINE_TEMPLATES, sampleHeadlines } from "@/game/sample-data";
import { RESEARCH_NODES } from "../../../../packages/engine/src/data/research.js";

describe("headline research-link catalog integrity", () => {
	it("keeps every headline research link inside the research catalog", () => {
		const researchNodeIds = new Set<string>(
			RESEARCH_NODES.map((node) => node.id),
		);
		const sampledHeadlines = sampleHeadlines(0, 0, HEADLINE_TEMPLATES.length);
		const sampledTemplateIds = new Set(
			sampledHeadlines.map((headline) => {
				const prefix = "sample-headline-";
				if (!headline.id.startsWith(prefix)) {
					throw new Error(`Unexpected sample headline id: ${headline.id}`);
				}
				return headline.id.slice(prefix.length).replace(/-\d+$/, "");
			}),
		);

		// One sample per template exercises both the exported links and the
		// legacy fallback map used by sampleHeadlines.
		expect(sampledTemplateIds).toEqual(
			new Set(HEADLINE_TEMPLATES.map((template) => template.id)),
		);

		const configuredNodeIds = HEADLINE_TEMPLATES.flatMap(
			(template) => template.relatedNodeIds ?? [],
		);
		const generatedNodeIds = sampledHeadlines.flatMap(
			(headline) => headline.relatedNodeIds,
		);
		const unknownNodeIds = [
			...new Set([...configuredNodeIds, ...generatedNodeIds]),
		].filter((nodeId) => !researchNodeIds.has(nodeId));

		expect(unknownNodeIds).toEqual([]);
	});
});
