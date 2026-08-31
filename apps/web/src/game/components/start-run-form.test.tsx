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
	applyServerCommand: vi.fn(),
	createRequestId: vi.fn(() => "request-id"),
}));

vi.mock("@/utils/orpc", () => ({
	applyServerCommand: mocks.applyServerCommand,
	createRequestId: mocks.createRequestId,
}));

import { startRun } from "@ai-lab-tycoon/engine";
import StartRunForm from "./start-run-form";

const startedState = startRun({ companyName: "Server Lab" }, 42);
const startedRecord = {
	id: "run-1",
	seed: 42,
	schemaVersion: startedState.meta.schemaVersion,
	state: startedState,
	currentWeek: startedState.meta.week,
	status: "active" as const,
	revision: 1,
};

function fillCompanyName(name: string) {
	fireEvent.change(screen.getByLabelText(/company name/i), {
		target: { value: name },
	});
}

function submitForm() {
	const form = screen.getByLabelText(/company name/i).closest("form");
	if (form === null) throw new Error("Start form was not rendered");
	fireEvent.submit(form);
}

describe("StartRunForm authoritative start commands", () => {
	beforeEach(() => {
		mocks.applyServerCommand.mockReset();
		mocks.createRequestId.mockClear();
		mocks.applyServerCommand.mockResolvedValue(startedRecord);
	});

	afterEach(() => {
		cleanup();
	});

	it("uses plain start_run for an initial run", async () => {
		const onStarted = vi.fn();
		render(<StartRunForm onStarted={onStarted} />);
		fillCompanyName("Initial Lab");
		submitForm();

		await waitFor(() => expect(onStarted).toHaveBeenCalledOnce());
		expect(mocks.applyServerCommand).toHaveBeenCalledWith(
			{ kind: "start_run", setup: { companyName: "Initial Lab" } },
			0,
			"request-id",
		);
	});

	it("sends replace_run only after confirming replacement", async () => {
		const onStarted = vi.fn();
		render(
			<StartRunForm
				existingRevision={7}
				hasExistingRun
				onStarted={onStarted}
			/>,
		);
		fillCompanyName("Replacement Lab");
		submitForm();

		expect(mocks.applyServerCommand).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Replace and start" }));

		await waitFor(() => expect(onStarted).toHaveBeenCalledOnce());
		expect(mocks.applyServerCommand).toHaveBeenCalledWith(
			{ kind: "replace_run", setup: { companyName: "Replacement Lab" } },
			7,
			"request-id",
		);
	});
});
