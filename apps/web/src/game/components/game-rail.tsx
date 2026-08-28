import {
	advanceWeek,
	type ResourceBarSummary,
	selectPendingDecisions,
	selectResourceBar,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Archive,
	BookOpen,
	BrainCircuit,
	BriefcaseBusiness,
	CalendarDays,
	ChartNoAxesCombined,
	FlaskConical,
	GitBranch,
	House,
	Newspaper,
	PanelTop,
	Play,
	Sparkles,
} from "lucide-react";

import EraBadge from "@/game/components/era-badge";
import {
	countDiscoveredNotebookTiles,
	NOTEBOOK_TILE_COUNT,
} from "@/game/components/lab-notebook";
import RunMenu from "@/game/components/run-menu";
import { useRunState } from "@/game/game-state-context";

export const DESTINATIONS = [
	{
		to: "/game",
		label: "Overview",
		icon: House,
	},
	{
		to: "/game/calendar",
		label: "Calendar",
		icon: CalendarDays,
	},
	{
		to: "/game/teams",
		label: "Teams",
		icon: BriefcaseBusiness,
	},
	{
		to: "/game/research",
		label: "Research",
		icon: FlaskConical,
	},
	{
		to: "/game/models",
		label: "Models",
		icon: BrainCircuit,
	},
	{
		to: "/game/products",
		label: "Products",
		icon: ChartNoAxesCombined,
	},
	{
		to: "/game/reports",
		label: "Reports",
		icon: PanelTop,
	},
] as const;

export const ARCHIVE_DESTINATIONS = [
	{
		to: "/game/quarterly",
		label: "Quarterly",
		icon: PanelTop,
	},
	{
		to: "/game/pulse",
		label: "Pulse",
		icon: Newspaper,
	},
	{
		to: "/game/chronicle",
		label: "Chronicle",
		icon: BookOpen,
	},
	{
		to: "/game/lineage",
		label: "Lineage",
		icon: GitBranch,
	},
	{
		to: "/game/notebook",
		label: "Notebook",
		icon: BookOpen,
	},
	{
		to: "/game/agiprogram",
		label: "AGI Vault",
		icon: Sparkles,
	},
] as const;

export function isDestinationActive(
	pathname: string,
	destination: string,
): boolean {
	return destination === "/game"
		? pathname === "/game" || pathname === "/game/"
		: pathname.startsWith(destination);
}

const railNumberFormatter = new Intl.NumberFormat("en-US");

function compactResources(resources: ResourceBarSummary) {
	return [
		{
			label: "Cash",
			value: `$${railNumberFormatter.format(resources.cash)}`,
		},
		{
			label: "Insight",
			value: railNumberFormatter.format(resources.insight),
		},
		{
			label: "Trust",
			value: railNumberFormatter.format(resources.trust),
		},
		{
			label: "Hype",
			value: railNumberFormatter.format(resources.hype),
		},
	] as const;
}
export default function GameRail() {
	const location = useLocation();
	const navigate = useNavigate();
	const game = useRunState();
	const state = game.state;
	const notebookCount =
		state === null ? 0 : countDiscoveredNotebookTiles(state);
	const isDashboard =
		location.pathname === "/game" || location.pathname === "/game/";
	const resources = state === null ? null : selectResourceBar(state);
	const blockingDecision =
		state === null
			? undefined
			: selectPendingDecisions(state).find((decision) => decision.blocking);
	const isTerminal = state?.terminal.status === "lost";

	return (
		<aside
			aria-label="Game command rail"
			className="fixed inset-y-0 left-0 z-30 flex h-dvh min-h-0 w-16 min-w-16 flex-col overflow-y-auto border-border/70 border-r bg-background/75 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:w-56 lg:px-3"
		>
			<div className="flex min-w-0 flex-col gap-3">
				<Link
					aria-label="Open command overview"
					className="group flex min-h-11 items-center justify-center gap-3 rounded-lg px-1.5 text-foreground hover:bg-muted/60 lg:justify-start lg:px-2"
					to="/game"
					title="Command overview"
				>
					<span
						aria-hidden="true"
						className="relative flex size-8 shrink-0 items-center justify-center border border-primary/60 bg-primary/10 shadow-[0_0_18px_color-mix(in_srgb,var(--game-cyan)_18%,transparent)]"
					>
						<span className="size-4 rotate-45 border border-primary/80 bg-background/35" />
						<span className="absolute size-2 rotate-45 border border-[var(--game-amber)]/80" />
					</span>
					<span className="hidden min-w-0 lg:block">
						<span className="block truncate font-display font-semibold text-sm">
							{state?.company.name ?? "AI Startup Lab"}
						</span>
						<span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
							Command floor
						</span>
					</span>
				</Link>

				{state !== null ? (
					<div className="hidden lg:block">
						<EraBadge era={state.research.currentEra} size="compact" />
					</div>
				) : null}
			</div>

			<nav aria-label="Game destinations" className="mt-5 min-w-0">
				<p className="meta-label mb-2 hidden px-2 text-muted-foreground lg:block">
					Destinations
				</p>
				<div className="space-y-1">
					{DESTINATIONS.map((destination) => (
						<RailLink
							active={isDestinationActive(location.pathname, destination.to)}
							destination={destination}
							key={destination.to}
						/>
					))}
				</div>

				<div aria-hidden="true" className="my-4 border-border/70 border-t" />
				<div className="space-y-1">
					<div className="mb-2 hidden items-center gap-2 px-2 lg:flex">
						<Archive
							className="size-3.5 text-[var(--game-amber)]"
							aria-hidden="true"
						/>
						<span className="meta-label text-[var(--game-amber)]">Archive</span>
					</div>
					{ARCHIVE_DESTINATIONS.map((destination) => (
						<RailLink
							active={isDestinationActive(location.pathname, destination.to)}
							archive
							destination={destination}
							key={destination.to}
							label={
								destination.to === "/game/notebook"
									? `${destination.label} ${notebookCount}/${NOTEBOOK_TILE_COUNT}`
									: destination.label
							}
						/>
					))}
				</div>
			</nav>

			<div className="mt-auto flex min-w-0 flex-col gap-2 pt-5">
				{resources !== null && !isDashboard ? (
					<div className="min-w-0 border-border/70 border-t px-1 pt-3 lg:px-2">
						<p className="meta-label mb-2 hidden text-muted-foreground lg:block">
							Run resources
						</p>
						<div className="space-y-1">
							{compactResources(resources).map((resource) => (
								<div
									className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground"
									key={resource.label}
									title={`${resource.label}: ${resource.value}`}
								>
									<span className="hidden truncate lg:inline">
										{resource.label}
									</span>
									<span className="numeric-value truncate text-foreground">
										{resource.value}
									</span>
								</div>
							))}
						</div>
						<Button
							aria-label={
								blockingDecision === undefined
									? "Advance week"
									: "Open blocking decision"
							}
							className="mt-3 w-full justify-center px-2 lg:justify-start"
							disabled={game.actionBusy || isTerminal}
							onClick={() => {
								if (blockingDecision !== undefined) {
									void navigate({
										to: "/game",
										search: { decision: blockingDecision.id },
									});
									return;
								}
								void game.executeEngineCommand((current) =>
									advanceWeek(current),
								);
							}}
							size="sm"
							type="button"
						>
							<Play data-icon="inline-start" aria-hidden="true" />
							<span className="hidden lg:inline">
								{blockingDecision === undefined
									? "Advance week"
									: "Resolve decision"}
							</span>
						</Button>
					</div>
				) : null}
				{state !== null ? (
					<div className="hidden min-w-0 items-center gap-2 border-border/70 border-t px-2 pt-3 lg:flex">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 rounded-full bg-[var(--game-positive)] shadow-[0_0_12px_var(--game-positive)]"
						/>
						<span className="truncate text-muted-foreground text-xs">
							Week {state.meta.week} online
						</span>
					</div>
				) : null}
				<div className="flex min-w-0 items-center justify-center gap-2 lg:justify-between">
					<SessionBadge
						label={game.sessionLabel}
						status={game.session.status}
					/>
					{game.activeRun !== null ? (
						<RunMenu
							onDeleteRun={game.deleteRun}
							onNewRun={() => {
								void navigate({ to: "/play", search: { new: "1" } });
							}}
						/>
					) : null}
				</div>
			</div>
		</aside>
	);
}

type RailLinkProps = {
	active: boolean;
	archive?: boolean;
	destination: { to: string; label: string; icon: LucideIcon };
	label?: string;
};

function RailLink({
	active,
	archive = false,
	destination,
	label,
}: RailLinkProps) {
	const Icon = destination.icon;
	const text = label ?? destination.label;
	return (
		<Link
			aria-current={active ? "page" : undefined}
			aria-label={text}
			className={cn(
				"group relative flex min-h-11 min-w-0 items-center justify-center gap-3 rounded-lg px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:justify-start",
				active
					? archive
						? "bg-[var(--game-amber)]/10 text-[var(--game-amber)] hover:bg-[var(--game-amber)]/15"
						: "bg-primary/10 text-foreground hover:bg-primary/15"
					: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
			)}
			to={destination.to}
			title={text}
		>
			{active ? (
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-full",
						archive
							? "bg-gradient-to-b from-[var(--game-amber)]/40 via-[var(--game-amber)] to-[var(--game-amber)]/70"
							: "bg-gradient-to-b from-primary/40 via-primary to-primary/70",
					)}
				/>
			) : null}
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="hidden min-w-0 truncate lg:block">{text}</span>
		</Link>
	);
}

function SessionBadge({
	label,
	status,
}: {
	label: string;
	status: "loading" | "ready" | "error";
}) {
	return (
		<div
			className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1.5 text-muted-foreground"
			title={label}
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-2 shrink-0 rounded-full",
					status === "ready"
						? "bg-[var(--game-positive)] shadow-[0_0_12px_var(--game-positive)]"
						: status === "error"
							? "bg-[var(--game-negative)]"
							: "animate-pulse bg-[var(--game-amber)]",
				)}
			/>
			<span className="hidden min-w-0 break-words text-[10px] lg:inline">
				{label}
			</span>
		</div>
	);
}
