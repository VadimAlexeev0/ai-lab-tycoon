import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { getResearchTimeline } from "./research-timeline";

describe("research timeline projections", () => {
	it("counts completed nodes in each era and marks the current path", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const firstTextNode = state.research.nodes.find(
			(node) => node.era === "text",
		);
		if (firstTextNode === undefined)
			throw new Error("Expected a Text-era node");
		firstTextNode.status = "completed";

		const timeline = getResearchTimeline(state);
		expect(timeline).toHaveLength(3);
		expect(timeline[0]).toMatchObject({
			completed: 1,
			era: "text",
			isCurrent: true,
			isNext: false,
		});
		expect(timeline[1]).toMatchObject({
			completed: 0,
			era: "assistant",
			isCurrent: false,
			isNext: true,
		});
	});

	it("keeps the final era current without inventing a future tick", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.research.currentEra = "multimodal";

		const timeline = getResearchTimeline(state);
		expect(timeline.at(-1)).toMatchObject({
			era: "multimodal",
			isCurrent: true,
			isNext: false,
		});
	});
});
