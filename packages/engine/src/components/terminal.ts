import { assertBoolean, assertEnum, assertExactObject } from "../validation.js";

export type TerminalStatus = "active" | "lost";
export type TerminalReason = "none" | "cash_depleted" | "trust_collapsed";

const TERMINAL_STATUSES = ["active", "lost"] as const;
const TERMINAL_REASONS = ["none", "cash_depleted", "trust_collapsed"] as const;

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

export function assertTerminalState(
	value: unknown,
): asserts value is TerminalState {
	assertExactObject(value, ["status", "reason", "frontierReached"], "terminal");
	assertEnum(value.status, TERMINAL_STATUSES, "Terminal status");
	assertEnum(value.reason, TERMINAL_REASONS, "Terminal reason");
	assertBoolean(value.frontierReached, "Terminal frontier reached");

	if (value.status === "active" && value.reason !== "none") {
		throw new Error("An active run cannot have a terminal reason");
	}
	if (value.status === "lost" && value.reason === "none") {
		throw new Error("A lost run must have a terminal reason");
	}
}
