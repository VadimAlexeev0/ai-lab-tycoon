import type { GameState } from "./state.js";

/** Reject every mutating command once the sandbox has reached a terminal loss. */
export function assertRunActive(state: Pick<GameState, "terminal">): void {
	if (state.terminal.status === "lost") {
		throw new Error("Cannot mutate a terminal run");
	}
}
