// @vitest-environment jsdom

import { startRun } from "@ai-lab-tycoon/engine";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResearchTabs from "./research-tabs";

const state = startRun({ companyName: "Acme Labs" }, 42);

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("research tabs", () => {
	it("switches from Lattice to the semantic List view", async () => {
		render(
			<ResearchTabs
				disabled={false}
				onAssignProject={vi.fn(async () => true)}
				onCloseDetail={vi.fn()}
				onSelectNode={vi.fn()}
				selectedNodeId={undefined}
				state={state}
			/>,
		);

		expect(screen.getByRole("tab", { name: "Lattice" })).not.toBeNull();
		fireEvent.click(screen.getByRole("tab", { name: "List" }));

		await waitFor(() => {
			expect(
				screen.getByRole("list", { name: "Research fallback list" }),
			).not.toBeNull();
		});
	});

	it("shows available research projects and assignment controls in Queue", async () => {
		render(
			<ResearchTabs
				disabled={false}
				onAssignProject={vi.fn(async () => true)}
				onCloseDetail={vi.fn()}
				onSelectNode={vi.fn()}
				selectedNodeId={undefined}
				state={state}
			/>,
		);

		fireEvent.click(screen.getByRole("tab", { name: "Queue" }));

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Ready to assign" }),
			).not.toBeNull();
		});
		expect(
			screen.getAllByRole("button", { name: "Assign research project" }),
		).not.toHaveLength(0);
	});
});
