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
import OverviewHero from "@/game/components/overview-hero";
import ResourceBar from "@/game/components/resource-bar";
import WeekDigestCard from "@/game/components/week-digest-card";
import { useWeekDigest } from "@/game/derived/use-week-digest";
import { useRunState } from "@/game/game-state-context";

const LazyLabCore = lazy(() => import("@/game/components/lab-core"));

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
					<WeekDigestCard
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
						marketPulse={<MarketPulseSlotPlaceholder />}
					/>
				</div>
				<div className="min-w-0 space-y-4">
					<LabRail state={state} />
					<DashboardStatusCards state={state} />
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
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="meta-label text-primary">Lab systems</p>
						<h2
							id="lab-rail-heading"
							className="mt-1 font-semibold text-foreground text-sm"
						>
							Your lab
						</h2>
					</div>
					<span className="shrink-0 text-muted-foreground text-xs">
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
				<RivalConstellationPlaceholder state={state} />
				<RivalLeaderSummary state={state} />
			</section>
		</aside>
	);
}

function RivalConstellationPlaceholder({ state }: { state: GameState }) {
	const rivals = selectRivals(state);
	return (
		<div
			aria-hidden="true"
			className="relative mt-2 h-36 overflow-hidden rounded-lg bg-background/25"
			data-three-slot="rival-constellation"
		>
			<div className="absolute inset-x-8 top-1/2 border-[var(--game-hairline)] border-t" />
			<span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20 shadow-[0_0_18px_color-mix(in_srgb,var(--game-cyan)_35%,transparent)]" />
			{rivals.map((rival, index) => (
				<span
					className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border border-primary/60 bg-primary/30"
					key={rival.id}
					style={{
						left: `${20 + (index * 60) / Math.max(1, rivals.length - 1)}%`,
						opacity: 0.35 + Math.min(0.65, Math.max(0, rival.progress) / 100),
					}}
				/>
			))}
		</div>
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

function DashboardStatusCards({ state }: { state: GameState }) {
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
			{state.warnings.length > 0 ? (
				<section
					aria-label="Run warnings"
					className="glass-pane border-[var(--game-negative)]/45 bg-[var(--game-negative)]/8 px-3 py-3"
					role="status"
				>
					<p className="meta-label text-[var(--game-negative)]">Run warning</p>
					<ul className="mt-2 space-y-1 text-muted-foreground text-xs">
						{state.warnings.map((warning) => (
							<li className="flex items-center gap-2" key={warning.code}>
								<span
									aria-hidden="true"
									className="size-1.5 shrink-0 rounded-full bg-[var(--game-negative)]"
								/>
								{humanizeWarning(warning.code)} · {warning.severity}
							</li>
						))}
					</ul>
				</section>
			) : null}
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

function MarketPulseSlotPlaceholder() {
	return (
		<div
			className="flex h-12 min-w-24 flex-col justify-center border-[var(--game-hairline)] border-l pl-3"
			data-market-pulse-slot="true"
			role="img"
			aria-label="Market pulse slot"
		>
			<span className="meta-label text-[var(--game-amber)]">Market pulse</span>
			<span className="mt-1 text-muted-foreground text-xs">Ledger signal</span>
		</div>
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

function humanizeWarning(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
