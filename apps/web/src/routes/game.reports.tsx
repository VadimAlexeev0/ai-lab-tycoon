import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import ReportHistory from "@/game/components/report-history";
import ReportQueue from "@/game/components/report-queue";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/reports")({
	head: () => ({
		meta: [{ title: "Reports · AI Startup Lab Tycoon" }],
	}),
	component: ReportsRoute,
});

function ReportsRoute() {
	const game = useGameState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Module 05 / evidence"
			title="Reports"
			description="Review blocking warnings and browse the immutable mechanical fact stream produced by the simulation."
		>
			<div className="space-y-6">
				<ReportQueue
					acknowledgedIds={game.acknowledgedReportIds}
					onAcknowledge={game.acknowledgeReport}
					state={game.state}
				/>
				<ReportHistory
					acknowledgedIds={game.acknowledgedReportIds}
					state={game.state}
				/>
			</div>
		</GamePage>
	);
}
