import {
	advanceWeek,
	type ResourceBarSummary,
	selectPendingDecisions,
	selectResourceBar,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@ai-lab-tycoon/ui/components/sidebar";
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

const sidebarNumberFormatter = new Intl.NumberFormat("en-US");

export function compactResources(resources: ResourceBarSummary) {
	return [
		{
			label: "Cash",
			value: `$${sidebarNumberFormatter.format(resources.cash)}`,
		},
		{
			label: "Insight",
			value: sidebarNumberFormatter.format(resources.insight),
		},
		{
			label: "Trust",
			value: sidebarNumberFormatter.format(resources.trust),
		},
		{
			label: "Hype",
			value: sidebarNumberFormatter.format(resources.hype),
		},
	] as const;
}

export default function GameSidebar() {
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
		<Sidebar
			aria-label="Game command sidebar"
			collapsible="icon"
			side="left"
			variant="sidebar"
		>
			<SidebarHeader className="gap-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							aria-current={isDashboard ? "page" : undefined}
							aria-label="Open command overview"
							className={cn(
								"h-auto min-h-12 items-center",
								isDashboard
									? "bg-primary/10 text-foreground hover:bg-primary/15"
									: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
							)}
							isActive={isDashboard}
							render={<Link to="/game" />}
							title="Command overview"
							tooltip="Command overview"
							size="lg"
						>
							<span
								aria-hidden="true"
								className="relative flex size-8 shrink-0 items-center justify-center border border-primary/60 bg-primary/10 shadow-[0_0_18px_color-mix(in_srgb,var(--game-cyan)_18%,transparent)]"
							>
								<span className="size-4 rotate-45 border border-primary/80 bg-background/35" />
								<span className="absolute size-2 rotate-45 border border-[var(--game-amber)]/80" />
							</span>
							<span className="min-w-0 group-data-[collapsible=icon]:hidden">
								<span className="block truncate font-display font-semibold text-sm">
									{state?.company.name ?? "AI Startup Lab"}
								</span>
								<span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
									Command floor
								</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				{state !== null ? (
					<div className="px-2 group-data-[collapsible=icon]:hidden">
						<EraBadge era={state.research.currentEra} size="compact" />
					</div>
				) : null}
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Destinations</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{DESTINATIONS.map((destination) => (
								<DestinationLink
									active={isDestinationActive(
										location.pathname,
										destination.to,
									)}
									destination={destination}
									key={destination.to}
								/>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator className="my-2" />

				<SidebarGroup>
					<SidebarGroupLabel className="text-[var(--game-amber)]">
						<Archive
							aria-hidden="true"
							className="size-4 text-[var(--game-amber)]"
						/>
						<span className="text-[var(--game-amber)]">Archive</span>
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{ARCHIVE_DESTINATIONS.map((destination) => (
								<DestinationLink
									active={isDestinationActive(
										location.pathname,
										destination.to,
									)}
									archive
									badge={
										destination.to === "/game/notebook"
											? `${notebookCount}/${NOTEBOOK_TILE_COUNT}`
											: undefined
									}
									destination={destination}
									key={destination.to}
								/>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
				{resources !== null && !isDashboard ? (
					<div className="min-w-0 border-border/70 border-t px-2 pt-3 group-data-[collapsible=icon]:hidden">
						<p className="meta-label mb-2 text-muted-foreground">
							Run resources
						</p>
						<div className="space-y-1">
							{compactResources(resources).map((resource) => (
								<div
									className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground"
									key={resource.label}
									title={`${resource.label}: ${resource.value}`}
								>
									<span className="truncate">{resource.label}</span>
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
							className="mt-3 w-full justify-start"
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
							{blockingDecision === undefined
								? "Advance week"
								: "Resolve decision"}
						</Button>
					</div>
				) : null}

				{state !== null ? (
					<div className="flex min-w-0 items-center gap-2 border-border/70 border-t px-2 pt-3 group-data-[collapsible=icon]:hidden">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 rounded-full bg-[var(--game-positive)] shadow-[0_0_12px_var(--game-positive)]"
						/>
						<span className="truncate text-muted-foreground text-xs">
							Week {state.meta.week} online
						</span>
					</div>
				) : null}

				<div className="flex min-w-0 items-center justify-between gap-2">
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
			</SidebarFooter>
		</Sidebar>
	);
}

type Destination = {
	to: string;
	label: string;
	icon: LucideIcon;
};

type DestinationLinkProps = {
	active: boolean;
	archive?: boolean;
	badge?: string;
	destination: Destination;
};

function DestinationLink({
	active,
	archive = false,
	badge,
	destination,
}: DestinationLinkProps) {
	const Icon = destination.icon;
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-current={active ? "page" : undefined}
				aria-label={destination.label}
				className={cn(
					active
						? archive
							? "bg-[var(--game-amber)]/10 text-[var(--game-amber)] hover:bg-[var(--game-amber)]/15"
							: "bg-primary/10 text-foreground hover:bg-primary/15"
						: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
				)}
				isActive={active}
				render={<Link to={destination.to} />}
				title={destination.label}
				tooltip={destination.label}
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
				<Icon aria-hidden="true" className="size-4 shrink-0" />
				<span className="min-w-0 truncate group-data-[collapsible=icon]:hidden">
					{destination.label}
				</span>
			</SidebarMenuButton>
			{badge !== undefined ? (
				<SidebarMenuBadge
					aria-label={`${destination.label} discoveries`}
					title={`${destination.label}: ${badge}`}
				>
					{badge}
				</SidebarMenuBadge>
			) : null}
		</SidebarMenuItem>
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
			className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-muted-foreground"
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
			<span className="min-w-0 break-words text-[10px] group-data-[collapsible=icon]:hidden">
				{label}
			</span>
		</div>
	);
}
