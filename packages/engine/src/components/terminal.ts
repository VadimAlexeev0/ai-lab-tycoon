import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertInteger,
	assertNonNegativeInteger,
	assertPositiveInteger,
} from "../validation.js";
import type { Fact } from "./reports.js";

export type TerminalStatus = "active" | "lost";
export type TerminalReason = "none" | "cash_depleted" | "trust_collapsed";

const TERMINAL_STATUSES = ["active", "lost"] as const;
const TERMINAL_REASONS = ["none", "cash_depleted", "trust_collapsed"] as const;
const FACT_KINDS: readonly Fact["kind"][] = [
	"resource_changed",
	"project_progressed",
	"project_completed",
	"research_completed",
	"paradigm_selected",
	"model_trained",
	"evaluation_completed",
	"product_launched",
	"product_resumed",
	"revenue",
	"serving_throttled",
	"training_starved",
	"rival_progressed",
	"rival_milestone",
	"funding_resolved",
	"incident_occurred",
	"incident_resolved",
	"milestone_reached",
	"terminal",
];

export type TerminalContributor = {
	kind: Fact["kind"];
	impact: number;
	week: number;
	index: number;
};

export type TerminalState = {
	status: TerminalStatus;
	reason: TerminalReason;
	frontierReached: boolean;
	contributors: TerminalContributor[];
};

export function createTerminalState(): TerminalState {
	return {
		status: "active",
		reason: "none",
		frontierReached: false,
		contributors: [],
	};
}

export function assertTerminalState(
	value: unknown,
): asserts value is TerminalState {
	assertExactObject(
		value,
		["status", "reason", "frontierReached", "contributors"],
		"terminal",
	);
	assertEnum(value.status, TERMINAL_STATUSES, "Terminal status");
	assertEnum(value.reason, TERMINAL_REASONS, "Terminal reason");
	assertBoolean(value.frontierReached, "Terminal frontier reached");
	assertArray(value.contributors, "Terminal contributors");
	const contributors = value.contributors as unknown as TerminalContributor[];
	for (const contributor of contributors) {
		assertExactObject(
			contributor,
			["kind", "impact", "week", "index"],
			"terminal contributor",
		);
		assertEnum(contributor.kind, FACT_KINDS, "Terminal contributor kind");
		assertInteger(contributor.impact, "Terminal contributor impact");
		assertPositiveInteger(contributor.week, "Terminal contributor week");
		assertNonNegativeInteger(contributor.index, "Terminal contributor index");
	}
	if (value.status === "active" && value.reason !== "none") {
		throw new Error("An active run cannot have a terminal reason");
	}
	if (value.status === "lost" && value.reason === "none") {
		throw new Error("A lost run must have a terminal reason");
	}
	if (value.status === "active" && contributors.length !== 0) {
		throw new Error("An active run cannot have terminal contributors");
	}
	if (value.status === "lost" && contributors.length !== 3) {
		throw new Error("A lost run must have exactly three terminal contributors");
	}
	for (let index = 1; index < contributors.length; index += 1) {
		const previous = contributors[index - 1];
		const current = contributors[index];
		if (previous === undefined || current === undefined) continue;
		if (
			Math.abs(previous.impact) < Math.abs(current.impact) ||
			(Math.abs(previous.impact) === Math.abs(current.impact) &&
				previous.index > current.index)
		) {
			throw new Error(
				"Terminal contributors must be deterministically ordered",
			);
		}
	}
}
