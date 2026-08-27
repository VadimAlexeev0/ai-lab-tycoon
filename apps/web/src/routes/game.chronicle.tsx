import { createFileRoute } from "@tanstack/react-router";

import Chronicle from "@/game/components/chronicle";
import GamePage from "@/game/components/game-page";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useGameState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

export const Route = createFileRoute("/game/chronicle")({
	head: () => ({
		meta: [
			{ title: "Company Chronicle · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Read the run's mechanical facts, milestones, quiet weeks, and branches that a future replay may open.",
			},
		],
	}),
	component: ChronicleRoute,
});

function ChronicleRoute() {
	const game = useGameState();
	const search = GameRoute.useSearch();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / company chronicle"
			title="Company chronicle"
			description="Read the run as a manuscript of mechanical facts, milestones, quiet weeks, and the branches that a future replay may open."
			headerVisual={<PlaceholderBadge />}
		>
			<Chronicle
				forceDeathCertificate={search.chronicle === "1"}
				state={game.state}
			/>
		</GamePage>
	);
}
