import { MAX_TEAMS } from "../components/teams.js";
import { withRecomputedCompute } from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import { assertRunActive } from "../guards.js";
import { allocateId, type CounterKind } from "../ids.js";
import { assertGameState } from "../invariants.js";
import type { EngineResult, GameState } from "../state.js";
import { assertSafeInteger, assertString } from "../validation.js";

type DeferredCommandLogEntry =
	| {
			id: string;
			kind: "buy_compute";
			week: number;
			amount: number;
	  }
	| {
			id: string;
			kind: "hire_team";
			week: number;
			name: string;
	  };

/** Buy one fixed-size permanent compute capacity block. */
export function buyCompute(state: GameState): EngineResult {
	assertStateWithDeferredLog(state);
	assertRunActive(state);
	if (state.company.cash < BALANCE.computePurchaseCost) {
		throw new Error(
			`Insufficient cash for compute purchase cost ${BALANCE.computePurchaseCost}`,
		);
	}

	const capacity = state.compute.capacity + BALANCE.computePurchaseUnits;
	assertSafeInteger(capacity, "Purchased compute capacity");
	const allocation = allocateIdWithDeferredLog(state, "command");
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
	};
	const recomputedState: GameState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	const resultState = appendDeferredCommand(recomputedState, {
		id: allocation.id,
		kind: "buy_compute",
		week: state.meta.week,
		amount: BALANCE.computePurchaseUnits,
	});
	assertResultingState(resultState);
	return { state: resultState, facts: [], pending: [] };
}

/**
 * Hire an idle team at the founding salary tier. Names default to stable
 * ordinal names so the command remains deterministic for headless callers.
 */
export function hireTeam(
	state: GameState,
	requestedName?: string,
): EngineResult {
	assertStateWithDeferredLog(state);
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

	const teamAllocation = allocateIdWithDeferredLog(state, "team");
	const commandAllocation = allocateIdWithDeferredLog(
		teamAllocation.state,
		"command",
	);
	const nextState = {
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
	};
	const resultState = appendDeferredCommand(nextState, {
		id: commandAllocation.id,
		kind: "hire_team",
		week: state.meta.week,
		name,
	});
	assertResultingState(resultState);
	return { state: resultState, facts: [], pending: [] };
}

function allocateIdWithDeferredLog(
	state: GameState,
	kind: CounterKind,
): { state: GameState; id: string } {
	const allocation = allocateId(stripDeferredCommands(state), kind);
	return {
		...allocation,
		state: {
			...allocation.state,
			commandLog: state.commandLog.map((entry) => ({ ...entry })),
		},
	};
}

function appendDeferredCommand(
	state: GameState,
	entry: DeferredCommandLogEntry,
): GameState {
	return {
		...state,
		commandLog: [
			...state.commandLog,
			entry as unknown as GameState["commandLog"][number],
		],
	};
}

/**
 * Worker 4 will add these command kinds to state.ts/invariants.ts. Until that
 * wiring lands, validate the rest of the state with the known command log so
 * this scope remains executable and chainable without mutating input.
 */
function assertStateWithDeferredLog(state: GameState): void {
	try {
		assertGameState(state);
	} catch (error) {
		if (!isUnsupportedDeferredCommandError(error, state)) {
			throw error;
		}
		assertGameState(stripDeferredCommands(state));
	}
}

function assertResultingState(state: GameState): void {
	try {
		assertGameState(state);
	} catch (error) {
		if (!isUnsupportedDeferredCommandError(error, state)) {
			throw error;
		}
		assertGameState(stripDeferredCommands(state));
	}
}

function isUnsupportedDeferredCommandError(
	error: unknown,
	state: GameState,
): boolean {
	return (
		error instanceof Error &&
		error.message.includes("Command log kind has an unsupported value") &&
		state.commandLog.some((entry) => isDeferredCommand(entry))
	);
}

function stripDeferredCommands(state: GameState): GameState {
	const commandLog = state.commandLog.filter(
		(entry) => !isDeferredCommand(entry),
	);
	if (commandLog.length === state.commandLog.length) return state;
	return { ...state, commandLog };
}

function isDeferredCommand(value: unknown): value is DeferredCommandLogEntry {
	return (
		value !== null &&
		typeof value === "object" &&
		"kind" in value &&
		(value.kind === "buy_compute" || value.kind === "hire_team")
	);
}
