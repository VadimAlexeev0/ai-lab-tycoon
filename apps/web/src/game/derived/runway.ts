import { fundingFactors, type GameState } from "@ai-lab-tycoon/engine";

import { BALANCE } from "../../../../../packages/engine/src/data/balance.js";
import { resolveEntityLabel } from "./labels";

const FUNDING_ROUNDS = ["seed", "series_a"] as const;

export type RunwayWarningCode =
	| "runway_low"
	| "runway_critical"
	| "compute_saturated"
	| "idle_teams"
	| "funding_ready";

export type RunwayWarningSeverity = "info" | "warning" | "critical";

export type RunwayWarning = {
	code: RunwayWarningCode;
	severity: RunwayWarningSeverity;
	message: string;
};

export type RunwaySummary = {
	weeklyBurn: number;
	weeklyRevenue: number;
	netWeeklyBurn: number;
	weeksOfRunway: number | null;
	warnings: RunwayWarning[];
};

/** Calculate the fixed weekly operating cost of the current team. */
export function weeklyBurn(state: GameState): number {
	return (
		BALANCE.upkeep + state.teams.items.length * BALANCE.salaries.foundingTeam
	);
}

/** Average the three most recent retained revenue facts, or zero when empty. */
export function averageRecentRevenue(state: GameState): number {
	const revenueFacts = state.reports.items
		.map((report) => report.fact)
		.filter(
			(fact): fact is Extract<typeof fact, { kind: "revenue" }> =>
				fact.kind === "revenue",
		)
		.sort((left, right) => left.week - right.week)
		.slice(-3);

	if (revenueFacts.length === 0) return 0;
	return (
		revenueFacts.reduce((total, fact) => total + fact.amount, 0) /
		revenueFacts.length
	);
}

/** Derive the current operating runway and its actionable warnings. */
export function deriveRunway(state: GameState): RunwaySummary {
	const burn = weeklyBurn(state);
	const revenue = averageRecentRevenue(state);
	const netBurn = burn - revenue;
	const weeks = netBurn > 0 ? state.company.cash / netBurn : null;

	return {
		weeklyBurn: burn,
		weeklyRevenue: revenue,
		netWeeklyBurn: netBurn,
		weeksOfRunway: weeks,
		warnings: deriveRunwayWarnings(state),
	};
}

/** Build player-facing operational warnings from the live game state. */
export function deriveRunwayWarnings(state: GameState): RunwayWarning[] {
	const warnings: RunwayWarning[] = [];
	const burn = weeklyBurn(state);
	const revenue = averageRecentRevenue(state);
	const netBurn = burn - revenue;
	const weeks = netBurn > 0 ? state.company.cash / netBurn : null;

	if (weeks !== null && weeks <= 2) {
		warnings.push({
			code: "runway_critical",
			severity: "critical",
			message: `Cash covers ${formatWeeks(weeks)} at the current burn rate. Cut costs or secure new capital now.`,
		});
	} else if (weeks !== null && weeks <= 5) {
		warnings.push({
			code: "runway_low",
			severity: "warning",
			message: `Cash covers ${formatWeeks(weeks)} at the current burn rate; plan the next revenue or funding step.`,
		});
	}

	if (state.compute.servingDemand >= state.compute.capacity) {
		warnings.push({
			code: "compute_saturated",
			severity: "warning",
			message: `Serving demand is using all ${state.compute.capacity} compute units; there is no serving headroom.`,
		});
	}

	const idleTeams = state.teams.items.filter(
		(team) => team.activeProjectId === null,
	);
	const availableProject = state.projects.items.find(
		(project) => project.status === "available",
	);
	if (idleTeams.length > 0 && availableProject !== undefined) {
		const teamNames = idleTeams.map((team) => team.name).join(", ");
		const projectName = resolveEntityLabel(
			state,
			"project",
			availableProject.id,
		);
		warnings.push({
			code: "idle_teams",
			severity: "info",
			message: `${teamNames} ${idleTeams.length === 1 ? "is" : "are"} idle while ${projectName} is available.`,
		});
	}

	const readyRounds = FUNDING_ROUNDS.filter((round) =>
		meetsFundingThresholds(state, round),
	);
	if (readyRounds.length > 0) {
		warnings.push({
			code: "funding_ready",
			severity: "info",
			message: `${readyRounds.map(fundingRoundLabel).join(" and ")} funding criteria are met.`,
		});
	}

	return warnings;
}

function meetsFundingThresholds(
	state: GameState,
	round: (typeof FUNDING_ROUNDS)[number],
): boolean {
	const factors = fundingFactors(state);
	const thresholds = BALANCE.funding[round];
	return (
		factors.hype >= thresholds.minimumHype &&
		factors.trust >= thresholds.minimumTrust &&
		factors.modelScore >= thresholds.minimumModelScore &&
		factors.operatingProducts >= thresholds.minimumProducts &&
		factors.cumulativeRevenue >= thresholds.minimumRevenue
	);
}

function fundingRoundLabel(round: (typeof FUNDING_ROUNDS)[number]): string {
	return round === "series_a" ? "Series A" : "Seed";
}

function formatWeeks(weeks: number): string {
	return `${weeks.toFixed(1)} weeks`;
}
