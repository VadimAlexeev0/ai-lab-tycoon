// @vitest-environment jsdom

import { startRun } from "@ai-lab-tycoon/engine";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWeekDigest } from "./use-week-digest";

function stateAt(cash: number, week: number) {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.cash = cash;
	state.meta.week = week;
	return state;
}

describe("useWeekDigest", () => {
	it("derives each update from the immediately previous revision", () => {
		const first = stateAt(1_000, 1);
		const second = stateAt(900, 2);
		const third = stateAt(800, 3);
		const { result, rerender } = renderHook(
			({ revision, state }) => useWeekDigest(state, revision),
			{ initialProps: { revision: 1, state: first } },
		);

		expect(result.current.deltas.cash).toBe(0);

		rerender({ revision: 2, state: second });
		expect(result.current.deltas.cash).toBe(-100);

		rerender({ revision: 3, state: third });
		expect(result.current.deltas.cash).toBe(-100);
	});

	it("does not reset the baseline when the week changes without a revision", () => {
		const first = stateAt(1_000, 1);
		const sameRevision = stateAt(900, 2);
		const { result, rerender } = renderHook(
			({ revision, state }) => useWeekDigest(state, revision),
			{ initialProps: { revision: 7, state: first } },
		);

		rerender({ revision: 7, state: sameRevision });
		expect(result.current.deltas.cash).toBe(0);
	});
});
