/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ReportHistory from "./report-history";

describe("report history", () => {
	it("categorizes and describes product-resumed facts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.reports.items = [
			{
				id: "report_001",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "product_resumed",
					productId: "product_001",
					channel: "developer_api",
					week: 4,
				},
			},
		];
		state.queue.reportIds = ["report_001"];

		render(<ReportHistory state={state} />);

		fireEvent.click(screen.getByRole("button", { name: /^product$/ }));

		expect(
			screen.getByText("Product product_001 resumed on developer_api."),
		).toBeTruthy();
		expect(
			screen.getByRole("list", { name: "product report facts" }),
		).toBeTruthy();
	});

	it("names a selected paradigm and its benefit and liability", () => {
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

		render(<ReportHistory state={state} />);

		expect(
			screen.getByText(
				"Scale Maximalism selected — Benefit: +8 model score ceiling; Liability: +2 training Compute.",
			),
		).toBeTruthy();
	});
});
