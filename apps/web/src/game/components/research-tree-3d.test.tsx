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
		expect(screen.queryByRole("heading", { name: "Assistant era" })).toBeNull();
		expect(
			screen.queryByRole("heading", { name: "Multimodal era" }),
		).toBeNull();
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

	it("explains the typed engine effect in research detail", () => {
		renderFallback();
		const card = screen.getAllByRole("button", {
			name: /Parallel training.*1 Insight/i,
		})[0];
		if (card === undefined)
			throw new Error("Expected the Parallel Training card");

		fireEvent.click(card);
		expect(screen.getByText("−1 training Compute")).not.toBeNull();
	});

	it("uses truthful copy for completed nodes without direct effects", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.era = "multimodal";
		state.research.currentEra = "multimodal";
		state.research.nodes = state.research.nodes.map((node) =>
			node.id === "long_horizon_autonomy"
				? { ...node, status: "completed" as const }
				: node,
		);
		renderFallback({ state, selectedNodeId: "long_horizon_autonomy" });

		expect(
			screen.getByText(
				"No direct engine modifier; this node is a research milestone.",
			),
		).not.toBeNull();
		expect(
			screen.getByText(
				"This node is complete; it has no direct engine modifier.",
			),
		).not.toBeNull();
	});

	it("defaults to the current era and disables locked future eras", () => {
		renderFallback();

		expect(
			screen.getByRole("button", { name: "Text" }).getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen
				.getByRole("button", { name: "Assistant" })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen
				.getByRole("button", { name: "Multimodal" })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	it("switches to an unlocked era and keeps its prior-era gate as context", async () => {
		const sourceState = startRun({ companyName: "Acme Labs" }, 42);
		const unlockedState = {
			...sourceState,
			research: {
				...sourceState.research,
				nodes: sourceState.research.nodes.map((node) =>
					node.id === "text_models_keystone"
						? { ...node, status: "completed" as const }
						: node,
				),
			},
		};
		renderFallback({ state: unlockedState });

		const assistantButton = screen.getByRole("button", { name: "Assistant" });
		expect(assistantButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(assistantButton);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Assistant era" }),
			).not.toBeNull();
		});
		expect(
			screen.getByRole("button", { name: /Transformer architecture/i })
				.className,
		).toContain("research-lattice-fallback__node--context");
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
