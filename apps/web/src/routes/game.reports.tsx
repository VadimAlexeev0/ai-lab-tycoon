import { createFileRoute } from "@tanstack/react-router";

import ArtFrame from "@/game/components/art-frame";
import GamePage from "@/game/components/game-page";
import ReportHistory from "@/game/components/report-history";
import ReportQueue from "@/game/components/report-queue";
import { useRunState, useUiState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/reports")({
	head: () => ({
		meta: [
			{ title: "Reports · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Review blocking warnings and browse the immutable mechanical fact stream produced by the simulation.",
			},
		],
	}),
	component: ReportsRoute,
});

function ReportsRoute() {
	const game = useRunState();
	const ui = useUiState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Module 05 / evidence"
			title="Reports"
			description="Review blocking warnings and browse the immutable mechanical fact stream produced by the simulation."
			headerVisual={
				<ArtFrame
					alt=""
					className="size-14 shrink-0 rounded-md"
					src="/art-v2/hovering-shards.png"
					tint="bg-background/10"
				/>
			}
		>
			<div className="space-y-6">
				<ReportQueue
					acknowledgedIds={ui.acknowledgedReportIds}
					onAcknowledge={ui.acknowledgeReport}
					state={game.state}
				/>
				<ReportHistory
					acknowledgedIds={ui.acknowledgedReportIds}
					state={game.state}
				/>
			</div>
		</GamePage>
	);
}
