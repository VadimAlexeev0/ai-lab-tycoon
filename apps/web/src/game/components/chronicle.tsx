import {
	type CommandLogEntry,
	type Fact,
	type GameState,
	selectRecentReports,
} from "@ai-lab-tycoon/engine";
import { BookOpen, CircleDot, GitFork } from "lucide-react";
import { toast } from "sonner";

export type ChronicleMarker = "record" | "milestone" | "warning";

export type ChronicleEvent = {
	kind: "event";
	id: string;
	week: number;
	quarter: number;
	marker: ChronicleMarker;
	title: string;
	detail: string;
	source: string;
};

export type ChronicleBreak = {
	kind: "break";
	id: string;
	fromWeek: number;
	toWeek: number;
};

export type ChronicleItem = ChronicleEvent | ChronicleBreak;

export type ChronicleQuarter = {
	quarter: number;
	firstWeek: number;
	lastWeek: number;
	items: ChronicleItem[];
};

export type ChronicleDeathCertificate = {
	cause: GameState["terminal"]["reason"];
	preview: boolean;
	contributorKinds: string[];
};

export type ChronicleProps = {
	state: GameState;
	forceDeathCertificate?: boolean;
};

const WHAT_IF_OPTIONS = [
	"What if we protected the runway?",
	"What if we slowed the launch?",
	"What if we followed the safer branch?",
] as const;

/**
 * Project the engine's immutable reports into an archival timeline. A fresh run
 * has no report queue yet, so the command log provides its first entry instead.
 */
export function buildChronicleTimeline(state: GameState): ChronicleQuarter[] {
	const events = orderedReportEvents(state);
	const sourceEvents =
		events.length > 0 ? events : state.commandLog.map(commandToEvent);
	const sortedEvents = [...sourceEvents].sort(
		(left, right) => left.week - right.week || left.id.localeCompare(right.id),
	);
	const grouped = new Map<number, ChronicleEvent[]>();

	for (const event of sortedEvents) {
		const quarterEvents = grouped.get(event.quarter) ?? [];
		quarterEvents.push(event);
		grouped.set(event.quarter, quarterEvents);
	}

	return [...grouped.entries()]
		.sort(([left], [right]) => left - right)
		.map(([quarter, quarterEvents]) => {
			const items: ChronicleItem[] = [];
			let previousWeek: number | undefined;

			for (const event of quarterEvents) {
				if (previousWeek !== undefined && event.week > previousWeek + 1) {
					items.push({
						kind: "break",
						id: `chronicle-break-${quarter}-${previousWeek}-${event.week}`,
						fromWeek: previousWeek + 1,
						toWeek: event.week - 1,
					});
				}
				items.push(event);
				previousWeek = event.week;
			}

			const firstEvent = quarterEvents[0];
			const lastEvent = quarterEvents.at(-1);
			return {
				quarter,
				firstWeek: firstEvent?.week ?? 0,
				lastWeek: lastEvent?.week ?? 0,
				items,
			};
		});
}

/** Keep the certificate source truthful while allowing a debug-only preview. */
export function getChronicleDeathCertificate(
	state: GameState,
	forceDeathCertificate = false,
): ChronicleDeathCertificate | null {
	if (!forceDeathCertificate && state.terminal.status !== "lost") {
		return null;
	}

	return {
		cause: state.terminal.reason,
		preview: state.terminal.status !== "lost",
		contributorKinds: state.terminal.contributors.map(
			(contributor) => contributor.kind,
		),
	};
}

export default function Chronicle({
	forceDeathCertificate = false,
	state,
}: ChronicleProps) {
	const timeline = buildChronicleTimeline(state);
	const certificate = getChronicleDeathCertificate(
		state,
		forceDeathCertificate,
	);

	return (
		<article
			aria-labelledby="chronicle-surface-heading"
			className="relative isolate overflow-hidden border border-[var(--game-amber)]/45 bg-[var(--game-amber)]/5 p-4 text-foreground shadow-[0_18px_55px_rgba(0,0,0,0.16)] sm:p-5 lg:p-7"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10 bg-center bg-cover opacity-[0.1] mix-blend-screen"
				style={{ backgroundImage: "url('/art/texture-parchment.png')" }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-[var(--game-amber)]/10 via-transparent to-transparent"
			/>

			<header className="relative border-[var(--game-amber)]/35 border-b pb-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="max-w-3xl space-y-2">
						<div className="flex items-center gap-2 font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.2em]">
							<BookOpen className="size-4" aria-hidden="true" />
							<span>Private manuscript / run record</span>
						</div>
						<h2
							className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl"
							id="chronicle-surface-heading"
						>
							Company chronicle
						</h2>
						<p className="max-w-2xl font-serif text-sm italic leading-6 opacity-80">
							A quiet account of the choices, discoveries, and consequences that
							shaped this run. Mechanical entries are copied from the engine
							report history; blank weeks remain blank.
						</p>
					</div>
					<div className="shrink-0 border border-[var(--game-amber)]/35 bg-background/35 px-3 py-2 font-mono text-xs uppercase tracking-[0.12em]">
						<p className="text-[var(--game-amber)]">Run ledger</p>
						<p className="mt-1 font-semibold text-foreground">
							{timeline.length} quarter{timeline.length === 1 ? "" : "s"}{" "}
							recorded
						</p>
					</div>
				</div>
			</header>

			{certificate !== null ? (
				<DeathCertificate certificate={certificate} />
			) : null}

			<section
				aria-labelledby="chronicle-timeline-heading"
				className="relative mt-6"
			>
				<div className="flex items-end justify-between gap-3">
					<div>
						<p className="font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.18em]">
							Timeline / evidence
						</p>
						<h3
							className="mt-1 font-serif text-xl tracking-tight"
							id="chronicle-timeline-heading"
						>
							The work as it happened
						</h3>
					</div>
					<span className="font-mono text-xs uppercase tracking-[0.1em] opacity-70">
						{countChronicleEvents(timeline)} entries
					</span>
				</div>

				{timeline.length > 0 ? (
					<div className="mt-4 space-y-7">
						{timeline.map((quarter) => (
							<QuarterChapter key={quarter.quarter} quarter={quarter} />
						))}
					</div>
				) : (
					<div className="mt-4 border border-[var(--game-amber)]/30 border-dashed bg-background/30 px-4 py-8 text-center">
						<CircleDot
							className="mx-auto size-5 text-[var(--game-amber)]"
							aria-hidden="true"
						/>
						<p className="mt-3 font-serif text-sm italic opacity-80">
							The first page is waiting for a mechanical record.
						</p>
						<p className="mt-1 text-xs opacity-65">
							Advance the run to add reports to this archive.
						</p>
					</div>
				)}
			</section>
		</article>
	);
}

function QuarterChapter({ quarter }: { quarter: ChronicleQuarter }) {
	return (
		<section
			aria-labelledby={`chronicle-quarter-${quarter.quarter}`}
			className="relative"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2 border-[var(--game-amber)]/25 border-b pb-2">
				<h4
					className="font-semibold font-serif text-lg"
					id={`chronicle-quarter-${quarter.quarter}`}
				>
					Chapter {romanNumeral(quarter.quarter)}
				</h4>
				<span className="font-mono text-xs uppercase tracking-[0.1em] opacity-65">
					Weeks {quarter.firstWeek}–{quarter.lastWeek}
				</span>
			</div>
			<ol className="relative mt-4 space-y-4 border-[var(--game-amber)]/30 border-l pl-5 sm:pl-7">
				{quarter.items.map((item) =>
					item.kind === "break" ? (
						<li
							aria-label={`No recorded events from week ${item.fromWeek} to week ${item.toWeek}`}
							className="relative py-1 font-serif text-xs italic opacity-55"
							key={item.id}
						>
							<span className="absolute top-3 -left-[1.86rem] size-2 rounded-full border border-[var(--game-amber)]/45 bg-background sm:-left-[2.05rem]" />
							<span>
								· · · weeks {item.fromWeek}–{item.toWeek} left unmarked · · ·
							</span>
						</li>
					) : (
						<ChronicleEventRow event={item} key={item.id} />
					),
				)}
			</ol>
		</section>
	);
}

function ChronicleEventRow({ event }: { event: ChronicleEvent }) {
	const accent =
		event.marker === "milestone"
			? "border-[var(--game-positive)]/45 bg-[var(--game-positive)]/8"
			: event.marker === "warning"
				? "border-[var(--game-negative)]/40 bg-[var(--game-negative)]/7"
				: "border-[var(--game-amber)]/25 bg-background/25";
	return (
		<li className="relative">
			<span
				aria-hidden="true"
				className={
					event.marker === "milestone"
						? "absolute top-4 -left-[1.68rem] size-2.5 rounded-full border-2 border-[var(--game-positive)] bg-background sm:-left-[1.87rem]"
						: "absolute top-4 -left-[1.61rem] size-2 rounded-full bg-[var(--game-amber)] sm:-left-[1.8rem]"
				}
			/>
			<article className={`border p-3 ${accent}`}>
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<div className="flex min-w-0 items-center gap-2">
						{event.marker === "milestone" ? (
							<GitFork
								className="size-3.5 shrink-0 text-[var(--game-positive)]"
								aria-hidden="true"
							/>
						) : null}
						<h5 className="font-semibold font-serif text-sm">{event.title}</h5>
					</div>
					<span className="shrink-0 font-mono text-xs uppercase tracking-[0.08em] opacity-65">
						Week {event.week}
					</span>
				</div>
				<p className="mt-1 font-serif text-sm leading-6 opacity-85">
					{event.detail}
				</p>
				<p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] opacity-55">
					{event.source}
				</p>
			</article>
		</li>
	);
}

function DeathCertificate({
	certificate,
}: {
	certificate: ChronicleDeathCertificate;
}) {
	const cause =
		certificate.cause === "none"
			? "No terminal reason recorded in this run"
			: humanize(certificate.cause);
	return (
		<aside
			aria-label="Death certificate"
			className="relative mt-5 overflow-hidden border border-[var(--game-negative)]/50 bg-[var(--game-negative)]/8 p-4 sm:p-5"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--game-negative)]/80 via-[var(--game-negative)]/20 to-transparent"
			/>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
				<img
					alt=""
					aria-hidden="true"
					className="size-20 shrink-0 object-contain opacity-90 mix-blend-screen"
					src="/art/icon-wax-seal.png"
				/>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-mono font-semibold text-[var(--game-negative)] text-xs uppercase tracking-[0.18em]">
							Death certificate
						</p>
						{certificate.preview ? (
							<span className="border border-[var(--game-amber)]/55 px-2 py-1 font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.1em]">
								Debug preview
							</span>
						) : null}
					</div>
					<h3 className="mt-1 font-serif text-2xl">Run closed</h3>
					<p className="mt-2 font-serif text-sm leading-6 opacity-85">
						Cause: <strong>{cause}</strong>. The certificate reads the terminal
						projection and does not alter the saved run.
					</p>
					{certificate.contributorKinds.length > 0 ? (
						<p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] opacity-65">
							Contributors:{" "}
							{certificate.contributorKinds.map(humanize).join(" · ")}
						</p>
					) : null}
				</div>
			</div>
			<div className="mt-5 border-[var(--game-negative)]/30 border-t pt-4">
				<div className="flex items-center gap-2">
					<GitFork
						className="size-3.5 text-[var(--game-negative)]"
						aria-hidden="true"
					/>
					<p className="font-mono font-semibold text-[var(--game-negative)] text-xs uppercase tracking-[0.14em]">
						What-if forks
					</p>
				</div>
				<div className="mt-3 grid gap-2 md:grid-cols-3">
					{WHAT_IF_OPTIONS.map((option) => (
						<button
							aria-disabled="true"
							className="min-h-16 cursor-not-allowed border border-[var(--game-negative)]/30 bg-background/20 px-3 py-2 text-left font-serif text-sm opacity-55 grayscale"
							data-placeholder-disabled="true"
							key={option}
							onClick={() => toast("Replay forks ship later")}
							type="button"
						>
							<span className="block font-mono text-xs uppercase tracking-[0.1em]">
								{option}
							</span>
							<span className="mt-1 block text-xs italic opacity-80">
								Replay forks ship later
							</span>
						</button>
					))}
				</div>
			</div>
		</aside>
	);
}

function orderedReportEvents(state: GameState): ChronicleEvent[] {
	const reports = selectRecentReports(state);
	const byId = new Map(reports.map((report) => [report.id, report]));
	const ordered = state.queue.reportIds
		.map((id) => byId.get(id))
		.filter(
			(report): report is (typeof reports)[number] => report !== undefined,
		);
	const seen = new Set(ordered.map((report) => report.id));
	for (const report of reports) {
		if (!seen.has(report.id)) ordered.push(report);
	}
	return ordered.map((report) =>
		factToEvent(report.id, report.priority, report.fact),
	);
}

function factToEvent(id: string, priority: string, fact: Fact): ChronicleEvent {
	const marker = markerForFact(fact);
	return {
		kind: "event",
		id,
		week: fact.week,
		quarter: quarterForWeek(fact.week),
		marker,
		title: titleForFact(fact),
		detail: detailForFact(fact),
		source: `${priority} report · engine fact`,
	};
}

function commandToEvent(command: CommandLogEntry): ChronicleEvent {
	return {
		kind: "event",
		id: command.id,
		week: command.week,
		quarter: quarterForWeek(command.week),
		marker: command.kind === "start_run" ? "milestone" : "record",
		title: commandTitle(command),
		detail: commandDetail(command),
		source: "command log · engine action",
	};
}

function markerForFact(fact: Fact): ChronicleMarker {
	switch (fact.kind) {
		case "research_completed":
		case "product_launched":
		case "milestone_reached":
			return "milestone";
		case "incident_occurred":
		case "terminal":
			return "warning";
		default:
			return "record";
	}
}

function titleForFact(fact: Fact): string {
	switch (fact.kind) {
		case "resource_changed":
			return `${humanize(fact.resource)} ledger changed`;
		case "project_progressed":
			return `Project ${fact.projectId} progressed`;
		case "project_completed":
			return `Project ${fact.projectId} completed`;
		case "research_completed":
			return `Research node ${fact.nodeId} completed`;
		case "model_trained":
			return `Model ${fact.modelId} training completed`;
		case "evaluation_completed":
			return `${humanize(fact.evaluation)} evaluation completed`;
		case "product_launched":
			return `Product ${fact.productId} launched`;
		case "revenue":
			return `Product ${fact.productId} recorded revenue`;
		case "rival_progressed":
			return `Rival ${fact.rivalId} progressed`;
		case "rival_milestone":
			return `Rival ${fact.rivalId} reached a milestone`;
		case "funding_resolved":
			return `${humanize(fact.round)} funding resolved`;
		case "incident_occurred":
			return `${humanize(fact.incident)} incident recorded`;
		case "incident_resolved":
			return `${humanize(fact.incident)} incident resolved`;
		case "milestone_reached":
			return "First multimodal launch milestone";
		case "terminal":
			return `Run ended: ${humanize(fact.reason)}`;
	}
}

function detailForFact(fact: Fact): string {
	switch (fact.kind) {
		case "resource_changed":
			return `${humanize(fact.resource)} changed by ${signed(fact.amount)} in the engine ledger.`;
		case "project_progressed":
			return `The engine advanced ${fact.projectId} by ${fact.amount} progress points.`;
		case "project_completed":
			return `The engine marked ${fact.projectId} complete.`;
		case "research_completed":
			return `The completed node is recorded as ${fact.nodeId}; this is a real research milestone.`;
		case "model_trained":
			return `The engine recorded completed training for ${fact.modelId}.`;
		case "evaluation_completed":
			return `${humanize(fact.evaluation)} coverage reached ${fact.coverage}% for ${fact.modelId}.`;
		case "product_launched":
			return `${fact.productId} entered the ${humanize(fact.channel)} channel.`;
		case "revenue":
			return `${fact.productId} returned ${fact.amount} in ${humanize(fact.channel)} revenue at quality ${fact.effectiveQuality}.`;
		case "rival_progressed":
			return `${fact.rivalId} moved by ${fact.amount} progress points.`;
		case "rival_milestone":
			return `${fact.rivalId} recorded ${fact.milestone}.`;
		case "funding_resolved":
			return `The ${humanize(fact.round)} offer was ${fact.outcome}.`;
		case "incident_occurred":
			return `${humanize(fact.incident)} affected ${fact.affectedEntity}; measured ${fact.measurement} against ${fact.threshold}.`;
		case "incident_resolved":
			return `The response was ${humanize(fact.response)} for incident ${fact.incidentId}.`;
		case "milestone_reached":
			return "The engine recorded the first multimodal launch milestone.";
		case "terminal":
			return `Terminal projection recorded ${fact.contributors.length} contributors.`;
	}
}

function commandTitle(command: CommandLogEntry): string {
	switch (command.kind) {
		case "start_run":
			return "Run opened";
		case "apply_decision":
			return "Decision applied";
		case "advance_week":
			return "Week advanced";
		case "assign_project":
			return `Project ${command.projectId} assigned`;
		case "cancel_project":
			return `Project ${command.projectId} cancelled`;
		case "design_model":
			return `Model ${command.name} designed`;
		case "run_evaluation":
			return `Evaluation started for ${command.modelId}`;
		case "launch_product":
			return `Product ${command.productId} launched`;
		case "buy_compute":
			return "Compute capacity purchased";
		case "hire_team":
			return `Team ${command.name} hired`;
		case "product_resume":
			return `Product ${command.productId} resumed`;
	}
}

function commandDetail(command: CommandLogEntry): string {
	switch (command.kind) {
		case "start_run":
			return `The ${command.setup.companyName} sandbox opened with seed ${command.seed}.`;
		case "apply_decision":
			return `The engine accepted the ${command.choice.kind} decision ${command.choice.decisionId}.`;
		case "advance_week":
			return "The engine advanced the simulation clock.";
		case "assign_project":
			return `Team ${command.teamId} took ownership of ${command.projectId}.`;
		case "cancel_project":
			return `Team ${command.teamId} released ${command.projectId}.`;
		case "design_model":
			return `${humanize(command.foundation)} foundation · ${humanize(command.family)} family.`;
		case "run_evaluation":
			return `${humanize(command.evaluation)} evaluation queued for ${command.modelId}.`;
		case "launch_product":
			return `${command.modelId} was placed into the ${humanize(command.channel)} channel.`;
		case "buy_compute":
			return `${command.amount} compute capacity was added to the lab.`;
		case "hire_team":
			return `${command.name} joined the operating roster.`;
		case "product_resume":
			return `${command.productId} returned to an operating state.`;
	}
}

function countChronicleEvents(timeline: readonly ChronicleQuarter[]): number {
	return timeline.reduce(
		(total, quarter) =>
			total + quarter.items.filter((item) => item.kind === "event").length,
		0,
	);
}

function quarterForWeek(week: number): number {
	return Math.max(1, Math.ceil(week / 13));
}

function romanNumeral(value: number): string {
	const numerals = ["", "I", "II", "III", "IV", "V", "VI"];
	return numerals[value] ?? String(value);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function signed(value: number): string {
	return value > 0 ? `+${value}` : String(value);
}
