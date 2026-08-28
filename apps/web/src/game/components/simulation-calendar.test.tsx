/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import SimulationCalendar from "./simulation-calendar";

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
});
