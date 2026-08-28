import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import LineageGallery from "@/game/components/lineage-gallery";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useRunState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/lineage")({
	head: () => ({
		meta: [
			{ title: "Model Lineage Gallery · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Trace the public family tree of this run's models, from fresh foundations through continued and distilled descendants.",
			},
		],
	}),
	component: LineageRoute,
});

function LineageRoute() {
	const game = useRunState();
	if (game.state === null) return null;

	return (
		<GamePage
			title="Model lineage gallery"
			description="Trace the public family tree of this run's models, from fresh foundations through continued and distilled descendants."
			headerVisual={<PlaceholderBadge />}
		>
			<LineageGallery state={game.state} />
		</GamePage>
	);
}
