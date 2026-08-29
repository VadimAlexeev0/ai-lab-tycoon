/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	executeEngineCommand: vi.fn(),
	useRunState: vi.fn(),
}));

vi.mock("@/game/game-state-context", () => ({
	useRunState: mocks.useRunState,
}));

import { buyCompute } from "@ai-lab-tycoon/engine";

import ComputeRoute from "@/game/components/compute-route";

function configureRun(state: ReturnType<typeof startRun>, actionBusy = false) {
	mocks.executeEngineCommand.mockReset();
	mocks.executeEngineCommand.mockResolvedValue(true);
	mocks.useRunState.mockReset();
	mocks.useRunState.mockReturnValue({
		actionBusy,
		executeEngineCommand: mocks.executeEngineCommand,
		state,
	});
}

describe("ComputeRoute", () => {
	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockImplementation((query: string) => ({
				matches: false,
				media: query,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
			writable: true,
		});
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			() => null,
		);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("renders capacity, demand split, and the semantic yard fallback", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.capacity = 24;
		state.compute.allocated = 17;
		state.compute.trainingDemand = 5;
		state.compute.servingDemand = 8;
		state.projects.items.push({
			id: "project_eval_1",
			kind: "evaluation",
			teamId: "team_1",
			status: "active",
			progress: 0,
			duration: 2,
			modelId: "model_1",
			evaluation: "capability",
		});
		configureRun(state);

		render(<ComputeRoute />);

		expect(screen.getByRole("heading", { name: "Compute grid" })).toBeDefined();
		expect(screen.getByText("Capacity")).toBeDefined();
		expect(screen.getByText("24", { selector: "p" })).toBeDefined();
		expect(screen.getByText("17", { selector: "p" })).toBeDefined();
		expect(screen.getByText("7", { selector: "p" })).toBeDefined();
		expect(screen.getByText("Training 5")).toBeDefined();
		expect(screen.getByText("Serving 8")).toBeDefined();
		expect(screen.getByText("Evaluation 2")).toBeDefined();
		expect(
			screen.getByRole("list", { name: "Compute yard fallback" }),
		).toBeDefined();
		expect(screen.getAllByRole("listitem").length).toBe(24);
	});

	it("invokes buyCompute and explains the insufficient-cash guard", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		configureRun(state);

		render(<ComputeRoute />);

		const purchase = screen.getByRole("button", {
			name: "Purchase compute for $300",
		});
		expect((purchase as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(purchase);
		expect(mocks.executeEngineCommand).toHaveBeenCalledWith(buyCompute);

		cleanup();
		state.company.cash = 299;
		configureRun(state);
		render(<ComputeRoute />);

		const disabledPurchase = screen.getByRole("button", {
			name: "Purchase compute for $300",
		});
		expect((disabledPurchase as HTMLButtonElement).disabled).toBe(true);
		expect(disabledPurchase.getAttribute("title")).toMatch(/requires \$300/);
	});

	it("disables compute purchase while another command is busy", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		configureRun(state, true);

		render(<ComputeRoute />);

		const purchase = screen.getByRole("button", {
			name: "Purchase compute for $300",
		});
		expect((purchase as HTMLButtonElement).disabled).toBe(true);
		expect(purchase.getAttribute("title")).toMatch(/progress/);
	});

	it("lists active compute infrastructure projects with progress", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.projects.items.push({
			id: "project_infra_1",
			kind: "infrastructure",
			teamId: "team_1",
			status: "active",
			progress: 2,
			duration: 5,
			target: "compute",
		});
		configureRun(state);

		render(<ComputeRoute />);

		expect(screen.getByText("project_infra_1")).toBeDefined();
		expect(
			screen.getByRole("progressbar", {
				name: "project_infra_1 infrastructure progress 40%",
			}),
		).toBeDefined();
	});

	it("marks serving saturation as growth paused and reports training starvation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.capacity = 12;
		state.compute.allocated = 12;
		state.compute.servingDemand = 12;
		state.reports.items.push(
			{
				id: "report_1",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "training_starved",
					week: 2,
					capacity: 12,
					servingDemand: 12,
					evaluationDemand: 0,
					trainingDemand: 4,
				},
			},
			{
				id: "report_2",
				priority: "important",
				acknowledged: false,
				fact: {
					kind: "training_starved",
					week: 3,
					capacity: 12,
					servingDemand: 12,
					evaluationDemand: 0,
					trainingDemand: 4,
				},
			},
		);
		configureRun(state);

		render(<ComputeRoute />);

		expect(screen.getByText(/growth paused/i)).toBeDefined();
		expect(screen.getByText("2 weeks starved")).toBeDefined();
		expect(screen.getByText("Add capacity or pause growth")).toBeDefined();
	});
});
