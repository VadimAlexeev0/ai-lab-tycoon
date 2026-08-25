import { assertGameState } from "./invariants.js";
import type { CountersState, GameState } from "./state.js";
import { assertSafeInteger } from "./validation.js";

const COUNTER_PREFIXES: Record<keyof CountersState, string> = {
	team: "team",
	project: "project",
	model: "model",
	product: "product",
	rival: "rival",
	decision: "decision",
	report: "report",
	command: "command",
};

export type CounterKind = keyof CountersState;

export type AllocateIdResult = {
	state: GameState;
	id: string;
};

export function allocateId(
	state: GameState,
	kind: CounterKind,
): AllocateIdResult {
	assertGameState(state);
	assertCounterKind(kind);

	const nextAvailable = state.counters[kind];
	assertSafeInteger(nextAvailable, `ID counter ${kind}`);
	if (nextAvailable >= Number.MAX_SAFE_INTEGER) {
		throw new Error(
			`ID counter ${kind} must remain strictly below the safe integer limit`,
		);
	}

	return {
		state: {
			...state,
			counters: {
				...state.counters,
				[kind]: nextAvailable + 1,
			},
		},
		id: `${COUNTER_PREFIXES[kind]}_${String(nextAvailable).padStart(3, "0")}`,
	};
}

function assertCounterKind(value: CounterKind): void {
	if (!Object.hasOwn(COUNTER_PREFIXES, value)) {
		throw new Error(`Unsupported ID counter kind: ${String(value)}`);
	}
}
