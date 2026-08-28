import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import { IndustryPulse } from "@/game/components/news-ticker";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useRunState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

export const Route = createFileRoute("/game/pulse")({
	head: () => ({
		meta: [
			{ title: "Industry Pulse · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Read a deterministic press desk of public clocks, market shifts, and rival signals around your lab.",
			},
		],
	}),
	component: PulseRoute,
});

function PulseRoute() {
	const game = useRunState();
	const search = GameRoute.useSearch();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / industry pulse"
			title="Industry pulse"
			description="A deterministic press desk for the public clocks, market shifts, and rival signals around your lab."
			headerVisual={<PlaceholderBadge />}
		>
			<IndustryPulse
				rivalProgressPct={search.rivalProgress}
				state={game.state}
			/>
		</GamePage>
	);
}
