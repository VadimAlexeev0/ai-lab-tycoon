/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ResearchPanel from "./research-panel";

describe("research paradigm panel", () => {
	afterEach(cleanup);

	it("shows the selected paradigm description, benefit, and liability", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.research.paradigmId = "data_curation_doctrine";

		render(<ResearchPanel state={state} />);

		const card = screen.getByRole("complementary", {
			name: "Selected research paradigm",
		});
		expect(
			within(card).getByRole("heading", {
				name: "Data Curation Doctrine",
			}),
		).toBeTruthy();
		expect(
			within(card).getByText(
				"Make carefully curated data do more of the work, while accepting a lower size-only ceiling.",
			),
		).toBeTruthy();
		expect(within(card).getByText("Benefit")).toBeTruthy();
		expect(within(card).getByText("+20 data quality impact")).toBeTruthy();
		expect(within(card).getByText("Liability")).toBeTruthy();
		expect(within(card).getByText("−4 model score ceiling")).toBeTruthy();
	});

	it("truthfully reports that paradigm selection is pending", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		render(<ResearchPanel state={state} />);

		const card = screen.getByRole("complementary", {
			name: "Selected research paradigm",
		});
		expect(
			within(card).getByRole("heading", { name: "Selection pending" }),
		).toBeTruthy();
		expect(within(card).getByRole("status").textContent).toContain(
			"No text-era research paradigm has been selected yet.",
		);
	});
});
