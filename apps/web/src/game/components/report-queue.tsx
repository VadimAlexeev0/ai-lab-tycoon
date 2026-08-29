import {
	type Fact,
	type GameState,
	selectRecentReports,
	type VisibleReport,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { AlertTriangle, Bell, Info } from "lucide-react";

export type ReportQueueProps = {
	state: GameState;
	acknowledgedIds?: ReadonlySet<string>;
	onAcknowledge?: (reportId: string) => void;
};

const PRIORITY_ORDER = {
	blocking: 0,
	important: 1,
	informational: 2,
} as const;

const ADVISOR_ART = {
	maya: {
		alt: "Advisor: Maya",
		src: "/art/advisor-maya.png",
	},
	ops: {
		alt: "Advisor: Ops",
		src: "/art/advisor-ops.png",
	},
} as const;

/** Surface at most three reports, retaining blocking-first engine order. */
export default function ReportQueue({
	acknowledgedIds = new Set<string>(),
	onAcknowledge,
	state,
}: ReportQueueProps) {
	const reports = selectRecentReports(state)
		.map((report, index) => ({ report, index }))
		.sort(
			(left, right) =>
				PRIORITY_ORDER[left.report.priority] -
					PRIORITY_ORDER[right.report.priority] || left.index - right.index,
		)
		.map(({ report }) => report);
	const pendingReports = reports.filter(
		(report) => !report.acknowledged && !acknowledgedIds.has(report.id),
	);
	const visibleReports = pendingReports.slice(0, 3);
	const remaining = pendingReports.length - visibleReports.length;

	return (
		<section aria-label="Report queue" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">Reports / queue</p>
					<h3 className="mt-1 font-semibold text-foreground text-sm">
						Current mechanical facts
					</h3>
				</div>
				<Bell className="size-4 text-primary" aria-hidden="true" />
			</div>
			<p className="text-muted-foreground text-xs leading-5">
				Blocking reports stay ahead of important and informational reports. At
				most three are shown here; the rest remain ordered in history.
			</p>

			{visibleReports.length > 0 ? (
				<div className="space-y-2">
					{visibleReports.map((report) => (
						<QueueReport
							key={report.id}
							onAcknowledge={onAcknowledge}
							report={report}
						/>
					))}
				</div>
			) : (
				<div className="glass-pane px-3 py-3">
					<div className="flex items-center gap-2">
						<Info
							className="size-3.5 text-[var(--game-positive)]"
							aria-hidden="true"
						/>
						<p className="font-semibold text-foreground text-xs">
							No unacknowledged reports
						</p>
					</div>
				</div>
			)}
			{remaining > 0 ? (
				<p className="text-[var(--game-amber)] text-xs">
					{remaining} more report{remaining === 1 ? "" : "s"} remain in order.
				</p>
			) : null}
		</section>
	);
}

function QueueReport({
	onAcknowledge,
	report,
}: {
	onAcknowledge?: (reportId: string) => void;
	report: VisibleReport;
}) {
	const blocking = report.priority === "blocking";
	const important = report.priority === "important";
	const advisor = advisorForReport(report);
	return (
		<article
			className={
				blocking
					? "glass-pane bg-[var(--game-negative)]/10 p-3 ring-1 ring-[var(--game-negative)]/60"
					: important
						? "glass-pane bg-[var(--game-amber)]/10 p-3 ring-1 ring-[var(--game-amber)]/50"
						: "glass-pane p-3"
			}
		>
			<div className="flex items-start gap-2">
				<img
					alt={advisor.alt}
					className="size-9 shrink-0 rounded-full border border-cyan-300/60 object-cover shadow-[0_0_12px_rgba(34,211,238,0.18)] ring-1 ring-cyan-300/35"
					decoding="async"
					loading="lazy"
					src={advisor.src}
				/>
				{blocking ? (
					<AlertTriangle
						className="mt-0.5 size-3.5 shrink-0 text-[var(--game-negative)]"
						aria-hidden="true"
					/>
				) : (
					<Info
						className="mt-0.5 size-3.5 shrink-0 text-primary"
						aria-hidden="true"
					/>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="font-semibold text-foreground text-xs">
							{report.priority}
						</p>
						<span className="text-muted-foreground text-xs">{report.id}</span>
					</div>
					<p className="mt-1 text-foreground text-xs leading-5">
						{factSummary(report.fact)}
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Week {report.fact.week}
					</p>
				</div>
			</div>
			{!blocking && report.priority === "informational" && onAcknowledge ? (
				<Button
					aria-label={`Acknowledge report ${report.id}`}
					className="mt-2"
					onClick={() => onAcknowledge(report.id)}
					size="xs"
					type="button"
					variant="outline"
				>
					Acknowledge fact
				</Button>
			) : null}
			{important ? (
				<p className="mt-2 text-[var(--game-amber)] text-xs">
					Important fact · inspect history for detail
				</p>
			) : null}
		</article>
	);
}

function advisorForReport(report: VisibleReport) {
	switch (report.fact.kind) {
		case "research_completed":
		case "model_trained":
		case "evaluation_completed":
			return ADVISOR_ART.maya;
		default:
			return ADVISOR_ART.ops;
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
		case "serving_throttled":
			return `Product ${fact.productId} serving throttled; ${fact.unmetDemand} demand unmet.`;
		case "training_starved":
			return `Training paused by compute pressure: capacity ${fact.capacity}, serving ${fact.servingDemand}, evaluation ${fact.evaluationDemand}, training ${fact.trainingDemand}.`;
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
