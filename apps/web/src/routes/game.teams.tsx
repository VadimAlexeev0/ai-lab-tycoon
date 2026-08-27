import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import TeamPanel from "@/game/components/team-panel";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/teams")({
	component: TeamsRoute,
});

function TeamsRoute() {
	const game = useGameState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Module 01 / staffing"
			title="Teams and projects"
			description="Keep every team productive: assign a legal project, monitor progress, or cancel an active commitment when the run needs to pivot."
		>
			<TeamPanel
				disabled={game.actionBusy}
				onAssign={(teamId, projectId) => {
					void game.assignProject(teamId, projectId);
				}}
				onCancel={(teamId, projectId) => {
					void game.cancelProject(teamId, projectId);
				}}
				state={game.state}
			/>
		</GamePage>
	);
}
