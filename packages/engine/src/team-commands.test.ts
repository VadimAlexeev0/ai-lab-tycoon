import { describe, expect, it } from "vitest";
import { buyCompute, hireTeam } from "./commands/teams.js";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";

describe("team and compute commands", () => {
	it("hires a deterministic second team at the founding salary tier", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		const result = hireTeam(state);

		expect(result.state.teams.items).toEqual([
			{
				id: "team_001",
				name: "Founding Team",
				activeProjectId: null,
			},
			{
				id: "team_002",
				name: "Team 2",
				activeProjectId: null,
			},
		]);
		expect(result.state.company.cash).toBe(
			BALANCE.startingCash - BALANCE.hireTeamCost,
		);
		expect(result.state.commandLog.at(-1)).toMatchObject({
			kind: "hire_team",
			name: "Team 2",
		});
		expect(state.teams.items).toHaveLength(1);
		expect(state.company.cash).toBe(BALANCE.startingCash);
	});

	it("rejects hiring a fourth team and hiring without enough cash", () => {
		let state = startRun({ companyName: "Acme Labs" }, 42);
		state = hireTeam(state).state;
		state = hireTeam(state).state;
		expect(state.teams.items).toHaveLength(3);
		expect(() => hireTeam(state)).toThrow(/three|maximum|team/i);

		const poor = startRun({ companyName: "Acme Labs" }, 42);
		poor.company.cash = BALANCE.hireTeamCost - 1;
		expect(() => hireTeam(poor)).toThrow(/cash|cost/i);
	});

	it("buys fixed permanent compute units and records the purchase", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		const first = buyCompute(state);
		const second = buyCompute(first.state);

		expect(second.state.compute.capacity).toBe(
			BALANCE.startingComputeCapacity + 2 * BALANCE.computePurchaseUnits,
		);
		expect(second.state.company.cash).toBe(
			BALANCE.startingCash - 2 * BALANCE.computePurchaseCost,
		);
		expect(second.state.commandLog.at(-1)).toMatchObject({
			kind: "buy_compute",
			amount: BALANCE.computePurchaseUnits,
		});
		expect(state.compute.capacity).toBe(BALANCE.startingComputeCapacity);
		expect(state.company.cash).toBe(BALANCE.startingCash);
	});

	it("rejects a compute purchase without enough cash", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = BALANCE.computePurchaseCost - 1;

		expect(() => buyCompute(state)).toThrow(/cash|cost/i);
	});
});
