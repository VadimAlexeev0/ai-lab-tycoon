/** @vitest-environment jsdom */

import { hireTeam, startRun } from "@ai-lab-tycoon/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	executeEngineCommand: vi.fn(),
	useRunState: vi.fn(),
}));

vi.mock("@/game/game-state-context", () => ({
	useRunState: mocks.useRunState,
}));

import TeamPanel from "./team-panel";

describe("TeamPanel hiring action", () => {
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

		expect(mocks.executeEngineCommand).toHaveBeenCalledWith(hireTeam);
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
			executeEngineCommand: mocks.executeEngineCommand,
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
