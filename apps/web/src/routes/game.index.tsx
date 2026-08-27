import { advanceWeek } from "@ai-lab-tycoon/engine";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

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
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.34fr)]">
				<OverviewPanel state={state} />
				<aside
					aria-labelledby="your-lab-heading"
					className="relative overflow-hidden border border-border bg-card/70 p-3"
				>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/80 via-primary/20 to-transparent"
					/>
					<div className="relative z-10 flex items-start justify-between gap-3">
						<div>
							<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.2em]">
								Live system / telemetry
							</p>
							<h2
								id="your-lab-heading"
								className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
							>
								Your Lab
							</h2>
						</div>
						<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
							Core 01
						</span>
					</div>
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
					<p className="relative z-10 border-border/70 border-t pt-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
						Drag to rotate · telemetry is live
					</p>
				</aside>
			</div>
		</GamePage>
	);
}
