import {
	advanceWeek,
	applyDecision,
	applyProductResume,
	assignProject,
	buyCompute,
	designModel,
	type GameState,
	hireTeam,
	replayCommandLog,
	setAssertionsEnabled,
	startRun,
} from "@ai-lab-tycoon/engine";

import { BOT_NAMES, type BotAction, type BotName, createBot } from "./bots.js";
import { type GameResult, renderTable, summarizeRuns } from "./stats.js";

const DEFAULT_RUNS = 10;
const MAX_RUNS = 50;
const DEFAULT_MAX_WEEKS = 120;

type CliOptions = {
	runs: number;
	seed: number;
	maxWeeks: number;
	fast: boolean;
};

function parseArgs(argv: readonly string[]): CliOptions {
	let runs = DEFAULT_RUNS;
	let seed = 42;
	let maxWeeks = DEFAULT_MAX_WEEKS;
	let fast = process.env.SIM_FAST === "1";
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		switch (arg) {
			case "--runs":
			case "--runs=": {
				const value = nextValue(argv, index, "--runs");
				if (value.offset > index) index = value.offset;
				runs = Number.parseInt(value.value, 10);
				break;
			}
			case "--seed": {
				const value = nextValue(argv, index, "--seed");
				if (value.offset > index) index = value.offset;
				seed = Number.parseInt(value.value, 10);
				break;
			}
			case "--max-weeks": {
				const value = nextValue(argv, index, "--max-weeks");
				if (value.offset > index) index = value.offset;
				maxWeeks = Number.parseInt(value.value, 10);
				break;
			}
			case "--fast":
				fast = true;
				break;
			default:
				break;
		}
	}
	if (!Number.isInteger(runs) || runs < 10 || runs > MAX_RUNS) {
		throw new Error(
			`--runs must be an integer in the approved range 10..${MAX_RUNS}`,
		);
	}
	if (!Number.isInteger(seed) || seed < 0) {
		throw new Error("--seed must be a non-negative integer");
	}
	if (!Number.isInteger(maxWeeks) || maxWeeks < 1 || maxWeeks > 10_000) {
		throw new Error("--max-weeks must be a positive integer");
	}
	return { runs, seed, maxWeeks, fast };
}

function nextValue(
	argv: readonly string[],
	index: number,
	flag: string,
): { value: string; offset: number } {
	const arg = argv[index];
	const inline = arg?.includes("=")
		? arg.slice(arg.indexOf("=") + 1)
		: undefined;
	if (inline !== undefined && inline.length > 0) {
		return { value: inline, offset: index };
	}
	const value = argv[index + 1];
	if (value === undefined) {
		throw new Error(`${flag} requires a value`);
	}
	return { value, offset: index + 1 };
}

function playGame(bot: BotName, seed: number, maxWeeks: number): GameResult {
	let state = startRun({ companyName: `${bot}-${seed}` }, seed);
	const controller = createBot(bot, seed);
	const game = newGameResult(bot, seed);

	let firstLaunchWeek: number | null = null;
	let milestoneWeek: number | null = null;
	let terminalWeek: number | null = null;
	let peakComputeShortage = 0;
	let computeShortageWeeks = 0;
	let previousRivalLeader: string | null = null;
	let rivalLeadChanges = 0;
	const rivalLeaderWeeks: Record<string, number> = {};

	for (let week = 0; week < maxWeeks; week += 1) {
		if (state.terminal.status === "lost") {
			terminalWeek = state.meta.week;
			if (
				state.terminal.reason === "cash_depleted" ||
				state.terminal.reason === "trust_collapsed"
			) {
				game.terminalReason = state.terminal.reason;
			}
			break;
		}

		// Resolve every pending decision the bot selects.
		let guard = 0;
		while (state.decisions.pending.length > 0 && guard < 16) {
			guard += 1;
			const choice = controller.chooseDecision(state);
			if (choice === null) break;
			state = applyDecision(state, choice).state;
		}

		// Perform the bot's chosen action.
		const action = controller.chooseAction(state);
		state = applyAction(state, action);

		// Capture launch milestone.
		if (
			firstLaunchWeek === null &&
			state.products.items.some((product) => product.status === "operating")
		) {
			firstLaunchWeek = state.meta.week;
		}

		// Advance a week.
		state = advanceWeek(state).state;
		const currentWeek = state.meta.week;

		// Record milestone.
		if (milestoneWeek === null && state.terminal.frontierReached) {
			milestoneWeek = currentWeek;
		}

		// Compute shortage tracking.
		const shortage = Math.max(
			0,
			state.compute.trainingDemand +
				state.compute.servingDemand -
				state.compute.capacity,
		);
		if (shortage > 0) computeShortageWeeks += 1;
		peakComputeShortage = Math.max(peakComputeShortage, shortage);

		// Rival lead tracking (public progress only).
		const leader = maxRivalLeader(state);
		if (leader !== null) {
			if (previousRivalLeader === null) {
				previousRivalLeader = leader;
			} else if (leader !== previousRivalLeader) {
				rivalLeadChanges += 1;
				previousRivalLeader = leader;
			}
			rivalLeaderWeeks[leader] = (rivalLeaderWeeks[leader] ?? 0) + 1;
		}
	}

	game.finalWeek = state.meta.week;
	game.firstLaunchWeek = firstLaunchWeek;
	game.milestoneWeek = milestoneWeek;
	game.terminalWeek = terminalWeek;
	game.continuedWeeks =
		milestoneWeek === null
			? null
			: Math.max(0, state.meta.week - milestoneWeek);
	game.peakComputeShortage = peakComputeShortage;
	game.computeShortageWeeks = computeShortageWeeks;
	game.rivalLeadChanges = rivalLeadChanges;
	game.rivalLeaderWeeks = rivalLeaderWeeks;
	game.foundationChoices = foundationChoices(state);
	game.funding = fundingOutcomes(state);
	try {
		replayCommandLog(state.commandLog, { expectedState: state });
		game.replayVerified = true;
	} catch (error) {
		game.replayVerified = false;
		process.stderr.write(
			`replay divergence (bot=${bot} seed=${seed}): ${(error as Error).message}\n`,
		);
	}
	return game;
}

function applyAction(state: GameState, action: BotAction): GameState {
	switch (action.kind) {
		case "assign_project":
			return assignProject(state, action.teamId, action.projectId).state;
		case "design_model":
			return designModel(state, action.spec).state;
		case "buy_compute":
			return buyCompute(state).state;
		case "hire_team":
			return hireTeam(state, action.name).state;
		case "resume_product":
			return applyProductResume(state, action.productId).state;
		case "advance_week":
			return state;
	}
}

function newGameResult(bot: BotName, seed: number): GameResult {
	return {
		index: 0,
		seed,
		bot,
		finalWeek: 0,
		terminalReason: null,
		firstLaunchWeek: null,
		milestoneWeek: null,
		terminalWeek: null,
		continuedWeeks: null,
		peakComputeShortage: 0,
		computeShortageWeeks: 0,
		rivalLeadChanges: 0,
		rivalLeaderWeeks: {},
		funding: { seed: null, series_a: null },
		foundationChoices: { fresh: 0, continued: 0, distilled: 0 },
	};
}

function maxRivalLeader(state: GameState): string | null {
	let best: string | null = null;
	let bestProgress = -1;
	for (const rival of state.rivals.items) {
		if (!rival.active) continue;
		if (rival.progress > bestProgress) {
			best = rival.name;
			bestProgress = rival.progress;
		}
	}
	return best;
}

function foundationChoices(state: GameState): GameResult["foundationChoices"] {
	const counts: GameResult["foundationChoices"] = {
		fresh: 0,
		continued: 0,
		distilled: 0,
	};
	for (const model of state.models.items) {
		const foundation = model.foundation;
		if (
			foundation === "fresh" ||
			foundation === "continued" ||
			foundation === "distilled"
		) {
			counts[foundation] += 1;
		}
	}
	return counts;
}

function fundingOutcomes(state: GameState): GameResult["funding"] {
	return {
		seed:
			state.funding.seed.status === "accepted"
				? "accepted"
				: state.funding.seed.status === "declined"
					? "declined"
					: null,
		series_a:
			state.funding.seriesA.status === "accepted"
				? "accepted"
				: state.funding.seriesA.status === "declined"
					? "declined"
					: null,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	setAssertionsEnabled(!options.fast);
	const games: GameResult[] = [];
	const runCount = options.runs;

	let index = 0;
	for (let run = 0; run < runCount; run += 1) {
		for (const bot of BOT_NAMES) {
			index += 1;
			const seed = options.seed + run;
			const game = playGame(bot, seed, options.maxWeeks);
			game.index = index;
			games.push(game);
		}
	}

	const report = summarizeRuns(options.seed, runCount, options.maxWeeks, games);
	const divergent = games.filter(
		(game) => game.replayVerified === false,
	).length;
	process.stdout.write(`mode: ${options.fast ? "fast" : "validated"}\n`);
	process.stdout.write(`${JSON.stringify(report)}\n`);
	process.stdout.write(renderTable(report));

	// Determinism check: re-run the first seed and compare the final state.
	const determinismCheck = determinismOfSeed(options.seed, options.maxWeeks);
	if (!determinismCheck) {
		process.stdout.write("\nDETERMINISM CHECK FAILED\n");
		process.exitCode = 1;
	} else {
		process.stdout.write("\ndeterminism: identical replay for seed re-run\n");
	}
}

function determinismOfSeed(seed: number, maxWeeks: number): boolean {
	const reference = playGame("capability-rusher", seed, maxWeeks);
	const second = playGame("capability-rusher", seed, maxWeeks);
	return (
		reference.finalWeek === second.finalWeek &&
		reference.milestoneWeek === second.milestoneWeek &&
		reference.terminalReason === second.terminalReason &&
		reference.firstLaunchWeek === second.firstLaunchWeek
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
