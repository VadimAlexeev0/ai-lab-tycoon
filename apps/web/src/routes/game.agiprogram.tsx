import { createFileRoute } from "@tanstack/react-router";

import AgiProgramBoard from "@/game/components/agi-program-board";
import GamePage from "@/game/components/game-page";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useRunState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

export const Route = createFileRoute("/game/agiprogram")({
	head: () => ({
		meta: [
			{ title: "AGI Program Vault · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Assemble the late-game AGI program keystones and program pieces unlocked across Eras IV–VI.",
			},
		],
	}),
	component: AgiProgramRoute,
});

function AgiProgramRoute() {
	const game = useRunState();
	const search = GameRoute.useSearch();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / AGI program"
			title="AGI program vault"
			description="A late-game assembly board for the keystones and program pieces that arrive across Eras IV–VI."
			headerVisual={<PlaceholderBadge />}
		>
			<AgiProgramBoard
				overrideSockets={search.agiOverride}
				state={game.state}
			/>
		</GamePage>
	);
}
