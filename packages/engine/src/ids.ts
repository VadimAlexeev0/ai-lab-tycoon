import { assertGameState } from "./invariants.js";
import type { CountersState, GameState } from "./state.js";

const COUNTER_KINDS = [
	"team",
	"project",
	"model",
	"product",
	"rival",
	"decision",
	"report",
	"command",
] as const satisfies readonly (keyof CountersState)[];

export type CounterKind = (typeof COUNTER_KINDS)[number];

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
	return {
		state: {
			...state,
			counters: {
				...state.counters,
				[kind]: nextAvailable + 1,
			},
		},
		id: `${kind}_${String(nextAvailable).padStart(3, "0")}`,
	};
}

function assertCounterKind(value: CounterKind): void {
	if (!COUNTER_KINDS.includes(value)) {
		throw new Error(`Unsupported ID counter kind: ${String(value)}`);
	}
}
