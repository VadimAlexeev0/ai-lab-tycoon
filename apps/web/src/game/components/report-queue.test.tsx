/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
