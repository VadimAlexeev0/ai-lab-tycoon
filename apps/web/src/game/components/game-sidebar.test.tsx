/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useLocation: vi.fn(),
	useNavigate: vi.fn(),
	useRunState: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	useLocation: mocks.useLocation,
	useNavigate: mocks.useNavigate,
}));

vi.mock("@/game/game-state-context", () => ({
	useRunState: mocks.useRunState,
}));

import { SidebarProvider } from "@ai-lab-tycoon/ui/components/sidebar";

import GameSidebar from "./game-sidebar";

function renderSidebar(pathname = "/game") {
	const state = startRun({ companyName: "Helix Systems" }, 42);
	mocks.useLocation.mockReturnValue({ pathname });
	mocks.useNavigate.mockReturnValue(vi.fn());
	mocks.useRunState.mockReturnValue({
		activeRun: null,
		actionBusy: false,
		deleteRun: vi.fn(),
		executeCommand: vi.fn(),
		session: { status: "ready", session: { userId: "user-1234" } },
		sessionLabel: "ANON / user-1234",
		state,
	});

	return render(
		<SidebarProvider>
			<GameSidebar />
		</SidebarProvider>,
	);
}

describe("GameSidebar", () => {
	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			}),
			writable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders every destination and marks overview as the current page", () => {
		renderSidebar();

		expect(screen.getByText("Destinations")).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Overview" })
				.getAttribute("aria-current"),
		).toBe("page");
		for (const label of [
			"Overview",
			"Calendar",
			"Teams",
			"Compute",
			"Research",
			"Models",
			"Products",
			"Reports",
		]) {
			expect(screen.getByRole("link", { name: label })).toBeTruthy();
		}
	});

	it("shows the notebook discovery badge in the amber archive group", () => {
		renderSidebar("/game/notebook");

		expect(
			screen
				.getByText("Archive")
				.classList.contains("text-[var(--game-amber)]"),
		).toBe(true);
		expect(screen.getByText("0/12")).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Notebook" })
				.getAttribute("aria-current"),
		).toBe("page");
	});
});
