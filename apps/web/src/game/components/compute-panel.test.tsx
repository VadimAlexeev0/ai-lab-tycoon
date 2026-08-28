/** @vitest-environment jsdom */

import { buyCompute, startRun } from "@ai-lab-tycoon/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	executeEngineCommand: vi.fn(),
	useRunState: vi.fn(),
}));

vi.mock("@/game/game-state-context", () => ({
	useRunState: mocks.useRunState,
}));

import ComputePanel from "./compute-panel";

describe("ComputePanel purchase action", () => {
	beforeEach(() => {
		mocks.executeEngineCommand.mockReset();
		mocks.executeEngineCommand.mockResolvedValue(true);
		mocks.useRunState.mockReset();
		mocks.useRunState.mockReturnValue({
			actionBusy: false,
			executeEngineCommand: mocks.executeEngineCommand,
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("shows the current demand and invokes the compute command", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.allocated = 4;
		state.compute.trainingDemand = 3;
		state.compute.servingDemand = 2;

		render(<ComputePanel state={state} />);

		expect(screen.getByText("Capacity after purchase: 24 (+12)")).toBeDefined();
		expect(screen.getByText("Training + serving demand: 5")).toBeDefined();
		const button = screen.getByRole("button", { name: /Purchase compute/i });
		expect((button as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(button);

		expect(mocks.executeEngineCommand).toHaveBeenCalledWith(buyCompute);
	});

	it("disables compute purchase when cash is insufficient with an explanation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = 299;

		render(<ComputePanel state={state} />);

		const button = screen.getByRole("button", { name: /Purchase compute/i });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(button.getAttribute("title")).toMatch(/300/);
	});

	it("disables compute purchase while another action is busy", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		mocks.useRunState.mockReturnValue({
			actionBusy: true,
			executeEngineCommand: mocks.executeEngineCommand,
		});

		render(<ComputePanel state={state} />);

		const button = screen.getByRole("button", { name: /Purchase compute/i });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(button.getAttribute("title")).toMatch(/busy|progress/i);
	});
});

it("keeps UI cost constants in sync with engine balance", async () => {
	const { BALANCE } = await import(
		"../../../../../packages/engine/src/data/balance.js"
	);
	expect(300).toBe(BALANCE.computePurchaseCost);
	expect(12).toBe(BALANCE.computePurchaseUnits);
	expect(300).toBe(BALANCE.hireTeamCost);
});
