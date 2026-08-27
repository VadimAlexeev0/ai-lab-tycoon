import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import LineageGallery from "@/game/components/lineage-gallery";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/lineage")({
	head: () => ({
		meta: [{ title: "Model Lineage Gallery · AI Startup Lab Tycoon" }],
	}),
	component: LineageRoute,
});

function LineageRoute() {
	const game = useGameState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / model lineage"
			title="Model lineage gallery"
			description="Trace the public family tree of this run's models, from fresh foundations through continued and distilled descendants."
			headerVisual={<PlaceholderBadge />}
		>
			<LineageGallery state={game.state} />
		</GamePage>
	);
}
