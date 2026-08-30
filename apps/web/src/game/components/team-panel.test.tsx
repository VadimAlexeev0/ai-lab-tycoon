/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	executeCommand: vi.fn(),
	useRunState: vi.fn(),
}));

vi.mock("@/game/game-state-context", () => ({
	useRunState: mocks.useRunState,
}));

import TeamPanel from "./team-panel";

describe("TeamPanel hiring action", () => {
	beforeEach(() => {
		mocks.executeCommand.mockReset();
		mocks.executeCommand.mockResolvedValue(true);
		mocks.useRunState.mockReset();
		mocks.useRunState.mockReturnValue({
			actionBusy: false,
			executeCommand: mocks.executeCommand,
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("shows staffing cost impact and invokes the hiring command", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		render(
			<TeamPanel
				onAssign={() => undefined}
				onCancel={() => undefined}
				state={state}
			/>,
		);

		expect(screen.getByText("1 / 3 teams")).toBeDefined();
		expect(screen.getByText("Weekly salary: $50/wk")).toBeDefined();
		expect(screen.getByText("Hire next team: +1 team · +$50/wk")).toBeDefined();
		const button = screen.getByRole("button", { name: /Hire team/i });
		expect((button as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(button);

		expect(mocks.executeCommand).toHaveBeenCalledWith({
			kind: "hire_team",
		});
	});

	it("disables hiring when cash is insufficient with an explanation", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = 299;

		render(
			<TeamPanel
				onAssign={() => undefined}
				onCancel={() => undefined}
				state={state}
			/>,
		);

		const button = screen.getByRole("button", { name: /Hire team/i });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(button.getAttribute("title")).toMatch(/300/);
	});

	it("disables hiring while another action is busy", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		mocks.useRunState.mockReturnValue({
			actionBusy: true,
			executeCommand: mocks.executeCommand,
		});

		render(
			<TeamPanel
				onAssign={() => undefined}
				onCancel={() => undefined}
				state={state}
			/>,
		);

		const button = screen.getByRole("button", { name: /Hire team/i });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(button.getAttribute("title")).toMatch(/busy|progress/i);
	});
});
