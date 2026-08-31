import { describe, expect, it } from "vitest";
import { type BotAction, createBot } from "../../../apps/sim-cli/src/bots.js";
import {
	advanceWeek,
	applyDecision,
	applyProductResume,
	assignProject,
	buyCompute,
	designModel,
	hireTeam,
	replayCommandLog,
	startRun,
} from "./index.js";
import type { GameState } from "./state.js";

/**
 * The sim CLI's efficiency-first policy is intentionally used as an
 * end-to-end public-command driver here. It reaches the long-lived product
 * economy, including incident pauses/resumes, instead of looping an idle run
 * until it loses to upkeep.
 */
function efficiencyFirstRun(seed: number): GameState {
	let state = startRun({ companyName: "Replay Labs" }, seed);
	const bot = createBot("efficiency-first", seed);

	for (let step = 0; step < 120; step += 1) {
		if (state.terminal.status === "lost") break;

		let decisionSteps = 0;
		while (state.decisions.pending.length > 0 && decisionSteps < 16) {
			decisionSteps += 1;
			const choice = bot.chooseDecision(state);
			if (choice === null) {
				throw new Error(
					"Efficiency-first policy left a pending decision unresolved",
				);
			}
			state = applyDecision(state, choice).state;
		}
		if (state.decisions.pending.length > 0) {
			throw new Error("Efficiency-first policy exceeded the decision guard");
		}

		state = applyBotAction(state, bot.chooseAction(state));
		state = advanceWeek(state).state;
	}

	return state;
}

function applyBotAction(state: GameState, action: BotAction): GameState {
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

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, canonicalize(child)]),
		);
	}
	return value;
}

describe("long-run command-log replay", () => {
	it("replays a surviving 100+ week public-command run canonically", {
		timeout: 400_000,
	}, () => {
		const live = efficiencyFirstRun(43);

		expect(live.meta.week).toBeGreaterThanOrEqual(101);
		expect(live.terminal.status).toBe("active");
		expect(live.products.items.length).toBeGreaterThan(0);
		expect(live.reports.totalCount).toBeGreaterThan(200);
		const replayed = replayCommandLog(live.commandLog, { expectedState: live });
		expect(
			live.commandLog.some((entry) => entry.kind === "product_resume"),
		).toBe(true);
		expect(canonicalize(replayed)).toEqual(canonicalize(live));
		expect(replayed.reports).toEqual(live.reports);
		expect(replayed.products).toEqual(live.products);
		expect(replayed.decisions).toEqual(live.decisions);
		expect(replayed.queue).toEqual(live.queue);
		expect(replayed.terminal).toEqual(live.terminal);
		expect(replayed.commandLog).toEqual(live.commandLog);
	});
});
