import { advanceWeek } from "@ai-lab-tycoon/engine";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import ArtFrame from "@/game/components/art-frame";
import GamePage from "@/game/components/game-page";
import LabCore from "@/game/components/lab-core";
import OverviewPanel from "@/game/components/overview-panel";
import PriorityStrip from "@/game/components/priority-strip";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/")({
	head: () => ({
		meta: [{ title: "Command overview · AI Startup Lab Tycoon" }],
	}),
	component: DashboardRoute,
});

function DashboardRoute() {
	const game = useGameState();
	const { state } = game;
	const navigate = useNavigate();
	if (state === null) return null;

	return (
		<GamePage
			eyebrow="Module 00 / control room"
			title="Command overview"
			description="Read the lab's current health, resource posture, and next mechanical objective before choosing the next route."
		>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.34fr)]">
				<OverviewPanel state={state} />
				<aside
					aria-labelledby="your-lab-heading"
					className="surface-card relative overflow-hidden p-3"
				>
					<div className="relative z-10 flex items-start justify-between gap-3">
						<div>
							<p className="meta-label text-primary">Live system / telemetry</p>
							<h2
								id="your-lab-heading"
								className="mt-1 font-semibold text-foreground text-sm"
							>
								Your Lab
							</h2>
						</div>
						<span className="text-muted-foreground text-xs">Core 01</span>
					</div>
					<section
						aria-labelledby="lab-identity-heading"
						className="relative z-10 mt-3 overflow-hidden rounded-lg bg-background/35 ring-1 ring-white/5"
					>
						<ArtFrame
							alt=""
							className="h-24 w-full rounded-none ring-0 sm:h-28"
							src="/art-v2/four-monoliths.png"
							tint="bg-background/10"
						/>
						<div className="relative mx-2.5 -mt-10 mb-2.5 rounded-lg bg-background/80 p-2 shadow-black/20 shadow-lg ring-1 ring-white/5 backdrop-blur-sm">
							<p className="font-semibold text-primary text-xs">Lab identity</p>
							<h3
								id="lab-identity-heading"
								className="mt-1 font-semibold text-foreground text-xs"
							>
								Four signals / one lab
							</h3>
							<p className="mt-1 text-muted-foreground text-xs leading-4">
								A compact read on the lab's foundational, market, frontier, and
								safety posture.
							</p>
						</div>
					</section>
					<LabCore className="relative z-10" state={state} />
					<PriorityStrip
						disabled={game.actionBusy}
						onAdvance={() => {
							void game.executeEngineCommand((current) => advanceWeek(current));
						}}
						onResolveDecision={(decisionId) => {
							void navigate({
								to: "/game",
								search: { decision: decisionId },
							});
						}}
						state={state}
					/>
					<section
						aria-label="AGI program teaser"
						className="surface-card relative z-10 mt-2 flex items-center gap-2 bg-[var(--game-amber)]/5 px-2 py-2 ring-1 ring-[var(--game-amber)]/40"
					>
						<ArtFrame
							alt=""
							className="size-10 shrink-0 rounded-md ring-[var(--game-amber)]/40"
							src="/art-v2/sphere-amber-seed.png"
							tint="bg-[var(--game-amber)]/10"
						/>
						<div className="min-w-0">
							<p className="font-semibold text-[var(--game-amber)] text-xs">
								AGI program / seed signal
							</p>
							<p className="mt-1 text-muted-foreground text-xs leading-4">
								Keep the seed lit while the frontier compounds.
							</p>
						</div>
					</section>
					<p className="relative z-10 border-border/70 border-t pt-2 text-muted-foreground text-xs">
						Drag to rotate · telemetry is live
					</p>
				</aside>
			</div>
		</GamePage>
	);
}
