import { describe, expect, it } from "vitest";

import {
	applyCommandInput,
	MAX_COMMAND_NAME_LENGTH,
	MAX_REQUEST_ID_LENGTH,
} from "./game-save-command";

const validStart = {
	requestId: "request-1",
	expectedRevision: 0,
	command: {
		kind: "start_run" as const,
		setup: { companyName: "Test Lab" },
	},
};

describe("applyCommand input contract", () => {
	it("accepts only the bounded command envelope", () => {
		expect(applyCommandInput.parse(validStart)).toEqual(validStart);
	});

	it("accepts a paradigm decision choice", () => {
		const paradigmDecision = {
			requestId: "paradigm-1",
			expectedRevision: 2,
			command: {
				kind: "apply_decision" as const,
				choice: {
					kind: "paradigm" as const,
					decisionId: "decision_001",
					paradigmId: "scale_maximalism" as const,
				},
			},
		};

		expect(applyCommandInput.parse(paradigmDecision)).toEqual(paradigmDecision);
	});

	it("rejects unknown paradigm ids and fields", () => {
		const paradigmCommand = {
			requestId: "paradigm-2",
			expectedRevision: 2,
			command: {
				kind: "apply_decision" as const,
				choice: {
					kind: "paradigm" as const,
					decisionId: "decision_001",
					paradigmId: "scale_maximalism" as const,
				},
			},
		};
		expect(() =>
			applyCommandInput.parse({
				...paradigmCommand,
				command: {
					...paradigmCommand.command,
					choice: {
						...paradigmCommand.command.choice,
						paradigmId: "future_paradigm",
					},
				},
			}),
		).toThrow();
		expect(() =>
			applyCommandInput.parse({
				...paradigmCommand,
				command: {
					...paradigmCommand.command,
					choice: {
						...paradigmCommand.command.choice,
						unexpected: true,
					},
				},
			}),
		).toThrow();
	});

	it("accepts an explicit replacement command but not an implicit start flag", () => {
		const replacement = {
			requestId: "replace-1",
			expectedRevision: 3,
			command: {
				kind: "replace_run" as const,
				setup: { companyName: "Replacement Lab" },
			},
		};
		expect(applyCommandInput.parse(replacement)).toEqual(replacement);
		expect(() =>
			applyCommandInput.parse({
				...validStart,
				command: { ...validStart.command, replace: true },
			}),
		).toThrow();
	});

	it("rejects a full-state or forged-resource payload", () => {
		expect(() =>
			applyCommandInput.parse({
				...validStart,
				cash: 999_999_999,
				research: { forged: true },
				rng: { seed: 42 },
			}),
		).toThrow();
	});

	it("rejects incident rolls on advance_week", () => {
		expect(() =>
			applyCommandInput.parse({
				requestId: "request-2",
				expectedRevision: 1,
				command: { kind: "advance_week", incidentRoll: 0 },
			}),
		).toThrow();
	});

	it("rejects unknown nested command fields", () => {
		expect(() =>
			applyCommandInput.parse({
				...validStart,
				command: {
					kind: "start_run",
					setup: { companyName: "Test Lab", cash: 999_999_999 },
				},
			}),
		).toThrow();
	});

	it("enforces request and free-form string bounds", () => {
		expect(() =>
			applyCommandInput.parse({
				...validStart,
				requestId: "x".repeat(MAX_REQUEST_ID_LENGTH + 1),
			}),
		).toThrow();
		expect(() =>
			applyCommandInput.parse({
				...validStart,
				command: {
					kind: "start_run",
					setup: {
						companyName: "x".repeat(MAX_COMMAND_NAME_LENGTH + 1),
					},
				},
			}),
		).toThrow();
	});
});
