export type TerminalStatus = "active" | "lost";
export type TerminalReason = "none" | "cash_depleted" | "trust_collapsed";

export type TerminalState = {
	status: TerminalStatus;
	reason: TerminalReason;
	frontierReached: boolean;
};

export function createTerminalState(): TerminalState {
	return {
		status: "active",
		reason: "none",
		frontierReached: false,
	};
}

export function assertTerminalState(state: TerminalState): void {
	if (state.status === "active" && state.reason !== "none") {
		throw new Error("An active run cannot have a terminal reason");
	}
	if (state.status === "lost" && state.reason === "none") {
		throw new Error("A lost run must have a terminal reason");
	}
}
