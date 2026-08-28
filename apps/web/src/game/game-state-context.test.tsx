/** @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getActiveRun: vi.fn(),
	getOrCreateAnonymousSession: vi.fn(),
	persistActiveRun: vi.fn(),
	resetAnonymousSessionBootstrap: vi.fn(),
}));

vi.mock("@/utils/auth-client", () => ({
	getOrCreateAnonymousSession: mocks.getOrCreateAnonymousSession,
	resetAnonymousSessionBootstrap: mocks.resetAnonymousSessionBootstrap,
}));

vi.mock("@/utils/orpc", () => {
	class MockSaveConflictError extends Error {
		storedRun = null;
	}

	return {
		SaveConflictError: MockSaveConflictError,
		client: { gameSave: { getActiveRun: mocks.getActiveRun } },
		persistActiveRun: mocks.persistActiveRun,
	};
});

import { GameStateProvider, useRunState } from "./game-state-context";

function StateProbe() {
	const game = useRunState();
	return (
		<div>
			<output aria-label="session status">{game.session.status}</output>
			<output aria-label="save status">{game.saveState.status}</output>
			<button onClick={game.retrySession} type="button">
				Retry session
			</button>
			<button onClick={game.retryLoad} type="button">
				Retry load
			</button>
		</div>
	);
}

function renderProbe() {
	return render(
		<GameStateProvider>
			<StateProbe />
		</GameStateProvider>,
	);
}

describe("GameStateProvider retry flows", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mocks.getActiveRun.mockReset();
		mocks.getOrCreateAnonymousSession.mockReset();
		mocks.persistActiveRun.mockReset();
		mocks.resetAnonymousSessionBootstrap.mockReset();
	});

	it("retries an anonymous session request and recovers after one failure", async () => {
		mocks.getOrCreateAnonymousSession
			.mockRejectedValueOnce(new Error("session unavailable"))
			.mockResolvedValueOnce({ userId: "user-1" });
		mocks.getActiveRun.mockResolvedValue(null);

		renderProbe();

		await waitFor(() => {
			expect(screen.getByLabelText("session status").textContent).toBe("error");
		});
		fireEvent.click(screen.getByRole("button", { name: "Retry session" }));

		await waitFor(() => {
			expect(screen.getByLabelText("session status").textContent).toBe("ready");
		});
		expect(mocks.getOrCreateAnonymousSession).toHaveBeenCalledTimes(2);
	});

	it("stays on the session error state when the retry also fails", async () => {
		mocks.getOrCreateAnonymousSession
			.mockRejectedValueOnce(new Error("first failure"))
			.mockRejectedValueOnce(new Error("second failure"));

		renderProbe();

		await waitFor(() => {
			expect(screen.getByLabelText("session status").textContent).toBe("error");
		});
		fireEvent.click(screen.getByRole("button", { name: "Retry session" }));

		await waitFor(() => {
			expect(screen.getByLabelText("session status").textContent).toBe("error");
		});
		expect(mocks.getOrCreateAnonymousSession).toHaveBeenCalledTimes(2);
	});

	it("retries a saved-run request and recovers after one failure", async () => {
		mocks.getOrCreateAnonymousSession.mockResolvedValue({ userId: "user-1" });
		mocks.getActiveRun
			.mockRejectedValueOnce(new Error("save unavailable"))
			.mockResolvedValueOnce(null);

		renderProbe();

		await waitFor(() => {
			expect(screen.getByLabelText("save status").textContent).toBe("error");
		});
		fireEvent.click(screen.getByRole("button", { name: "Retry load" }));

		await waitFor(() => {
			expect(screen.getByLabelText("save status").textContent).toBe("empty");
		});
		expect(mocks.getActiveRun).toHaveBeenCalledTimes(2);
	});

	it("stays on the saved-run error state when the retry also fails", async () => {
		mocks.getOrCreateAnonymousSession.mockResolvedValue({ userId: "user-1" });
		mocks.getActiveRun
			.mockRejectedValueOnce(new Error("first failure"))
			.mockRejectedValueOnce(new Error("second failure"));

		renderProbe();

		await waitFor(() => {
			expect(screen.getByLabelText("save status").textContent).toBe("error");
		});
		fireEvent.click(screen.getByRole("button", { name: "Retry load" }));

		await waitFor(() => {
			expect(screen.getByLabelText("save status").textContent).toBe("error");
		});
		expect(mocks.getActiveRun).toHaveBeenCalledTimes(2);
	});
});
