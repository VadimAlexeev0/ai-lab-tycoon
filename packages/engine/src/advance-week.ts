import type { PendingDecision } from "./components/decisions.js";
import type { Fact, ReportPriority } from "./components/reports.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { EngineResult, GameState } from "./state.js";
import { fundingSystem } from "./systems/funding.js";
import { incidentsSystem } from "./systems/incidents.js";
import { productsSystem } from "./systems/products.js";
import { projectsSystem } from "./systems/projects.js";
import { researchSystem } from "./systems/research.js";
import { rivalsSystem } from "./systems/rivals.js";
import { terminalSystem } from "./systems/terminal.js";
import { trainingSystem } from "./systems/training.js";
import type { GameSystem, SystemPhase } from "./systems/types.js";
import { upkeepSystem } from "./systems/upkeep.js";

export const WEEKLY_SYSTEMS: readonly {
	phase: SystemPhase;
	system: GameSystem;
}[] = [
	{ phase: "upkeep", system: upkeepSystem },
	{ phase: "projects", system: projectsSystem },
	{ phase: "research", system: researchSystem },
	{ phase: "training", system: trainingSystem },
	{ phase: "products", system: productsSystem },
	{ phase: "rivals", system: rivalsSystem },
	{ phase: "funding", system: fundingSystem },
	{ phase: "incidents", system: incidentsSystem },
	{ phase: "terminal", system: terminalSystem },
];

/** Advance one player-controlled week through the fixed V1 phase order. */
export function advanceWeek(state: GameState): EngineResult {
	assertGameState(state);
	if (state.terminal.status === "lost") {
		throw new Error("Cannot advance a terminal run");
	}
	if (state.decisions.pending.some((decision) => decision.blocking)) {
		throw new Error("Cannot advance week while a blocking decision is pending");
	}

	const week = state.meta.week;
	let nextState = state;
	const facts: Fact[] = [];
	const pending: PendingDecision[] = state.decisions.pending.map(
		(decision) => ({
			...decision,
		}),
	);

	for (const { phase, system } of WEEKLY_SYSTEMS) {
		const result = system(nextState, { phase, week });
		nextState = result.state;
		facts.push(...result.facts);
		for (const decision of result.pending) {
			if (!pending.some((existing) => existing.id === decision.id)) {
				pending.push({ ...decision });
			}
		}

		// Upkeep and incidents may create a negative cash balance. Finalize the
		// loss before another phase attempts to validate or spend that state.
		if (nextState.terminal.status === "lost") {
			break;
		}
		if (nextState.company.cash < 0 || nextState.company.trust <= 0) {
			const terminalResult = terminalSystem(nextState, {
				phase: "terminal",
				week,
			});
			nextState = terminalResult.state;
			facts.push(...terminalResult.facts);
			pending.length = 0;
			pending.push(
				...terminalResult.pending.map((decision) => ({ ...decision })),
			);
			break;
		}
	}

	nextState = {
		...nextState,
		decisions: { pending },
		queue: {
			...nextState.queue,
			decisionIds: pending.map((decision) => decision.id),
		},
	};
	nextState = appendFactsAsReports(nextState, facts);

	const commandAllocation = allocateId(nextState, "command");
	nextState = {
		...commandAllocation.state,
		meta: {
			...commandAllocation.state.meta,
			week: week + 1,
		},
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "advance_week",
				week,
			},
		],
	};

	assertGameState(nextState);
	return { state: nextState, facts, pending };
}

export function appendFactsAsReports(
	state: GameState,
	facts: readonly Fact[],
): GameState {
	let nextState = state;
	for (const fact of facts) {
		const allocation = allocateId(nextState, "report");
		nextState = {
			...allocation.state,
			reports: {
				items: [
					...allocation.state.reports.items,
					{
						id: allocation.id,
						priority: priorityForFact(fact),
						fact: { ...fact },
						acknowledged: false,
					},
				],
			},
			queue: {
				...allocation.state.queue,
				reportIds: [...allocation.state.queue.reportIds, allocation.id],
			},
		};
	}
	return nextState;
}

export function priorityForFact(fact: Fact): ReportPriority {
	switch (fact.kind) {
		case "terminal":
		case "incident_occurred":
			return "blocking";
		case "milestone_reached":
		case "model_trained":
		case "evaluation_completed":
		case "product_launched":
		case "rival_milestone":
			return "important";
		default:
			return "informational";
	}
}
