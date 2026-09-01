import { type GameState, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { resolveEntityLabel } from "@/game/derived/labels";
import {
	buildChronicleTimeline,
	getChronicleDeathCertificate,
} from "./chronicle";

describe("company chronicle projections", () => {
	it("groups report facts by quarter and inserts breaks for empty weeks", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.reports.items = [
			{
				id: "report_001",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "research_completed",
					nodeId: "text_foundations",
					week: 2,
				},
			},
			{
				id: "report_002",
				priority: "informational",
				acknowledged: false,
				fact: {
					kind: "product_launched",
					productId: "product_001",
					channel: "chat",
					week: 8,
				},
			},
			{
				id: "report_003",
				priority: "informational",
				acknowledged: false,
				fact: {
					kind: "revenue",
					productId: "product_001",
					channel: "chat",
					amount: 12,
					effectiveQuality: 60,
					week: 15,
				},
			},
			{
				id: "report_004",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "product_resumed",
					productId: "product_001",
					channel: "chat",
					week: 9,
				},
			},
		] satisfies GameState["reports"]["items"];
		state.queue.reportIds = [
			"report_001",
			"report_002",
			"report_003",
			"report_004",
		];

		const quarters = buildChronicleTimeline(state);

		expect(quarters).toHaveLength(2);
		expect(quarters[0]?.quarter).toBe(1);
		expect(quarters[0]?.items[0]).toMatchObject({
			kind: "event",
			marker: "milestone",
			week: 2,
		});
		expect(quarters[1]?.items[0]).toMatchObject({
			kind: "event",
			marker: "record",
			week: 15,
		});
		expect(quarters[0]?.items.some((item) => item.kind === "break")).toBe(true);
		const resumed = quarters
			.flatMap((quarter) => quarter.items)
			.find(
				(item): item is Extract<typeof item, { kind: "event" }> =>
					item.kind === "event" && item.title.includes("resumed"),
			);
		expect(resumed).toMatchObject({
			marker: "milestone",
			title: "Product product_001 resumed",
		});
		expect(resumed?.detail).toMatch(/operating again/);
	});

	it("records selected paradigm identity and tradeoffs in the timeline", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.research.paradigmId = "scale_maximalism";
		state.reports.items = [
			{
				id: "paradigm_report",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "paradigm_selected",
					paradigmId: "scale_maximalism",
					era: "text",
					week: 2,
				},
			},
		];
		state.queue.reportIds = ["paradigm_report"];

		const event = buildChronicleTimeline(state)[0]?.items[0];

		expect(event).toMatchObject({
			kind: "event",
			marker: "milestone",
			title: "Scale Maximalism selected",
			detail:
				"Scale Maximalism selected — Benefit: +8 model score ceiling; Liability: +2 training Compute.",
		});
	});

	it("records publication outcomes with a readable node and tradeoff", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.reports.items = [
			{
				id: "publication_report",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "research_publication_resolved",
					nodeId: "text_infrastructure_compute",
					outcome: "publish",
					week: 4,
				},
			},
		];
		state.queue.reportIds = ["publication_report"];
		const nodeLabel = resolveEntityLabel(
			state,
			"node",
			"text_infrastructure_compute",
		);

		const event = buildChronicleTimeline(state)[0]?.items[0];

		expect(event).toMatchObject({
			kind: "event",
			marker: "milestone",
			title: "Research publication resolved",
			detail: `${nodeLabel} published — Public credit and visibility build trust and hype while active rivals receive a visible clue.`,
		});
	});

	it("falls back to the command log when no reports exist", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		const quarters = buildChronicleTimeline(state);

		expect(quarters[0]?.items[0]).toMatchObject({
			kind: "event",
			week: 1,
		});
		expect(quarters[0]?.items[0]?.kind).toBe("event");
	});

	it("only shows a death certificate for a loss or an explicit preview force", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(getChronicleDeathCertificate(state)).toBeNull();
		expect(getChronicleDeathCertificate(state, true)).toMatchObject({
			preview: true,
		});

		state.terminal.status = "lost";
		state.terminal.reason = "trust_collapsed";
		state.terminal.contributors = [
			{ kind: "incident_occurred", impact: -30, week: 3, index: 0 },
			{ kind: "resource_changed", impact: -20, week: 2, index: 1 },
			{ kind: "revenue", impact: -10, week: 1, index: 2 },
		];
		expect(getChronicleDeathCertificate(state)).toMatchObject({
			cause: "trust_collapsed",
			preview: false,
		});
	});
});
