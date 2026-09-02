import { assertRunActive } from "./guards.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { EngineResult, GameState } from "./state.js";
import { decisionsSystem } from "./systems/decisions.js";
import { fundingSystem } from "./systems/funding.js";
import { incidentsSystem } from "./systems/incidents.js";
import { productsSystem } from "./systems/products.js";
import { projectsSystem } from "./systems/projects.js";
import { reportingSystem } from "./systems/reporting.js";
import { discoverResearchSparks, researchSystem } from "./systems/research.js";
import { rivalsSystem } from "./systems/rivals.js";
import { terminalSystem } from "./systems/terminal.js";
import { trainingSystem } from "./systems/training.js";
import type { RegisteredSystem, SystemPhase } from "./systems/types.js";
import { upkeepSystem } from "./systems/upkeep.js";

export type AdvanceWeekOptions = Readonly<{
	incidentRolls?: readonly number[];
	incidentRoll?: number;
}>;

const DECLARATIONS = {
	upkeep: {
		reads: ["teams.items", "company.cash"],
		writes: ["company.cash", "reports.facts"],
	},
	projects: {
		reads: [
			"research",
			"projects.items",
			"teams.items",
			"models.items",
			"dataInventory.items",
		],
		writes: [
			"projects.items",
			"teams.items",
			"models.items",
			"dataInventory.items",
			"compute.allocated",
		],
	},
	research: {
		reads: [
			"research",
			"teams.items",
			"projects.items",
			"models.items",
			"products.items",
		],
		writes: [
			"research",
			"meta.era",
			"company.insight",
			"projects.items",
			"compute",
		],
	},
	training: {
		reads: [
			"research",
			"projects.items",
			"models.items",
			"compute",
			"dataInventory.items",
		],
		writes: [
			"projects.items",
			"models.items",
			"teams.items",
			"dataInventory.items",
			"compute",
		],
	},
	products: {
		reads: ["products.items", "models.items", "company", "rivals.items"],
		writes: ["products.items", "company", "compute", "decisions"],
	},
	rivals: {
		reads: ["rivals.items", "meta.era"],
		writes: ["rivals.items", "reports.facts"],
	},
	funding: {
		reads: ["funding", "company", "models.items", "products.items"],
		writes: ["funding", "company.cash", "decisions"],
	},
	incidents: {
		reads: ["company", "products.items", "projects.items", "compute"],
		writes: ["company", "rng.incidents", "decisions", "reports.facts"],
	},
	terminal: {
		reads: ["company", "decisions"],
		writes: ["terminal", "reports.facts"],
	},
	decisions: {
		reads: ["decisions.pending"],
		writes: ["decisions.pending", "queue.decisionIds"],
	},
	reporting: {
		reads: ["reports.facts", "decisions.pending"],
		writes: ["reports.items", "queue.reportIds"],
	},
} as const satisfies Record<
	SystemPhase,
	{ reads: readonly string[]; writes: readonly string[] }
>;

export const WEEKLY_SYSTEMS: readonly RegisteredSystem[] = [
	{ phase: "upkeep", system: upkeepSystem, ...DECLARATIONS.upkeep },
	{ phase: "projects", system: projectsSystem, ...DECLARATIONS.projects },
	{ phase: "research", system: researchSystem, ...DECLARATIONS.research },
	{ phase: "training", system: trainingSystem, ...DECLARATIONS.training },
	{ phase: "products", system: productsSystem, ...DECLARATIONS.products },
	{ phase: "rivals", system: rivalsSystem, ...DECLARATIONS.rivals },
	{ phase: "funding", system: fundingSystem, ...DECLARATIONS.funding },
	{ phase: "incidents", system: incidentsSystem, ...DECLARATIONS.incidents },
	{ phase: "terminal", system: terminalSystem, ...DECLARATIONS.terminal },
	{ phase: "decisions", system: decisionsSystem, ...DECLARATIONS.decisions },
	{ phase: "reporting", system: reportingSystem, ...DECLARATIONS.reporting },
];

/** Advance one player-controlled week through the fixed V1 phase order. */
export function advanceWeek(
	state: GameState,
	options: AdvanceWeekOptions = {},
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		throw new Error("Cannot advance week while a blocking decision is pending");
	}

	const week = state.meta.week;
	let nextState = state;
	const facts: import("./components/reports.js").Fact[] = [];
	const pending = state.decisions.pending.map((decision) => ({ ...decision }));

	for (const { phase, system } of WEEKLY_SYSTEMS) {
		if (phase === "reporting") {
			const discovery = discoverResearchSparks(nextState, facts, week);
			nextState = discovery.state;
			facts.push(...discovery.facts);
		}
		const result = system(nextState, {
			phase,
			week,
			facts: [...facts],
			...options,
		});
		nextState = result.state;
		facts.push(...result.facts);
		for (const decision of result.pending) {
			if (!pending.some((existing) => existing.id === decision.id)) {
				pending.push({ ...decision });
			}
		}
		if (nextState.terminal.status === "lost") {
			pending.length = 0;
		}
		nextState = {
			...nextState,
			decisions: { pending: pending.map((decision) => ({ ...decision })) },
			queue: {
				...nextState.queue,
				decisionIds: pending.map((decision) => decision.id),
			},
		};
	}

	const commandAllocation = allocateId(nextState, "command");
	const advanceCommand = {
		id: commandAllocation.id,
		kind: "advance_week" as const,
		week,
		...(options.incidentRolls === undefined
			? {}
			: { incidentRolls: [...options.incidentRolls] }),
		...(options.incidentRoll === undefined
			? {}
			: { incidentRoll: options.incidentRoll }),
	};
	nextState = {
		...commandAllocation.state,
		meta: { ...commandAllocation.state.meta, week: week + 1 },
		commandLog: [...commandAllocation.state.commandLog, advanceCommand],
	};
	assertGameState(
		nextState,
		{
			allowNegativeCash: nextState.company.cash < 0,
		},
		true,
	);
	return { state: nextState, facts, pending };
}

export { appendFactsAsReports, priorityForFact } from "./systems/reporting.js";
