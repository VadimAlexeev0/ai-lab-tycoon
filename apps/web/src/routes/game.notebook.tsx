import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import LabNotebook from "@/game/components/lab-notebook";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useGameState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

export const Route = createFileRoute("/game/notebook")({
	head: () => ({
		meta: [
			{ title: "Lab Notebook · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Collect the first-time discoveries that make this deterministic run legible, one mechanical event at a time.",
			},
		],
	}),
	component: NotebookRoute,
});

function NotebookRoute() {
	const game = useGameState();
	const search = GameRoute.useSearch();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / lab notebook"
			title="Lab notebook"
			description="Collect the first-time discoveries that make this run legible, one mechanical event at a time."
			headerVisual={<PlaceholderBadge />}
		>
			<LabNotebook forceShowAll={search.notebook === "1"} state={game.state} />
		</GamePage>
	);
}
