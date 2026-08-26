import { MAX_TEAMS } from "../components/teams.js";
import { withRecomputedCompute } from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import { assertRunActive } from "../guards.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import type { EngineResult, GameState } from "../state.js";
import { assertSafeInteger, assertString } from "../validation.js";

/** Buy one fixed-size permanent compute capacity block. */
export function buyCompute(state: GameState): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	if (state.company.cash < BALANCE.computePurchaseCost) {
		throw new Error(
			`Insufficient cash for compute purchase cost ${BALANCE.computePurchaseCost}`,
		);
	}

	const capacity = state.compute.capacity + BALANCE.computePurchaseUnits;
	assertSafeInteger(capacity, "Purchased compute capacity");
	const allocation = allocateId(state, "command");
	const nextState: GameState = {
		...allocation.state,
		company: {
			...allocation.state.company,
			cash: allocation.state.company.cash - BALANCE.computePurchaseCost,
		},
		compute: {
			...allocation.state.compute,
			capacity,
		},
		commandLog: [
			...allocation.state.commandLog,
			{
				id: allocation.id,
				kind: "buy_compute",
				week: state.meta.week,
				amount: BALANCE.computePurchaseUnits,
			},
		],
	};
	const recomputedState: GameState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState);
	return { state: recomputedState, facts: [], pending: [] };
}

/**
 * Hire an idle team at the founding salary tier. Names default to stable
 * ordinal names so the command remains deterministic for headless callers.
 */
export function hireTeam(
	state: GameState,
	requestedName?: string,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	if (state.teams.items.length >= MAX_TEAMS) {
		throw new Error(`Cannot hire more than ${MAX_TEAMS} teams`);
	}
	if (state.company.cash < BALANCE.hireTeamCost) {
		throw new Error(
			`Insufficient cash for team hire cost ${BALANCE.hireTeamCost}`,
		);
	}

	const name = requestedName ?? `Team ${state.teams.items.length + 1}`;
	assertString(name, "Hired team name");
	if (name.trim().length === 0) {
		throw new Error("Hired team name must not be empty");
	}

	const teamAllocation = allocateId(state, "team");
	const commandAllocation = allocateId(teamAllocation.state, "command");
	const nextState: GameState = {
		...commandAllocation.state,
		company: {
			...commandAllocation.state.company,
			cash: commandAllocation.state.company.cash - BALANCE.hireTeamCost,
		},
		teams: {
			items: [
				...commandAllocation.state.teams.items.map((team) => ({ ...team })),
				{
					id: teamAllocation.id,
					name,
					activeProjectId: null,
				},
			],
		},
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "hire_team",
				week: state.meta.week,
				name,
			},
		],
	};
	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}
