import {
	type CommandLogEntry,
	type Fact,
	type GameState,
	type PendingDecision,
	selectPendingDecisions,
	selectProducts,
	selectRecentReports,
	selectResearchNodes,
	selectTeams,
	selectVisibleModels,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import {
	CalendarClock,
	Check,
	CircleDot,
	Flag,
	FlaskConical,
	GitBranch,
	Play,
	Radar,
	ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import Pane from "@/game/components/pane";
import { resolveEntityLabel } from "@/game/derived/labels";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const PAST_WEEKS_TO_SHOW = 3;
const FUTURE_WEEKS_TO_SHOW = 4;

export type CalendarDestination =
	| "/game"
	| "/game/teams"
	| "/game/research"
	| "/game/models"
	| "/game/products"
	| "/game/reports";

export type CalendarEventKind =
	| "run"
	| "research"
	| "training"
	| "evaluation"
	| "infrastructure"
	| "model"
	| "product"
	| "project"
	| "launch"
	| "rival"
	| "funding"
	| "incident"
	| "milestone"
	| "decision";

export type CalendarEventStatus =
	| "in-progress"
	| "completed"
	| "recorded"
	| "pending";

export type CalendarSource = {
	path: string;
	id: string;
	object: unknown;
};

export type CalendarEvent = {
	id: string;
	kind: CalendarEventKind;
	status: CalendarEventStatus;
	title: string;
	summary: string;
	startWeek: number;
	endWeek: number;
	startDay: number;
	finishDay: number;
	progress?: number;
	duration?: number;
	destination?: CalendarDestination;
	pendingDecisionId?: string;
	sources: readonly CalendarSource[];
};

export type SimulationCalendarProps = {
	state: GameState;
	onNavigate?: (event: CalendarEvent) => void;
};

type Project = GameState["projects"]["items"][number];
type VisibleModel = ReturnType<typeof selectVisibleModels>[number];
type VisibleProduct = ReturnType<typeof selectProducts>[number];
type VisibleResearchNode = ReturnType<typeof selectResearchNodes>[number];
type VisibleTeam = ReturnType<typeof selectTeams>[number];

type EventLookups = {
	models: ReadonlyMap<string, VisibleModel>;
	products: ReadonlyMap<string, VisibleProduct>;
	researchNodes: ReadonlyMap<string, VisibleResearchNode>;
	teams: ReadonlyMap<string, VisibleTeam>;
};

type EventSegment = {
	event: CalendarEvent;
	startDay: number;
	finishDay: number;
	lane: number;
};

/**
 * Build the calendar from persisted engine state. A week is still the only
 * simulation tick; the seven rows are an indicative visual subdivision.
 */
export function buildCalendarEvents(state: GameState): CalendarEvent[] {
	const lookups = createEventLookups(state);
	const reports = selectRecentReports(state);
	const projectEvents = state.projects.items
		.filter(
			(project) =>
				project.status === "active" || project.status === "completed",
		)
		.map((project) => projectToCalendarEvent(state, project, reports, lookups));
	const projectById = new Map(
		projectEvents
			.filter((event): event is CalendarEvent => event !== null)
			.map((event) => [event.id.replace("calendar-project-", ""), event]),
	);
	const reportEvents = reports
		.map((report) => reportToCalendarEvent(state, report, projectById, lookups))
		.filter((event): event is CalendarEvent => event !== null);
	const commandEvents = commandEventsForState(state, reports, lookups);
	const decisionEvents = selectPendingDecisions(state).map((decision) =>
		decisionToCalendarEvent(state, decision, lookups),
	);

	return [
		...projectEvents.filter((event): event is CalendarEvent => event !== null),
		...reportEvents,
		...commandEvents,
		...decisionEvents,
	].sort(compareCalendarEvents);
}

/** Return a stable Monday-to-Sunday row for an event id. */
export function dayForCalendarEvent(id: string): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < id.length; index += 1) {
		hash ^= id.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return ((hash >>> 0) % DAY_LABELS.length) + 1;
}

/** Keep the view bounded while ensuring the end of an active span is visible. */
export function getCalendarWeeks(
	state: Pick<GameState, "meta">,
	events: readonly CalendarEvent[] = [],
): number[] {
	const currentWeek = Math.max(1, state.meta.week);
	const firstWeek = Math.max(1, currentWeek - PAST_WEEKS_TO_SHOW);
	const plannedLastWeek = currentWeek + FUTURE_WEEKS_TO_SHOW;
	const eventLastWeek = events.reduce(
		(lastWeek, event) => Math.max(lastWeek, event.endWeek),
		plannedLastWeek,
	);
	return Array.from(
		{ length: Math.max(0, eventLastWeek - firstWeek + 1) },
		(_, index) => firstWeek + index,
	);
}

export default function SimulationCalendar({
	onNavigate,
	state,
}: SimulationCalendarProps) {
	const events = useMemo(() => buildCalendarEvents(state), [state]);
	const weeks = useMemo(() => getCalendarWeeks(state, events), [state, events]);
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
	const selectedEvent = events.find((event) => event.id === selectedEventId);

	return (
		<section aria-label="Simulation calendar" className="space-y-4">
			<div className="glass-pane glass-edge px-4 py-4 sm:px-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="max-w-3xl">
						<div className="flex items-center gap-2 font-semibold text-primary text-xs">
							<CalendarClock className="size-4" aria-hidden="true" />
							<span>Weekly schedule / derived view</span>
						</div>
						<h2 className="mt-1 font-display font-semibold text-foreground text-xl sm:text-2xl">
							The simulation calendar
						</h2>
						<p className="mt-2 max-w-2xl text-muted-foreground text-xs leading-5">
							The engine advances one week at a time. Seven day rows make each
							weekly span easier to scan; day placement is indicative, not a
							separate simulation tick.
						</p>
					</div>
					<div className="shrink-0 border border-primary/35 bg-primary/5 px-3 py-2 text-xs">
						<p className="text-muted-foreground">Current simulation week</p>
						<p className="mt-1 font-semibold text-base text-foreground">
							Week {state.meta.week}
						</p>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-border/70 border-t pt-3 text-muted-foreground text-xs">
					<LegendItem
						icon={
							<CircleDot className="size-3.5 text-primary" aria-hidden="true" />
						}
						label="In progress"
					/>
					<LegendItem
						icon={
							<Check
								className="size-3.5 text-[var(--game-positive)]"
								aria-hidden="true"
							/>
						}
						label="Completed"
					/>
					<LegendItem
						icon={
							<Flag
								className="size-3.5 text-[var(--game-amber)]"
								aria-hidden="true"
							/>
						}
						label="Completion marker"
					/>
					<span className="text-muted-foreground/70">
						Past weeks are muted against the current week.
					</span>
				</div>
			</div>

			<div className="overflow-x-auto overscroll-x-contain pb-2">
				<div
					className="grid min-w-max gap-3"
					style={{
						gridTemplateColumns: `repeat(${weeks.length}, minmax(13.5rem, 1fr))`,
					}}
				>
					{weeks.map((week) => (
						<CalendarWeekColumn
							currentWeek={state.meta.week}
							firstWeek={weeks[0] ?? 1}
							key={week}
							onSelect={setSelectedEventId}
							events={events}
							week={week}
						/>
					))}
				</div>
			</div>

			{selectedEvent !== undefined ? (
				<Pane
					blocking={false}
					description={`${selectedEvent.sources.length} engine state source${selectedEvent.sources.length === 1 ? "" : "s"} · indicative day placement`}
					onClose={() => setSelectedEventId(null)}
					title={selectedEvent.title}
				>
					<CalendarEventDetail event={selectedEvent} onNavigate={onNavigate} />
				</Pane>
			) : null}
		</section>
	);
}

function CalendarWeekColumn({
	currentWeek,
	events,
	firstWeek,
	onSelect,
	week,
}: {
	currentWeek: number;
	events: readonly CalendarEvent[];
	firstWeek: number;
	onSelect: (eventId: string) => void;
	week: number;
}) {
	const weekEvents = events
		.map((event) => segmentForWeek(event, week))
		.filter(
			(segment): segment is Omit<EventSegment, "lane"> => segment !== null,
		);
	const segments = addEventLanes(weekEvents);
	const laneCount = Math.max(1, ...segments.map((segment) => segment.lane + 1));
	const isPast = week < currentWeek;
	const isCurrent = week === currentWeek;

	return (
		<section
			aria-label={`Week ${week}`}
			className={cn(
				"calendar-week min-w-0",
				isPast ? "calendar-week-past opacity-60 grayscale" : undefined,
			)}
			data-current={isCurrent}
			data-past={isPast}
			data-testid="calendar-week"
			data-week={week}
		>
			<header
				className={cn(
					"min-h-[4.5rem] border-b px-3 py-3",
					isCurrent
						? "border-primary/60 bg-primary/8"
						: "border-border/70 bg-background/30",
				)}
			>
				<div className="flex items-center justify-between gap-2">
					<p
						className={cn(
							"font-semibold text-xs",
							isCurrent ? "text-primary" : "text-foreground",
						)}
					>
						Week {week}
					</p>
					{isCurrent ? (
						<span className="border border-primary/35 px-1.5 py-0.5 text-[10px] text-primary">
							Now
						</span>
					) : isPast ? (
						<span className="text-[10px] text-muted-foreground">Past</span>
					) : (
						<span className="text-[10px] text-muted-foreground">Ahead</span>
					)}
				</div>
				<p className="mt-1 text-[10px] text-muted-foreground">
					{weekEvents.length === 0
						? "No recorded events"
						: `${weekEvents.length} scheduled span${weekEvents.length === 1 ? "" : "s"}`}
				</p>
			</header>

			<div className="relative grid min-h-[31rem] grid-rows-7 overflow-hidden border-border/70 border-x border-b bg-background/25">
				<div className="grid min-h-0 grid-rows-7">
					{DAY_LABELS.map((day, index) => (
						<div
							className="relative flex min-h-0 items-start border-border/55 border-t px-2 py-2 first:border-t-0"
							key={day}
						>
							<span className="text-[10px] text-muted-foreground">{day}</span>
							<span className="ml-auto text-[10px] text-muted-foreground/55">
								{week}.{index + 1}
							</span>
						</div>
					))}
				</div>
				<div
					className="pointer-events-none absolute inset-0 grid grid-rows-7 gap-px p-px"
					style={{
						gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`,
					}}
				>
					{segments.map((segment) => {
						const isInteractive =
							week === segment.event.startWeek ||
							(week === firstWeek && segment.event.startWeek < firstWeek);
						return (
							<div
								className="relative min-h-0 min-w-0"
								key={`${segment.event.id}-${week}`}
								style={{
									gridColumn: segment.lane + 1,
									gridRow: `${segment.startDay} / ${segment.finishDay + 1}`,
								}}
							>
								{isInteractive ? (
									<CalendarEventButton
										event={segment.event}
										onClick={() => onSelect(segment.event.id)}
									/>
								) : (
									<span
										aria-hidden="true"
										className={cn(
											"absolute inset-0 border-l-2 opacity-70",
											eventAccentClass(segment.event.kind),
										)}
									/>
								)}
								{segment.event.endWeek === week ? (
									<span
										role="img"
										aria-label={`${segment.event.title} completion day marker`}
										className="absolute right-1 bottom-1 text-[10px] text-[var(--game-amber)]"
										title="Completion day marker"
									>
										<Flag className="size-3" aria-hidden="true" />
									</span>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}

function CalendarEventButton({
	event,
	onClick,
}: {
	event: CalendarEvent;
	onClick: () => void;
}) {
	const statusLabel =
		event.status === "in-progress"
			? "in progress"
			: event.status === "pending"
				? "pending decision"
				: event.status;
	return (
		<button
			aria-label={`${event.title}, ${statusLabel}, ${event.summary}`}
			className={cn(
				"pointer-events-auto relative flex h-full min-h-8 w-full min-w-0 flex-col justify-between overflow-hidden border px-1.5 py-1.5 text-left text-[10px] leading-4 outline-none transition-[background-color,box-shadow] hover:bg-background/75 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
				eventAccentClass(event.kind),
			)}
			data-event-id={event.id}
			onClick={onClick}
			type="button"
		>
			<span className="flex min-w-0 items-start gap-1 font-semibold text-foreground">
				<EventIcon kind={event.kind} />
				<span className="line-clamp-3 min-w-0">{event.title}</span>
			</span>
			{event.progress !== undefined ? (
				<span className="mt-1 block text-[9px] text-muted-foreground">
					{event.progress}% · {event.status === "completed" ? "done" : "moving"}
				</span>
			) : null}
		</button>
	);
}

function CalendarEventDetail({
	event,
	onNavigate,
}: {
	event: CalendarEvent;
	onNavigate?: (event: CalendarEvent) => void;
}) {
	const actionLabel =
		event.pendingDecisionId !== undefined
			? "Resolve pending decision"
			: event.destination === undefined
				? undefined
				: `Open ${destinationLabel(event.destination)}`;
	return (
		<div className="space-y-5">
			<section
				aria-labelledby="calendar-event-context-heading"
				className="space-y-2"
			>
				<p className="font-semibold text-primary text-xs">Event context</p>
				<h3
					className="font-semibold text-foreground text-sm"
					id="calendar-event-context-heading"
				>
					What this means
				</h3>
				<p className="text-muted-foreground text-xs leading-5">
					{event.summary}
				</p>
			</section>

			<dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-border/70 border-y py-3 text-xs sm:grid-cols-4">
				<DetailValue label="Status" value={humanize(event.status)} />
				<DetailValue
					label="Simulation span"
					value={
						event.startWeek === event.endWeek
							? `Week ${event.startWeek}`
							: `Weeks ${event.startWeek}–${event.endWeek}`
					}
				/>
				<DetailValue
					label="Indicative days"
					value={`${DAY_LABELS[event.startDay - 1] ?? "Mon"} → ${DAY_LABELS[event.finishDay - 1] ?? "Sun"}`}
				/>
				<DetailValue
					label="Progress"
					value={
						event.progress === undefined
							? "Not applicable"
							: `${event.progress}%`
					}
				/>
			</dl>

			{event.progress !== undefined ? (
				<div
					aria-label={`Progress ${event.progress}%`}
					aria-valuemax={100}
					aria-valuemin={0}
					aria-valuenow={event.progress}
					className="h-1.5 overflow-hidden bg-muted"
					role="progressbar"
				>
					<div
						className="h-full bg-primary transition-[width]"
						style={{ width: `${event.progress}%` }}
					/>
				</div>
			) : null}

			<section aria-labelledby="calendar-source-heading" className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<h3
						className="font-semibold text-muted-foreground text-xs"
						id="calendar-source-heading"
					>
						Source state objects
					</h3>
					<span className="text-[10px] text-muted-foreground">
						{event.sources.length} linked
					</span>
				</div>
				<div className="space-y-2">
					{event.sources.map((source) => (
						<details
							className="border border-border/70 bg-background/35"
							key={`${source.path}-${source.id}`}
							open
						>
							<summary className="cursor-pointer px-2.5 py-2 text-foreground text-xs hover:bg-muted/40">
								<span className="text-muted-foreground">{source.path}</span>{" "}
								<span className="font-semibold">
									· <span data-calendar-source-id={source.id}>{source.id}</span>
								</span>
							</summary>
							<pre className="max-h-44 overflow-auto border-border/70 border-t px-2.5 py-2 font-mono text-[10px] text-muted-foreground leading-4">
								{formatSourceObject(source.object)}
							</pre>
						</details>
					))}
				</div>
			</section>

			{actionLabel !== undefined ? (
				<section className="border-border/70 border-t pt-4">
					<p className="font-semibold text-[var(--game-amber)] text-xs">
						Next move
					</p>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						{event.pendingDecisionId !== undefined
							? `This action is linked to pending decision ${event.pendingDecisionId}.`
							: "Continue in the linked operating surface for the full action context."}
					</p>
					<Button
						className="mt-3"
						onClick={() => onNavigate?.(event)}
						size="sm"
						type="button"
						variant="outline"
					>
						<Play data-icon="inline-start" aria-hidden="true" />
						{actionLabel}
					</Button>
				</section>
			) : null}
		</div>
	);
}

function createEventLookups(state: GameState): EventLookups {
	return {
		models: new Map(
			selectVisibleModels(state).map((model) => [model.id, model]),
		),
		products: new Map(
			selectProducts(state).map((product) => [product.id, product]),
		),
		researchNodes: new Map(
			selectResearchNodes(state).map((node) => [node.id, node]),
		),
		teams: new Map(selectTeams(state).map((team) => [team.id, team])),
	};
}

function projectToCalendarEvent(
	state: GameState,
	project: Project,
	reports: Readonly<ReturnType<typeof selectRecentReports>>,
	lookups: EventLookups,
): CalendarEvent | null {
	const startCommand = findProjectStartCommand(state.commandLog, project);
	const completionReport = reports.find(
		(report) =>
			report.fact.kind === "project_completed" &&
			report.fact.projectId === project.id,
	);
	const startWeek = Math.max(
		1,
		startCommand?.week ??
			(project.status === "active"
				? state.meta.week - project.progress + 1
				: state.meta.week - project.duration + 1),
	);
	const endWeek = Math.max(
		startWeek,
		completionReport?.fact.week ?? startWeek + project.duration - 1,
	);
	const startDay = dayForCalendarEvent(project.id);
	const finishDay =
		endWeek === startWeek
			? Math.max(startDay, dayForCalendarEvent(`${project.id}:completion`))
			: dayForCalendarEvent(`${project.id}:completion`);
	const progress = Math.min(
		100,
		Math.max(0, Math.round((project.progress / project.duration) * 100)),
	);
	const sources: CalendarSource[] = [
		sourceRef("projects.items", project.id, project),
	];
	if (startCommand !== undefined) {
		sources.push(sourceRef("commandLog", startCommand.id, startCommand));
	}
	if (completionReport !== undefined) {
		sources.push(
			sourceRef("reports.items", completionReport.id, completionReport),
		);
	}

	const teamId = project.teamId;
	if (teamId !== null) {
		const team = lookups.teams.get(teamId);
		if (team !== undefined)
			sources.push(sourceRef("teams.items", team.id, team));
	}
	if (project.kind === "research") {
		const node = state.research.nodes.find(
			(candidate) => candidate.id === project.nodeId,
		);
		const visibleNode = lookups.researchNodes.get(project.nodeId);
		if (visibleNode !== undefined) {
			sources.push(
				sourceRef("research.nodes (public)", visibleNode.id, visibleNode),
			);
		} else if (node !== undefined) {
			sources.push(sourceRef("research.nodes", node.id, node));
		}
	}
	if ("modelId" in project) {
		const model = lookups.models.get(project.modelId);
		if (model !== undefined) {
			sources.push(sourceRef("models (public selector)", model.id, model));
		}
	}

	return {
		id: `calendar-project-${project.id}`,
		kind: project.kind,
		status: project.status === "active" ? "in-progress" : "completed",
		title: projectTitle(project, lookups),
		summary: projectSummary(project, startWeek, endWeek),
		startWeek,
		endWeek,
		startDay,
		finishDay,
		progress,
		duration: project.duration,
		destination: destinationForProject(project.kind),
		sources,
	};
}

function reportToCalendarEvent(
	state: GameState,
	report: ReturnType<typeof selectRecentReports>[number],
	projectEvents: ReadonlyMap<string, CalendarEvent>,
	lookups: EventLookups,
): CalendarEvent | null {
	const fact = report.fact;
	if (
		fact.kind === "resource_changed" ||
		fact.kind === "revenue" ||
		fact.kind === "project_progressed" ||
		fact.kind === "project_completed"
	) {
		return null;
	}
	if (
		fact.kind === "research_completed" &&
		[...projectEvents.values()].some(
			(event) =>
				event.kind === "research" &&
				event.status === "completed" &&
				event.sources.some(
					(source) =>
						source.id === fact.nodeId && source.path.includes("research.nodes"),
				),
		)
	) {
		return null;
	}
	if (
		fact.kind === "model_trained" &&
		[...projectEvents.values()].some(
			(event) =>
				event.kind === "training" &&
				event.status === "completed" &&
				event.sources.some((source) => source.id === fact.modelId),
		)
	) {
		return null;
	}
	if (
		fact.kind === "evaluation_completed" &&
		[...projectEvents.values()].some(
			(event) =>
				event.kind === "evaluation" &&
				event.status === "completed" &&
				event.sources.some((source) => source.id === fact.modelId),
		)
	) {
		return null;
	}

	const day = dayForCalendarEvent(report.id);
	const base = {
		startWeek: fact.week,
		endWeek: fact.week,
		startDay: day,
		finishDay: day,
		status: "recorded" as const,
		progress: undefined,
		sources: [sourceRef("reports.items", report.id, report)],
	};

	switch (fact.kind) {
		case "research_completed": {
			const node = lookups.researchNodes.get(fact.nodeId);
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "research",
				title: `Research complete · ${node?.label ?? fact.nodeId}`,
				summary: `Research node ${fact.nodeId} completed in the engine on week ${fact.week}.`,
				destination: "/game/research",
				sources: appendSource(
					base.sources,
					state.research.nodes.find(
						(candidate) => candidate.id === fact.nodeId,
					),
					"research.nodes",
					fact.nodeId,
				),
			};
		}
		case "model_trained": {
			const model = lookups.models.get(fact.modelId);
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "training",
				title: `Training complete · ${model?.name ?? fact.modelId}`,
				summary: `Model ${fact.modelId} finished its training run on week ${fact.week}.`,
				destination: "/game/models",
				sources: appendSource(
					base.sources,
					model,
					"models (public selector)",
					fact.modelId,
				),
			};
		}
		case "evaluation_completed": {
			const model = lookups.models.get(fact.modelId);
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "evaluation",
				title: `Evaluation complete · ${model?.name ?? fact.modelId}`,
				summary: `${humanize(fact.evaluation)} evaluation reached ${fact.coverage}% coverage for model ${fact.modelId}.`,
				destination: "/game/models",
				sources: appendSource(
					base.sources,
					model,
					"models (public selector)",
					fact.modelId,
				),
			};
		}
		case "product_launched": {
			const product = lookups.products.get(fact.productId);
			const launchCommand = state.commandLog.find(
				(command) =>
					command.kind === "launch_product" &&
					command.productId === fact.productId &&
					command.week === fact.week,
			);
			let sources = appendSource(
				base.sources,
				product,
				"products (public selector)",
				fact.productId,
			);
			if (launchCommand !== undefined) {
				sources = [
					...sources,
					sourceRef("commandLog", launchCommand.id, launchCommand),
				];
			}
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "launch",
				title: `Launch · ${product?.channel ?? fact.channel}`,
				summary: `Product ${fact.productId} launched on the ${humanize(fact.channel)} channel in week ${fact.week}.`,
				destination: "/game/products",
				sources,
			};
		}
		case "product_resumed": {
			const product = lookups.products.get(fact.productId);
			const modelName =
				product === undefined
					? undefined
					: lookups.models.get(product.modelId)?.name;
			const resumeCommand = state.commandLog.find(
				(command) =>
					command.kind === "product_resume" &&
					command.productId === fact.productId &&
					command.week === fact.week,
			);
			let sources = appendSource(
				base.sources,
				product,
				"products (public selector)",
				fact.productId,
			);
			if (resumeCommand !== undefined) {
				sources = [
					...sources,
					sourceRef("commandLog", resumeCommand.id, resumeCommand),
				];
			}
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "product",
				title: `Product resumed · ${humanize(fact.channel)}`,
				summary: `${modelName ?? fact.productId} resumed on the ${humanize(fact.channel)} channel in week ${fact.week}.`,
				destination: "/game/products",
				sources,
			};
		}
		case "rival_progressed": {
			const rival = state.rivals.items.find(
				(candidate) => candidate.id === fact.rivalId,
			);
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "rival",
				title: `Rival movement · ${rival?.name ?? fact.rivalId}`,
				summary: `${rival?.name ?? fact.rivalId} moved its public clock by ${signed(fact.amount)} in week ${fact.week}.`,
				destination: "/game/products",
				sources: appendSource(
					base.sources,
					rival,
					"rivals.items",
					fact.rivalId,
				),
			};
		}
		case "rival_milestone": {
			const rival = state.rivals.items.find(
				(candidate) => candidate.id === fact.rivalId,
			);
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "rival",
				title: `Rival milestone · ${rival?.name ?? fact.rivalId}`,
				summary: `${rival?.name ?? fact.rivalId} recorded ${humanize(fact.milestone)} in week ${fact.week}.`,
				destination: "/game/products",
				sources: appendSource(
					base.sources,
					rival,
					"rivals.items",
					fact.rivalId,
				),
			};
		}
		case "funding_resolved":
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "funding",
				title: `Funding review · ${humanize(fact.round)}`,
				summary: `The ${humanize(fact.round)} funding offer was ${fact.outcome} in week ${fact.week}.`,
				destination: "/game/products",
				sources: [
					...base.sources,
					sourceRef("funding", fact.round, state.funding),
				],
			};
		case "incident_occurred":
		case "incident_resolved":
			return incidentReportEvent(state, report, fact, base);
		case "milestone_reached":
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "milestone",
				title: "Milestone · First multimodal launch",
				summary: `The engine recorded the first multimodal launch milestone in week ${fact.week}.`,
				destination: "/game/products",
			};
		case "terminal":
			return {
				...base,
				id: `calendar-report-${report.id}`,
				kind: "milestone",
				title: `Run ended · ${humanize(fact.reason)}`,
				summary: `The run ended in week ${fact.week}; the terminal report lists ${fact.contributors.length} contributors.`,
				destination: "/game/products",
			};
		default:
			return null;
	}
}

function incidentReportEvent(
	state: GameState,
	report: ReturnType<typeof selectRecentReports>[number],
	fact: Extract<Fact, { kind: "incident_occurred" | "incident_resolved" }>,
	base: Omit<
		CalendarEvent,
		"id" | "kind" | "title" | "summary" | "destination"
	>,
): CalendarEvent {
	const pending = selectPendingDecisions(state).find(
		(decision) =>
			decision.kind === "incident" && decision.incident === fact.incident,
	);
	const isOccurred = fact.kind === "incident_occurred";
	return {
		...base,
		id: `calendar-report-${report.id}`,
		kind: "incident",
		title: `${isOccurred ? "Incident" : "Incident resolved"} · ${humanize(fact.incident)}`,
		summary:
			fact.kind === "incident_occurred"
				? `${humanize(fact.incident)} affected ${fact.affectedEntity}; measured ${fact.measurement} against ${fact.threshold}.`
				: `${humanize(fact.incident)} was resolved with ${humanize(fact.response)} in week ${fact.week}.`,
		destination: "/game/reports",
		pendingDecisionId: isOccurred ? pending?.id : undefined,
		sources: [
			...base.sources,
			...(pending === undefined
				? []
				: [sourceRef("decisions.pending", pending.id, pending)]),
		],
	};
}

function commandEventsForState(
	state: GameState,
	reports: Readonly<ReturnType<typeof selectRecentReports>>,
	lookups: EventLookups,
): CalendarEvent[] {
	const events: CalendarEvent[] = [];
	const launchReportKeys = new Set(
		reports
			.filter((report) => report.fact.kind === "product_launched")
			.map((report) => {
				if (report.fact.kind !== "product_launched") return "";
				return `${report.fact.productId}:${report.fact.week}`;
			}),
	);
	const resumeReportKeys = new Set(
		reports
			.filter((report) => report.fact.kind === "product_resumed")
			.map((report) => {
				if (report.fact.kind !== "product_resumed") return "";
				return `${report.fact.productId}:${report.fact.week}`;
			}),
	);
	for (const command of state.commandLog) {
		if (command.kind === "start_run") {
			events.push({
				id: `calendar-command-${command.id}`,
				kind: "run",
				status: "recorded",
				title: "Run opened",
				summary: `The ${command.setup.companyName} sandbox opened with seed ${command.seed}.`,
				startWeek: command.week,
				endWeek: command.week,
				startDay: dayForCalendarEvent(command.id),
				finishDay: dayForCalendarEvent(command.id),
				destination: "/game",
				sources: [sourceRef("commandLog", command.id, command)],
			});
			continue;
		}
		if (command.kind !== "launch_product") {
			if (command.kind !== "product_resume") continue;
			if (resumeReportKeys.has(`${command.productId}:${command.week}`))
				continue;
			const product = lookups.products.get(command.productId);
			const day = dayForCalendarEvent(command.id);
			events.push({
				id: `calendar-command-${command.id}`,
				kind: "product",
				status: "recorded",
				title: "Product resumed",
				summary: `The ${humanize(command.productId)} product resumed in week ${command.week}.`,
				startWeek: command.week,
				endWeek: command.week,
				startDay: day,
				finishDay: day,
				destination: "/game/products",
				sources: [
					sourceRef("commandLog", command.id, command),
					...appendSource(
						[],
						product,
						"products (public selector)",
						command.productId,
					),
				],
			});
			continue;
		}
		if (launchReportKeys.has(`${command.productId}:${command.week}`)) continue;
		const product = lookups.products.get(command.productId);
		const day = dayForCalendarEvent(command.id);
		events.push({
			id: `calendar-command-${command.id}`,
			kind: "launch",
			status: "recorded",
			title: `Launch · ${product?.channel ?? command.channel}`,
			summary: `The ${humanize(command.channel)} product launch was recorded by the command log in week ${command.week}.`,
			startWeek: command.week,
			endWeek: command.week,
			startDay: day,
			finishDay: day,
			destination: "/game/products",
			sources: [
				sourceRef("commandLog", command.id, command),
				...appendSource(
					[],
					product,
					"products (public selector)",
					command.productId,
				),
			],
		});
	}
	return events;
}

function decisionToCalendarEvent(
	state: GameState,
	decision: PendingDecision,
	lookups: EventLookups,
): CalendarEvent {
	const day = dayForCalendarEvent(decision.id);
	const sources: CalendarSource[] = [
		sourceRef("decisions.pending", decision.id, decision),
	];
	let title = `Decision required · ${humanize(decision.kind)}`;
	let summary = `A ${humanize(decision.kind)} decision is pending in week ${state.meta.week}.`;
	if (decision.kind === "launch" || decision.kind === "evaluation") {
		const model = lookups.models.get(decision.modelId);
		if (model !== undefined)
			sources.push(sourceRef("models (public selector)", model.id, model));
		title = `${humanize(decision.kind)} decision · ${model?.name ?? decision.modelId}`;
		summary = `${humanize(decision.kind)} decision for model ${decision.modelId} is waiting for a choice.`;
	}
	if (decision.kind === "funding") {
		sources.push(sourceRef("funding", decision.round, state.funding));
		title = `Funding decision · ${humanize(decision.round)}`;
		summary = `The ${humanize(decision.round)} funding offer is pending a decision.`;
	}
	if (decision.kind === "publication") {
		const nodeLabel = resolveEntityLabel(state, "node", decision.nodeId);
		const node = lookups.researchNodes.get(decision.nodeId);
		if (node !== undefined) {
			sources.push(
				sourceRef("research.nodes (public selector)", node.id, node),
			);
		}
		title = `Publication decision · ${nodeLabel}`;
		summary = `${nodeLabel} can be published or kept proprietary; open the command overview to resolve this pending decision.`;
	}
	if (decision.kind === "incident") {
		title = `Incident decision · ${humanize(decision.incident)}`;
		summary = `${humanize(decision.incident)} requires a response before the simulation can continue.`;
	}
	return {
		id: `calendar-decision-${decision.id}`,
		kind: "decision",
		status: "pending",
		title,
		summary,
		startWeek: state.meta.week,
		endWeek: state.meta.week,
		startDay: day,
		finishDay: day,
		destination: "/game",
		pendingDecisionId: decision.id,
		sources,
	};
}

function projectTitle(project: Project, lookups: EventLookups): string {
	switch (project.kind) {
		case "research":
			return `Research · ${lookups.researchNodes.get(project.nodeId)?.label ?? project.nodeId}`;
		case "training":
			return `Training · ${lookups.models.get(project.modelId)?.name ?? project.modelId}`;
		case "evaluation":
			return `Evaluation · ${lookups.models.get(project.modelId)?.name ?? project.modelId}`;
		case "infrastructure":
			return `Infrastructure · ${humanize(project.target)}`;
		case "model":
			return `Model design · ${lookups.models.get(project.modelId)?.name ?? project.modelId}`;
		case "product":
			return `Product work · ${humanize(project.channel)}`;
	}
}

function projectSummary(
	project: Project,
	startWeek: number,
	endWeek: number,
): string {
	if (project.status === "active") {
		return `In progress from week ${startWeek} through its indicative finish in week ${endWeek}: ${project.progress} of ${project.duration} weekly work units recorded.`;
	}
	return `Completed project span from week ${startWeek} through week ${endWeek}; the engine retains ${project.progress} of ${project.duration} work units.`;
}

function destinationForProject(kind: Project["kind"]): CalendarDestination {
	switch (kind) {
		case "research":
			return "/game/research";
		case "training":
		case "evaluation":
		case "model":
			return "/game/models";
		case "infrastructure":
		case "product":
			return "/game/teams";
	}
}

function findProjectStartCommand(
	commands: readonly CommandLogEntry[],
	project: Project,
): CommandLogEntry | undefined {
	for (let index = commands.length - 1; index >= 0; index -= 1) {
		const command = commands[index];
		if (
			(command?.kind === "assign_project" ||
				command?.kind === "design_model") &&
			command.projectId === project.id
		) {
			return command;
		}
		if (
			command?.kind === "run_evaluation" &&
			project.kind === "evaluation" &&
			command.modelId === project.modelId &&
			command.evaluation === project.evaluation
		) {
			return command;
		}
	}
	return undefined;
}

function segmentForWeek(
	event: CalendarEvent,
	week: number,
): Omit<EventSegment, "lane"> | null {
	if (week < event.startWeek || week > event.endWeek) return null;
	return {
		event,
		startDay: week === event.startWeek ? event.startDay : 1,
		finishDay: week === event.endWeek ? event.finishDay : DAY_LABELS.length,
	};
}

function addEventLanes(
	segments: readonly Omit<EventSegment, "lane">[],
): EventSegment[] {
	const laneEnds: number[] = [];
	return segments.map((segment) => {
		let lane = laneEnds.findIndex((endDay) => endDay < segment.startDay);
		if (lane === -1) lane = laneEnds.length;
		laneEnds[lane] = segment.finishDay;
		return { ...segment, lane };
	});
}

function compareCalendarEvents(
	left: CalendarEvent,
	right: CalendarEvent,
): number {
	return (
		left.startWeek - right.startWeek ||
		left.startDay - right.startDay ||
		left.endWeek - right.endWeek ||
		left.id.localeCompare(right.id)
	);
}

function appendSource(
	sources: readonly CalendarSource[],
	object: unknown,
	path: string,
	id: string,
): CalendarSource[] {
	return object === undefined
		? [...sources]
		: [...sources, sourceRef(path, id, object)];
}

function sourceRef(path: string, id: string, object: unknown): CalendarSource {
	return { path, id, object };
}

function eventAccentClass(kind: CalendarEventKind): string {
	switch (kind) {
		case "research":
		case "training":
		case "model":
			return "border-primary/45 bg-primary/10";
		case "evaluation":
		case "funding":
		case "decision":
			return "border-[var(--game-amber)]/50 bg-[var(--game-amber)]/10";
		case "launch":
		case "milestone":
			return "border-[var(--game-positive)]/50 bg-[var(--game-positive)]/10";
		case "rival":
		case "incident":
			return "border-[var(--game-negative)]/45 bg-[var(--game-negative)]/8";
		case "infrastructure":
		case "project":
		case "run":
		case "product":
			return "border-border/80 bg-background/45";
	}
}

function EventIcon({ kind }: { kind: CalendarEventKind }) {
	const className = "mt-0.5 size-3 shrink-0";
	switch (kind) {
		case "research":
			return (
				<FlaskConical
					className={cn(className, "text-primary")}
					aria-hidden="true"
				/>
			);
		case "training":
		case "model":
			return (
				<CircleDot
					className={cn(className, "text-primary")}
					aria-hidden="true"
				/>
			);
		case "evaluation":
			return (
				<ShieldAlert
					className={cn(className, "text-[var(--game-amber)]")}
					aria-hidden="true"
				/>
			);
		case "rival":
			return (
				<Radar
					className={cn(className, "text-[var(--game-negative)]")}
					aria-hidden="true"
				/>
			);
		case "launch":
		case "milestone":
			return (
				<Flag
					className={cn(className, "text-[var(--game-positive)]")}
					aria-hidden="true"
				/>
			);
		case "decision":
			return (
				<GitBranch
					className={cn(className, "text-[var(--game-amber)]")}
					aria-hidden="true"
				/>
			);
		default:
			return (
				<CalendarClock
					className={cn(className, "text-muted-foreground")}
					aria-hidden="true"
				/>
			);
	}
}

function LegendItem({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{icon}
			{label}
		</span>
	);
}

function DetailValue({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="mt-1 text-foreground">{value}</dd>
		</div>
	);
}

function destinationLabel(destination: CalendarDestination): string {
	switch (destination) {
		case "/game":
			return "command overview";
		case "/game/teams":
			return "teams and projects";
		case "/game/research":
			return "research";
		case "/game/models":
			return "models";
		case "/game/products":
			return "products";
		case "/game/reports":
			return "reports";
	}
}

function formatSourceObject(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return "Source object could not be serialized.";
	}
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function signed(value: number): string {
	return value > 0 ? `+${value}` : String(value);
}
