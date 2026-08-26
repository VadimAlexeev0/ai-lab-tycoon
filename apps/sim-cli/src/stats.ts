import { BOT_NAMES, type BotName } from "./bots.js";

export type TerminalReason = "cash_depleted" | "trust_collapsed";
export type FoundationName = "fresh" | "continued" | "distilled";
export type FundingOutcome = "accepted" | "declined";

export type GameResult = {
	index: number;
	seed: number;
	bot: BotName;
	finalWeek: number;
	terminalReason: TerminalReason | null;
	firstLaunchWeek: number | null;
	milestoneWeek: number | null;
	terminalWeek: number | null;
	continuedWeeks: number | null;
	peakComputeShortage: number;
	computeShortageWeeks: number;
	rivalLeadChanges: number;
	rivalLeaderWeeks: Record<string, number>;
	funding: {
		seed: FundingOutcome | null;
		series_a: FundingOutcome | null;
	};
	foundationChoices: Record<FoundationName, number>;
};

export type WeekPercentiles = {
	p10: number | null;
	p50: number | null;
	p90: number | null;
	notReached: number;
};

export type BotSummary = {
	runs: number;
	milestoneReached: number;
	milestoneReachRate: number;
	terminalRuns: number;
	averageFinalWeek: number;
};

export type SimulationSummary = {
	milestone: {
		reached: number;
		reachRate: number;
		continuedAdditionalWeeks: WeekPercentiles;
	};
	lossCauses: Record<TerminalReason | "active_at_horizon", number>;
	weekPercentiles: {
		firstLaunch: WeekPercentiles;
		multimodalMilestone: WeekPercentiles;
		terminal: WeekPercentiles;
	};
	computeShortages: {
		runsWithShortage: number;
		shortageWeeks: number;
		averageShortageWeeks: number;
		peakShortage: WeekPercentiles;
	};
	rivalLeads: {
		leadChanges: number;
		averageLeadChanges: number;
		leaderWeeks: Record<string, number>;
	};
	fundingRounds: Record<
		"seed" | "series_a",
		{
			offered: number;
			accepted: number;
			declined: number;
		}
	>;
	foundationChoices: Record<FoundationName, number>;
	byBot: Record<BotName, BotSummary>;
};

export type SimulationReport = {
	schemaVersion: 1;
	seed: number;
	runs: number;
	maxWeeks: number;
	games: GameResult[];
	summary: SimulationSummary;
};

/** Aggregate deterministic run records into the JSON checkpoint document. */
export function summarizeRuns(
	seed: number,
	runs: number,
	maxWeeks: number,
	games: readonly GameResult[],
): SimulationReport {
	const lossCauses: SimulationSummary["lossCauses"] = {
		cash_depleted: 0,
		trust_collapsed: 0,
		active_at_horizon: 0,
	};
	const foundationChoices: Record<FoundationName, number> = {
		fresh: 0,
		continued: 0,
		distilled: 0,
	};
	const leaderWeeks: Record<string, number> = {};
	const fundingRounds = {
		seed: { offered: 0, accepted: 0, declined: 0 },
		series_a: { offered: 0, accepted: 0, declined: 0 },
	};

	for (const game of games) {
		if (game.terminalReason === null) lossCauses.active_at_horizon += 1;
		else lossCauses[game.terminalReason] += 1;
		for (const foundation of Object.keys(
			foundationChoices,
		) as FoundationName[]) {
			foundationChoices[foundation] += game.foundationChoices[foundation];
		}
		for (const [rivalId, weeks] of Object.entries(game.rivalLeaderWeeks)) {
			leaderWeeks[rivalId] = (leaderWeeks[rivalId] ?? 0) + weeks;
		}
		for (const round of ["seed", "series_a"] as const) {
			const outcome = game.funding[round];
			if (outcome === null) continue;
			fundingRounds[round].offered += 1;
			fundingRounds[round][outcome] += 1;
		}
	}

	const reachedMilestone = games.filter(
		(game) => game.milestoneWeek !== null,
	).length;
	const shortageWeeks = games.reduce(
		(total, game) => total + game.computeShortageWeeks,
		0,
	);
	const leadChanges = games.reduce(
		(total, game) => total + game.rivalLeadChanges,
		0,
	);

	const byBot = {} as Record<BotName, BotSummary>;
	for (const bot of BOT_NAMES) {
		const botGames = games.filter((game) => game.bot === bot);
		const botMilestones = botGames.filter(
			(game) => game.milestoneWeek !== null,
		).length;
		byBot[bot] = {
			runs: botGames.length,
			milestoneReached: botMilestones,
			milestoneReachRate: ratio(botMilestones, botGames.length),
			terminalRuns: botGames.filter((game) => game.terminalReason !== null)
				.length,
			averageFinalWeek: average(botGames.map((game) => game.finalWeek)),
		};
	}

	const summary: SimulationSummary = {
		milestone: {
			reached: reachedMilestone,
			reachRate: ratio(reachedMilestone, games.length),
			continuedAdditionalWeeks: percentileSet(
				games
					.filter((game) => game.continuedWeeks !== null)
					.map((game) => game.continuedWeeks as number),
				games.length - reachedMilestone,
			),
		},
		lossCauses,
		weekPercentiles: {
			firstLaunch: percentileSet(
				games
					.filter((game) => game.firstLaunchWeek !== null)
					.map((game) => game.firstLaunchWeek as number),
				games.length,
			),
			multimodalMilestone: percentileSet(
				games
					.filter((game) => game.milestoneWeek !== null)
					.map((game) => game.milestoneWeek as number),
				games.length - reachedMilestone,
			),
			terminal: percentileSet(
				games
					.filter((game) => game.terminalWeek !== null)
					.map((game) => game.terminalWeek as number),
				games.filter((game) => game.terminalWeek === null).length,
			),
		},
		computeShortages: {
			runsWithShortage: games.filter((game) => game.computeShortageWeeks > 0)
				.length,
			shortageWeeks,
			averageShortageWeeks: average(
				games.map((game) => game.computeShortageWeeks),
			),
			peakShortage: percentileSet(
				games.map((game) => game.peakComputeShortage),
				0,
			),
		},
		rivalLeads: {
			leadChanges,
			averageLeadChanges: average(games.map((game) => game.rivalLeadChanges)),
			leaderWeeks: sortRecordByKey(leaderWeeks),
		},
		fundingRounds,
		foundationChoices,
		byBot,
	};

	return {
		schemaVersion: 1,
		seed,
		runs,
		maxWeeks,
		games: [...games],
		summary,
	};
}

/** Render a stable human-readable table after the JSON line. */
export function renderTable(report: SimulationReport): string {
	const { summary } = report;
	const loss = summary.lossCauses;
	const funding = summary.fundingRounds;
	const foundations = summary.foundationChoices;
	const botLines = BOT_NAMES.map((bot) => {
		const value = summary.byBot[bot];
		return `  ${bot.padEnd(18)} ${value.milestoneReached}/${value.runs} (${formatPercent(value.milestoneReachRate)})`;
	});
	return [
		"",
		"Balance checkpoint",
		"------------------",
		`runs                 ${report.runs} (seed ${report.seed})`,
		`multimodal milestone ${summary.milestone.reached}/${report.runs} (${formatPercent(summary.milestone.reachRate)})`,
		`loss causes          cash=${loss.cash_depleted} trust=${loss.trust_collapsed} active=${loss.active_at_horizon}`,
		`first launch weeks   ${formatPercentiles(summary.weekPercentiles.firstLaunch)}`,
		`milestone weeks      ${formatPercentiles(summary.weekPercentiles.multimodalMilestone)}`,
		`terminal weeks       ${formatPercentiles(summary.weekPercentiles.terminal)}`,
		`compute shortages    runs=${summary.computeShortages.runsWithShortage} peak=${formatPercentiles(summary.computeShortages.peakShortage)}`,
		`rival leads          changes=${summary.rivalLeads.leadChanges} weeks=${formatRecord(summary.rivalLeads.leaderWeeks)}`,
		`funding rounds       seed ${funding.seed.accepted}/${funding.seed.offered}, series_a ${funding.series_a.accepted}/${funding.series_a.offered}`,
		`foundations          fresh=${foundations.fresh} continued=${foundations.continued} distilled=${foundations.distilled}`,
		"milestone reach by bot",
		...botLines,
	].join("\n");
}

function percentileSet(
	values: readonly number[],
	notReached: number,
): WeekPercentiles {
	const sorted = [...values].sort((left, right) => left - right);
	return {
		p10: percentile(sorted, 0.1),
		p50: percentile(sorted, 0.5),
		p90: percentile(sorted, 0.9),
		notReached,
	};
}

function percentile(
	sorted: readonly number[],
	quantile: number,
): number | null {
	if (sorted.length === 0) return null;
	const index = Math.min(
		sorted.length - 1,
		Math.ceil(quantile * sorted.length) - 1,
	);
	return sorted[index] ?? null;
}

function average(values: readonly number[]): number {
	if (values.length === 0) return 0;
	return round(
		values.reduce((total, value) => total + value, 0) / values.length,
	);
}

function ratio(numerator: number, denominator: number): number {
	return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number): number {
	return Math.round(value * 1_000) / 1_000;
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatPercentiles(values: WeekPercentiles): string {
	return `p10=${values.p10 ?? "-"} p50=${values.p50 ?? "-"} p90=${values.p90 ?? "-"}`;
}

function formatRecord(values: Readonly<Record<string, number>>): string {
	const entries = Object.entries(values);
	return entries.length === 0
		? "none"
		: entries.map(([key, value]) => `${key}:${value}`).join(",");
}

function sortRecordByKey(
	values: Readonly<Record<string, number>>,
): Record<string, number> {
	return Object.fromEntries(
		Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
	);
}
