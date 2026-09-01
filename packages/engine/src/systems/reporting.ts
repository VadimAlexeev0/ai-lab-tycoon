import {
	cloneFact,
	type Fact,
	REPORT_RETENTION_LIMIT,
	type ReportPriority,
} from "../components/reports.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Convert phase facts into stable, priority-partitioned report queue entries. */
export function appendFactsAsReports(
	state: GameState,
	facts: readonly Fact[],
): GameState {
	let nextState = state;
	for (const fact of facts) {
		const allocation = allocateId(nextState, "report");
		const items = [
			...allocation.state.reports.items,
			{
				id: allocation.id,
				priority: priorityForFact(fact),
				fact: cloneFact(fact),
				acknowledged: false,
			},
		].slice(-REPORT_RETENTION_LIMIT);
		const retainedIds = new Set(items.map((report) => report.id));
		nextState = {
			...allocation.state,
			reports: {
				...allocation.state.reports,
				items,
				totalCount: allocation.state.reports.totalCount + 1,
			},
			queue: {
				...allocation.state.queue,
				reportIds: [...allocation.state.queue.reportIds, allocation.id].filter(
					(id) => retainedIds.has(id),
				),
			},
		};
	}

	const retainedIds = new Set(
		nextState.reports.items.map((report) => report.id),
	);
	const reportById = new Map(
		nextState.reports.items.map((report) => [report.id, report]),
	);
	const order = { blocking: 0, important: 1, informational: 2 } as const;
	const reportIds = nextState.queue.reportIds.filter((id) =>
		retainedIds.has(id),
	);
	const originalIndex = new Map(reportIds.map((id, index) => [id, index]));
	reportIds.sort((left, right) => {
		const leftReport = reportById.get(left);
		const rightReport = reportById.get(right);
		if (leftReport === undefined || rightReport === undefined) return 0;
		return (
			order[leftReport.priority] - order[rightReport.priority] ||
			(originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0)
		);
	});
	return { ...nextState, queue: { ...nextState.queue, reportIds } };
}

export const reportingSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	const nextState = appendFactsAsReports(state, context.facts ?? []);
	assertGameState(nextState, { allowNegativeCash: nextState.company.cash < 0 });
	return {
		state: nextState,
		facts: [],
		pending: nextState.decisions.pending.map((decision) => ({ ...decision })),
	};
};

export function priorityForFact(fact: Fact): ReportPriority {
	switch (fact.kind) {
		case "terminal":
		case "incident_occurred":
			return "blocking";
		case "milestone_reached":
		case "paradigm_selected":
		case "research_spark_discovered":
		case "research_publication_resolved":
		case "data_acquired":
		case "data_stale_warning":
		case "synthetic_data_overuse":
		case "model_trained":
		case "evaluation_completed":
		case "product_launched":
		case "product_resumed":
		case "rival_milestone":
		case "incident_resolved":
			return "important";
		default:
			return "informational";
	}
}
