// @vitest-environment jsdom

import { startRun } from "@ai-lab-tycoon/engine";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	getResearchStatusVisual,
	default as ResearchTree3D,
	type ResearchTree3DProps,
} from "./research-tree-3d";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderFallback(overrides: Partial<ResearchTree3DProps> = {}) {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	const assignProject = vi.fn(async () => true);

	function Harness() {
		const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
		return (
			<ResearchTree3D
				disabled={false}
				onAssignProject={assignProject}
				onCloseDetail={() => setSelectedNodeId(undefined)}
				onSelectNode={setSelectedNodeId}
				selectedNodeId={selectedNodeId}
				state={state}
				{...overrides}
			/>
		);
	}

	return { ...render(<Harness />), state };
}

describe("research lattice fallback", () => {
	it("renders a semantic era-grouped list when WebGL is unavailable", () => {
		renderFallback();

		expect(
			screen.getByRole("list", { name: "Research fallback list" }),
		).not.toBeNull();
		expect(screen.getByRole("heading", { name: "Text era" })).not.toBeNull();
		expect(
			screen.getByRole("heading", { name: "Assistant era" }),
		).not.toBeNull();
		expect(
			screen.getByRole("heading", { name: "Multimodal era" }),
		).not.toBeNull();
		expect(screen.getByText("Word vectors")).not.toBeNull();
		expect(screen.getAllByText("1 Insight").length).toBeGreaterThan(0);
		expect(screen.getAllByText(/Prerequisites:/).length).toBeGreaterThan(0);
	});

	it("opens the detail dialog and returns focus after Escape", async () => {
		renderFallback();
		const card = screen.getAllByRole("button", {
			name: /Word vectors.*1 Insight/i,
		})[0];
		if (card === undefined) throw new Error("Expected the Word vectors card");

		fireEvent.click(card);
		expect(screen.getByRole("dialog", { name: "Word vectors" })).not.toBeNull();
		expect(
			screen.getByText("No prerequisites — this is an entry node."),
		).not.toBeNull();

		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Word vectors" })).toBeNull();
		});
		expect(document.activeElement).toBe(card);
	});
});

describe("research lattice status map", () => {
	it("keeps every engine status distinguishable without relying on color", () => {
		expect(getResearchStatusVisual("completed")).toMatchObject({
			className: "lattice-status-completed",
			label: "Completed",
		});
		expect(getResearchStatusVisual("available")).toMatchObject({
			className: "lattice-status-available",
			label: "Available",
		});
		expect(getResearchStatusVisual("locked")).toMatchObject({
			className: "lattice-status-locked",
			label: "Locked",
		});
		expect(getResearchStatusVisual("in-progress")).toMatchObject({
			className: "lattice-status-in-progress",
			label: "In progress",
		});
		expect(getResearchStatusVisual("locked-out")).toMatchObject({
			className: "lattice-status-locked-out",
			label: "Path not taken",
		});
	});
});
