import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import OverviewPanel from "@/game/components/overview-panel";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/")({
	component: DashboardRoute,
});

function DashboardRoute() {
	const { state } = useGameState();
	if (state === null) return null;

	return (
		<GamePage
			eyebrow="Module 00 / control room"
			title="Command overview"
			description="Read the lab's current health, resource posture, and next mechanical objective before choosing the next route."
		>
			<OverviewPanel state={state} />
		</GamePage>
	);
}
