import { createFileRoute } from "@tanstack/react-router";

import ArtFrame from "@/game/components/art-frame";
import GamePage from "@/game/components/game-page";
import TeamPanel from "@/game/components/team-panel";
import { useRunState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/teams")({
	head: () => ({
		meta: [
			{ title: "Teams and projects · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Assign legal projects, monitor team progress, and cancel commitments when the run needs to pivot.",
			},
		],
	}),
	component: TeamsRoute,
});

function TeamsRoute() {
	const game = useRunState();
	if (game.state === null) return null;

	return (
		<GamePage
			title="Teams and projects"
			description="Keep every team productive: assign a legal project, monitor progress, or cancel an active commitment when the run needs to pivot."
			headerVisual={
				<ArtFrame
					alt=""
					className="size-14 shrink-0 rounded-md"
					src="/art-v2/cubes-terracotta.png"
					tint="bg-[var(--game-amber)]/10"
				/>
			}
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
