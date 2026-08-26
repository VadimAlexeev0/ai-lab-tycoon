import {
	type Fact,
	type GameState,
	selectRecentReports,
	type VisibleReport,
} from "@ai-lab-tycoon/engine";
import { History } from "lucide-react";
import { useState } from "react";

export type ReportFilter =
	| "all"
	| "training"
	| "research"
	| "product"
	| "rival"
	| "funding"
	| "incident"
	| "milestone"
	| "terminal";

export type ReportHistoryProps = {
	state: GameState;
	acknowledgedIds?: ReadonlySet<string>;
};

const FILTERS: readonly ReportFilter[] = [
	"all",
	"training",
	"research",
	"product",
	"rival",
	"funding",
	"incident",
	"milestone",
	"terminal",
];

/** Browse the immutable mechanical fact stream by its direct fact category. */
export default function ReportHistory({
	acknowledgedIds = new Set<string>(),
	state,
}: ReportHistoryProps) {
	const [filter, setFilter] = useStateFilter();
	const reports = orderedReports(state);
	const filteredReports = reports.filter((report) => {
		const category = categoryForFact(report.fact);
		return filter === "all" || category === filter;
	});

	return (
		<section aria-label="Report history" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Reports / history
					</p>
					<h3 className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]">
						Trace the fact stream
					</h3>
				</div>
				<History className="size-4 text-primary" aria-hidden="true" />
			</div>
			<nav aria-label="Report history filters" className="flex flex-wrap gap-1">
				{FILTERS.map((candidate) => (
					<button
						aria-pressed={filter === candidate}
						className={
							filter === candidate
								? "border border-primary bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary uppercase tracking-[0.1em]"
								: "border border-border/70 px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em] hover:border-primary/50 hover:text-foreground"
						}
						key={candidate}
						onClick={() => setFilter(candidate)}
						type="button"
					>
						{candidate}
					</button>
				))}
			</nav>

			{filteredReports.length > 0 ? (
				<ul className="space-y-2" aria-label={`${filter} report facts`}>
					{filteredReports.map((report) => (
						<li
							className="border border-border/70 bg-background/35 px-3 py-2"
							key={report.id}
						>
							<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
								<span className="font-mono font-semibold text-[10px] text-foreground uppercase tracking-[0.1em]">
									{report.priority} · {report.id}
								</span>
								<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
									Week {report.fact.week}
								</span>
							</div>
							<p className="mt-1 text-foreground text-xs leading-5">
								{factSummary(report.fact)}
							</p>
							{report.acknowledged || acknowledgedIds.has(report.id) ? (
								<p className="mt-1 font-mono text-[10px] text-[var(--game-positive)] uppercase tracking-[0.1em]">
									Acknowledged in this console
								</p>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className="border border-border/70 bg-background/35 px-3 py-3 text-muted-foreground text-xs">
					No {filter === "all" ? "facts" : `${filter} facts`} in the report
					history.
				</p>
			)}
		</section>
	);
}

function useStateFilter(): [ReportFilter, (filter: ReportFilter) => void] {
	// A tiny local state wrapper keeps the filter state colocated with this
	// history view without introducing a content/advisor abstraction.
	const [filter, setFilter] = useState<ReportFilter>("all");
	return [filter, setFilter];
}

function orderedReports(state: GameState): VisibleReport[] {
	const reports = selectRecentReports(state);
	const byId = new Map(reports.map((report) => [report.id, report]));
	const ordered = state.queue.reportIds
		.map((id) => byId.get(id))
		.filter((report): report is VisibleReport => report !== undefined);
	const seen = new Set(ordered.map((report) => report.id));
	for (const report of reports) {
		if (!seen.has(report.id)) ordered.push(report);
	}
	return ordered;
}

function categoryForFact(fact: Fact): Exclude<ReportFilter, "all"> | null {
	switch (fact.kind) {
		case "project_progressed":
		case "project_completed":
		case "model_trained":
		case "evaluation_completed":
			return "training";
		case "research_completed":
			return "research";
		case "product_launched":
		case "revenue":
			return "product";
		case "rival_progressed":
		case "rival_milestone":
			return "rival";
		case "funding_resolved":
			return "funding";
		case "incident_occurred":
		case "incident_resolved":
			return "incident";
		case "milestone_reached":
			return "milestone";
		case "terminal":
			return "terminal";
		case "resource_changed":
			return null;
	}
}

function factSummary(fact: Fact): string {
	switch (fact.kind) {
		case "resource_changed":
			return `${fact.resource} changed by ${signed(fact.amount)}.`;
		case "project_progressed":
			return `Project ${fact.projectId} progressed by ${fact.amount}.`;
		case "project_completed":
			return `Project ${fact.projectId} completed.`;
		case "research_completed":
			return `Research node ${fact.nodeId} completed.`;
		case "model_trained":
			return `Model ${fact.modelId} training completed.`;
		case "evaluation_completed":
			return `${fact.evaluation} evaluation completed for model ${fact.modelId}; coverage ${fact.coverage}%.`;
		case "product_launched":
			return `Product ${fact.productId} launched on ${fact.channel}.`;
		case "revenue":
			return `Product ${fact.productId} generated ${fact.amount} revenue at quality ${fact.effectiveQuality}.`;
		case "rival_progressed":
			return `Rival ${fact.rivalId} progressed by ${fact.amount}.`;
		case "rival_milestone":
			return `Rival ${fact.rivalId} reached ${fact.milestone}.`;
		case "funding_resolved":
			return `${fact.round} funding was ${fact.outcome}.`;
		case "incident_occurred":
			return `${fact.incident} occurred: ${fact.metric} ${fact.measurement} / threshold ${fact.threshold}; affected ${fact.affectedEntity}.`;
		case "incident_resolved":
			return `${fact.incident} resolved with ${fact.response}.`;
		case "milestone_reached":
			return `Milestone reached: ${fact.milestone}.`;
		case "terminal":
			return `Run ended: ${fact.reason}.`;
	}
}

function signed(value: number): string {
	return value > 0 ? `+${value}` : `${value}`;
}
