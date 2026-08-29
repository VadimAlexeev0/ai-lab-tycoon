import {
	advanceWeek,
	type GameState,
	selectRivals,
	selectTeams,
	selectVisibleModels,
} from "@ai-lab-tycoon/engine";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import AdvanceWeekButton from "@/game/components/advance-week-button";
import GamePage from "@/game/components/game-page";
import MarketPulse from "@/game/components/market-pulse";
import OverviewHero from "@/game/components/overview-hero";
import ResourceBar from "@/game/components/resource-bar";
import RunwayWarningStrip, {
	RunwayWarningList,
} from "@/game/components/runway-warning-strip";
import WeekResolutionCard from "@/game/components/week-resolution-card";
import { deriveRunwayWarnings } from "@/game/derived/runway";
import { useWeekDigest } from "@/game/derived/use-week-digest";
import { useRunState } from "@/game/game-state-context";

const LazyLabCore = lazy(() => import("@/game/components/lab-core"));
const LazyRivalConstellation = lazy(
	() => import("@/game/components/rival-constellation"),
);

export const Route = createFileRoute("/game/")({
	head: () => ({
		meta: [
			{ title: "Command overview · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Monitor your AI lab's live health, resources, and next objective in the deterministic operations console.",
			},
		],
	}),
	component: DashboardRoute,
});

function DashboardRoute() {
	const game = useRunState();
	const { state } = game;
	const navigate = useNavigate();
	if (state === null) return null;
	const { digest, deltas } = useWeekDigest(state, game.revision);
	const runwayWarnings = deriveRunwayWarnings(state);

	function advanceFromHero() {
		void game.executeEngineCommand((current) => advanceWeek(current));
	}

	function resolveDecision(decisionId: string) {
		void navigate({
			to: "/game",
			search: { decision: decisionId },
		});
	}

	return (
		<GamePage
			title="Command overview"
			description="Read the lab's current health, resource posture, and next mechanical objective before choosing the next route."
		>
			<div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
				<div className="min-w-0 space-y-4">
					<OverviewHero
						disabled={game.actionBusy}
						onAdvance={advanceFromHero}
						onResolveDecision={resolveDecision}
						state={state}
					/>
					<ResourceBar revision={game.revision} state={state} />
					<RunwayWarningStrip warnings={runwayWarnings} />
					<WeekResolutionCard
						advanceControl={
							<AdvanceWeekButton
								className="px-0 py-0"
								onAdvanced={game.handleAdvanced}
								revision={game.revision}
								state={state}
							/>
						}
						deltas={deltas}
						digest={digest}
						marketPulse={
							<MarketPulse
								animate={false}
								className="h-16 min-h-16"
								showCurrentCash={false}
								state={state}
							/>
						}
						state={state}
					/>
				</div>
				<div className="min-w-0 space-y-4">
					<LabRail state={state} />
					<DashboardStatusCards runwayWarnings={runwayWarnings} state={state} />
				</div>
			</div>
		</GamePage>
	);
}

function LabRail({ state }: { state: GameState }) {
	return (
		<aside
			aria-labelledby="lab-rail-heading"
			className="glass-pane glass-edge overflow-hidden"
		>
			<section className="pane-section" aria-labelledby="lab-rail-heading">
				<div className="flex items-baseline justify-between gap-3">
					<div className="min-w-0">
						<p className="meta-label text-primary">Lab systems</p>
						<h2
							id="lab-rail-heading"
							className="mt-1 font-semibold text-foreground text-sm"
						>
							Your lab
						</h2>
					</div>
					<span className="shrink-0 text-right text-muted-foreground text-xs">
						Core 01
					</span>
				</div>
				<Suspense
					fallback={
						<PanelLoadingState label="Loading lab core visualization…" />
					}
				>
					<LazyLabCore className="mt-2" state={state} />
				</Suspense>
				<div className="flex items-center justify-between gap-3 border-border/70 border-t pt-3 text-xs">
					<span className="truncate font-medium text-foreground">
						{state.company.name}
					</span>
					<span className="shrink-0 text-muted-foreground">
						{state.meta.era} era
					</span>
				</div>
			</section>
			<section aria-labelledby="rival-rail-heading" className="pane-section">
				<div className="flex items-center justify-between gap-3">
					<h2
						id="rival-rail-heading"
						className="font-semibold text-foreground text-sm"
					>
						Rival constellation
					</h2>
					<span className="text-muted-foreground text-xs">Public clocks</span>
				</div>
				<Suspense
					fallback={<PanelLoadingState label="Loading rival constellation…" />}
				>
					<LazyRivalConstellation className="mt-2" state={state} />
				</Suspense>
				<RivalLeaderSummary state={state} />
			</section>
		</aside>
	);
}

function RivalLeaderSummary({ state }: { state: GameState }) {
	const rivals = selectRivals(state);
	const leader = rivals.reduce<(typeof rivals)[number] | null>(
		(current, rival) =>
			current === null || rival.progress > current.progress ? rival : current,
		null,
	);
	return (
		<p className="mt-2 text-muted-foreground text-xs leading-5">
			{leader === null
				? "No public rival clocks are active."
				: `${leader.name} leads at ${Math.min(100, Math.max(0, leader.progress))}%.`}
		</p>
	);
}

function DashboardStatusCards({
	runwayWarnings,
	state,
}: {
	runwayWarnings: ReturnType<typeof deriveRunwayWarnings>;
	state: GameState;
}) {
	const models = selectVisibleModels(state);
	const teams = selectTeams(state);
	const latestModel = models[0];
	const latestModelSource = state.models.items.find(
		(model) => model.id === latestModel?.id,
	);
	const activeProjects = teams.filter(
		(team) => team.status === "working",
	).length;

	return (
		<>
			<RunwayWarningList warnings={runwayWarnings} />
			<section
				aria-label="Lab status"
				className="glass-pane glass-edge overflow-hidden"
			>
				<div className="pane-section">
					<p className="meta-label text-primary">Status</p>
					<h2 className="mt-1 font-semibold text-foreground text-sm">
						Operating picture
					</h2>
				</div>
				<div className="pane-section grid gap-3 sm:grid-cols-2">
					<LinkStatus
						label="Latest model"
						to="/game/models"
						value={latestModel?.name ?? "No model designs"}
						detail={latestModelSource?.status ?? "Start in Models"}
					/>
					<LinkStatus
						label="Active projects"
						to="/game/teams"
						value={`${activeProjects} active`}
						detail={`${teams.length - activeProjects} idle team${teams.length - activeProjects === 1 ? "" : "s"}`}
					/>
				</div>
			</section>
		</>
	);
}

function LinkStatus({
	detail,
	label,
	to,
	value,
}: {
	detail: string;
	label: string;
	to: "/game/models" | "/game/teams";
	value: string;
}) {
	return (
		<Link
			className="group min-w-0 rounded-lg border border-transparent px-2 py-1.5 hover:border-[var(--game-hairline)] hover:bg-background/25"
			to={to}
		>
			<span className="block text-muted-foreground text-xs">{label}</span>
			<span className="mt-1 block truncate font-semibold text-foreground text-sm group-hover:text-primary">
				{value}
			</span>
			<span className="mt-0.5 block truncate text-muted-foreground text-xs">
				{detail}
			</span>
		</Link>
	);
}

function PanelLoadingState({ label }: { label: string }) {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="relative z-10 flex min-h-40 items-center justify-center border border-border/70 bg-background/35 px-3 text-center text-muted-foreground text-xs sm:min-h-56"
		>
			{label}
		</div>
	);
}
