import { describe, expect, it } from "vitest";

import { allocateId, type CounterKind } from "./ids.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import type { GameState } from "./state.js";

const EXPECTED_FIRST_IDS = {
	team: "team_001",
	project: "project_001",
	model: "model_001",
	product: "product_001",
	rival: "rival_001",
	decision: "decision_001",
	report: "report_001",
	command: "command_002",
} as const satisfies Record<CounterKind, string>;

function allocateInOrder(
	state: GameState,
	kinds: readonly CounterKind[],
): { ids: string[]; state: GameState } {
	let nextState = state;
	const ids: string[] = [];
	for (const kind of kinds) {
		const result = allocateId(nextState, kind);
		nextState = result.state;
		ids.push(result.id);
	}
	return { ids, state: nextState };
}

describe("deterministic per-kind ID allocation", () => {
	it("allocates every supported prefix from its next available counter", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		for (const kind of Object.keys(EXPECTED_FIRST_IDS) as CounterKind[]) {
			const result = allocateId(state, kind);
			expect(result.id).toBe(EXPECTED_FIRST_IDS[kind]);
			expect(result.state.counters[kind]).toBe(state.counters[kind] + 1);
		}
	});

	it("continues command IDs after the initial command log anchor", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const result = allocateId(state, "command");

		expect(result.id).toBe("command_002");
		expect(result.state.counters.command).toBe(3);
	});

	it("reproduces the same IDs and final state for the same allocation order", () => {
		const order: CounterKind[] = [
			"command",
			"model",
			"team",
			"model",
			"report",
			"command",
		];
		const first = allocateInOrder(
			startRun({ companyName: "Acme Labs" }, 42),
			order,
		);
		const second = allocateInOrder(
			startRun({ companyName: "Acme Labs" }, 42),
			order,
		);

		expect(first.ids).toEqual([
			"command_002",
			"model_001",
			"team_001",
			"model_002",
			"report_001",
			"command_003",
		]);
		expect(second).toEqual(first);
		expect(() => assertGameState(first.state)).not.toThrow();
	});

	it("does not shift an unrelated counter", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const baselineModel = allocateId(state, "model");
		const team = allocateId(state, "team");
		const modelAfterTeam = allocateId(team.state, "model");

		expect(baselineModel.id).toBe("model_001");
		expect(modelAfterTeam.id).toBe("model_001");
		expect(modelAfterTeam.state.counters.team).toBe(2);
		expect(modelAfterTeam.state.counters.model).toBe(2);
		expect(modelAfterTeam.state.counters.product).toBe(1);
	});

	it("does not mutate the input state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const before = JSON.parse(JSON.stringify(state)) as GameState;
		const result = allocateId(state, "project");

		expect(state).toEqual(before);
		expect(result.state).not.toBe(state);
		expect(result.state.counters).not.toBe(state.counters);
	});

	it("rejects an unsupported counter kind at runtime", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(() => allocateId(state, "unsupported" as CounterKind)).toThrow(
			/counter|kind/i,
		);
	});
});
