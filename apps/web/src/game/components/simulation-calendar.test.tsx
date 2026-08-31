/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import SimulationCalendar, { buildCalendarEvents } from "./simulation-calendar";

describe("simulation calendar", () => {
	it("greys past weeks and opens context for an in-progress research project", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.week = 3;
		const researchProject = state.projects.items.find(
			(project) => project.kind === "research",
		);
		if (researchProject === undefined) {
			throw new Error("Expected an opening research project");
		}
		researchProject.status = "active";
		researchProject.teamId = state.teams.items[0]?.id ?? null;
		researchProject.progress = 1;
		if (state.teams.items[0] !== undefined) {
			state.teams.items[0].activeProjectId = researchProject.id;
		}

		render(<SimulationCalendar state={state} />);

		const pastWeek = screen
			.getAllByTestId("calendar-week")
			.find((week) => week.getAttribute("data-past") === "true");
		expect(pastWeek).toBeDefined();
		expect(pastWeek?.className).toContain("opacity-60");

		const researchEvent = screen.getByRole("button", {
			name: /research/i,
		});
		expect(researchEvent).toBeDefined();

		fireEvent.click(researchEvent);

		expect(screen.getByRole("dialog")).toBeDefined();
		expect(screen.getByText(researchProject.id)).toBeDefined();
		expect(screen.getByText(/projects\.items/i)).toBeDefined();
	});

	it("places a product-resumed report in the product calendar", () => {
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
					week: 1,
				},
			},
		];
		state.queue.reportIds = ["report_001"];

		const event = buildCalendarEvents(state).find(
			(candidate) => candidate.id === "calendar-report-report_001",
		);

		expect(event).toMatchObject({
			kind: "product",
			status: "recorded",
			title: "Product resumed · Chat",
			summary: expect.stringContaining("resumed"),
			destination: "/game/products",
		});
		expect(event?.sources).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "reports.items", id: "report_001" }),
			]),
		);
	});
});
