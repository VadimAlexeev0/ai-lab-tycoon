import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { getEraProgress } from "./era-badge";

describe("getEraProgress", () => {
	it("projects current era progress from completed research nodes", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const textNodes = state.research.nodes.filter(
			(node) => node.era === "text",
		);

		expect(getEraProgress(state)).toMatchObject({
			completed: 0,
			era: "text",
			nextEra: "assistant",
			percent: 0,
			total: textNodes.length,
		});

		const firstTextNode = textNodes[0];
		if (firstTextNode === undefined)
			throw new Error("Expected a Text-era node");
		firstTextNode.status = "completed";

		expect(getEraProgress(state)).toMatchObject({
			completed: 1,
			era: "text",
			nextEra: "assistant",
			percent: Math.round((1 / textNodes.length) * 100),
			total: textNodes.length,
		});
	});

	it("marks the final era as the frontier instead of inventing a next era", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.research.currentEra = "multimodal";
		state.meta.era = "multimodal";

		expect(getEraProgress(state)).toMatchObject({
			era: "multimodal",
			nextEra: null,
		});
	});
});
