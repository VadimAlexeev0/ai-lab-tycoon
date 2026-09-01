/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveEntityLabel } from "@/game/derived/labels";
import ReportQueue from "./report-queue";

describe("report queue", () => {
	it("surfaces product-resumed facts with their important priority", () => {
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
					week: 4,
				},
			},
		];
		state.queue.reportIds = ["report_001"];

		render(<ReportQueue state={state} />);

		expect(
			screen.getByText("Product product_001 resumed on chat."),
		).toBeTruthy();
		expect(screen.getByText("important")).toBeTruthy();
		expect(
			screen.getByText("Important fact · inspect history for detail"),
		).toBeTruthy();
	});

	it("surfaces publication-resolution facts with the node and consequence", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.week = 4;
		state.reports.items = [
			{
				id: "publication_report",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "research_publication_resolved",
					nodeId: "text_infrastructure_compute",
					outcome: "hoard",
					week: 4,
				},
			},
		];
		state.queue.reportIds = ["publication_report"];

		const { container } = render(<ReportQueue state={state} />);

		const nodeLabel = resolveEntityLabel(
			state,
			"node",
			"text_infrastructure_compute",
		);
		expect(
			within(container).getByText(
				`${nodeLabel} kept proprietary — Keeping the lead preserves your advantage, but carries an openness/trust cost.`,
			),
		).toBeTruthy();
		expect(within(container).getByText("important")).toBeTruthy();
	});

	it("surfaces a selected paradigm with its benefit and liability", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.research.paradigmId = "scale_maximalism";
		state.reports.items = [
			{
				id: "paradigm_report",
				priority: "informational",
				acknowledged: false,
				fact: {
					kind: "paradigm_selected",
					paradigmId: "scale_maximalism",
					era: "text",
					week: 2,
				},
			},
		];

		render(<ReportQueue state={state} />);

		expect(
			screen.getByText(
				"Scale Maximalism selected — Benefit: +8 model score ceiling; Liability: +2 training Compute.",
			),
		).toBeTruthy();
	});
});
