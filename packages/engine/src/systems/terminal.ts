import type { Fact } from "../components/reports.js";
import type { TerminalContributor } from "../components/terminal.js";
import { assertGameState } from "../invariants.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Resolve sandbox loss after the weekly operational phases. */
export const terminalSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: true });
	if (state.terminal.status === "lost") {
		return { state, facts: [], pending: [] };
	}
	const reason =
		state.company.cash <= 0
			? "cash_depleted"
			: state.company.trust <= 0
				? "trust_collapsed"
				: undefined;
	if (reason === undefined) {
		return {
			state,
			facts: [],
			pending: state.decisions.pending.map((decision) => ({ ...decision })),
		};
	}
	if (
		state.decisions.pending.some(
			(decision) => decision.kind === "incident" && decision.blocking,
		)
	) {
		return {
			state,
			facts: [],
			pending: state.decisions.pending.map((decision) => ({ ...decision })),
		};
	}
	const contributors = topContributors(state, context.facts ?? []);
	const nextState: GameState = {
		...state,
		terminal: {
			...state.terminal,
			status: "lost",
			reason,
			contributors,
		},
	};
	const facts: Fact[] = [
		{
			kind: "terminal",
			reason,
			contributors: contributors.map((contributor) => ({ ...contributor })),
			week: context.week,
		},
	];
	assertGameState(nextState);
	return { state: nextState, facts, pending: [] };
};

function topContributors(
	state: GameState,
	currentFacts: readonly Fact[],
): TerminalContributor[] {
	const facts = [
		...state.reports.items.map((report) => report.fact),
		...currentFacts,
	];
	const candidates = facts.map((fact, index) => ({
		kind: fact.kind,
		impact: impactForFact(fact),
		week: fact.week,
		index,
	}));
	candidates.sort(
		(left, right) =>
			Math.abs(right.impact) - Math.abs(left.impact) ||
			left.index - right.index,
	);
	while (candidates.length < 3) {
		candidates.push({
			kind: "resource_changed",
			impact: 0,
			week: state.meta.week,
			index: facts.length + candidates.length,
		});
	}
	return candidates.slice(0, 3);
}

function impactForFact(fact: Fact): number {
	switch (fact.kind) {
		case "resource_changed":
		case "project_progressed":
		case "rival_progressed":
			return fact.amount;
		case "rival_published":
		case "rival_launched":
			return fact.pressure;
		case "revenue":
			return fact.amount;
		case "incident_occurred":
			return fact.severity;
		case "risk_memory_updated":
			return -fact.severity;
		default:
			return 0;
	}
}
