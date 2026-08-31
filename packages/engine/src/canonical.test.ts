import { describe, expect, it } from "vitest";
import { canonicalEqual, canonicalSerialize } from "./canonical.js";
import { startRun } from "./index.js";
import { replayCommandLog } from "./replay.js";
import type { GameState } from "./state.js";

describe("canonical JSON serialization", () => {
	it("sorts object keys recursively while preserving JSON values", () => {
		const first = {
			z: { b: 2, a: 1 },
			a: "stable",
		};
		const second = {
			a: "stable",
			z: { a: 1, b: 2 },
		};

		expect(canonicalSerialize(first)).toBe('{"a":"stable","z":{"a":1,"b":2}}');
		expect(canonicalSerialize(first)).toBe(canonicalSerialize(second));
	});

	it("treats research prerequisites as an unordered state collection", () => {
		const state = startRun({ companyName: "Canonical Labs" }, 42);
		const reordered = JSON.parse(JSON.stringify(state)) as GameState;
		const node = reordered.research.nodes.find(
			(candidate) => candidate.prerequisites.length > 1,
		);
		if (node === undefined) {
			throw new Error("Expected a research node with multiple prerequisites");
		}
		node.prerequisites.reverse();

		expect(canonicalEqual(state, reordered)).toBe(true);
		expect(canonicalSerialize(state)).toBe(canonicalSerialize(reordered));
	});

	it("uses the canonical comparator for replay expectedState", () => {
		const state = startRun({ companyName: "Canonical Labs" }, 42);
		const expectedState = JSON.parse(JSON.stringify(state)) as GameState;
		const node = expectedState.research.nodes.find(
			(candidate) => candidate.prerequisites.length > 1,
		);
		if (node === undefined) {
			throw new Error("Expected a research node with multiple prerequisites");
		}
		node.prerequisites.reverse();

		expect(replayCommandLog(state.commandLog, { expectedState })).toEqual(
			state,
		);
	});

	it("preserves the order of facts, commands, reports, and queue entries", () => {
		const facts = [
			{
				kind: "resource_changed",
				resource: "cash",
				amount: 10,
				week: 1,
			},
			{
				kind: "resource_changed",
				resource: "cash",
				amount: -10,
				week: 2,
			},
		];
		const commands = ["command_001", "command_002"];
		const reports = { items: ["report_001", "report_002"] };
		const queue = {
			decisionIds: ["decision_001", "decision_002"],
			reportIds: ["report_001", "report_002"],
		};

		expect(canonicalEqual({ facts }, { facts: [...facts].reverse() })).toBe(
			false,
		);
		expect(
			canonicalEqual(
				{ commandLog: commands },
				{ commandLog: [...commands].reverse() },
			),
		).toBe(false);
		expect(
			canonicalEqual(
				{ reports },
				{ reports: { items: [...reports.items].reverse() } },
			),
		).toBe(false);
		expect(
			canonicalEqual(
				{ queue },
				{
					queue: {
						decisionIds: [...queue.decisionIds].reverse(),
						reportIds: [...queue.reportIds].reverse(),
					},
				},
			),
		).toBe(false);
	});

	it("detects changed values", () => {
		expect(canonicalEqual({ cash: 100 }, { cash: 101 })).toBe(false);
		expect(canonicalEqual(["report_001"], ["report_002"])).toBe(false);
	});
});
