import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import QuarterlyReview from "@/game/components/quarterly-review";
import { useRunState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

export const Route = createFileRoute("/game/quarterly")({
	head: () => ({
		meta: [
			{ title: "Quarterly Review · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Review the decisions, trade-offs, and expectations that shaped the last thirteen weeks of the run.",
			},
		],
	}),
	component: QuarterlyRoute,
});

function QuarterlyRoute() {
	const game = useRunState();
	const search = GameRoute.useSearch();
	if (game.state === null) return null;

	return (
		<GamePage
			title="Quarterly review"
			description="A narrative checkpoint for the decisions, trade-offs, and expectations that shaped the last thirteen weeks."
			headerVisual={<PlaceholderBadge />}
			contentClassName="mx-auto max-w-[70ch]"
		>
			<QuarterlyReview quarter={search.quarter} state={game.state} />
		</GamePage>
	);
}
