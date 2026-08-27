import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/quarterly")({
	head: () => ({
		meta: [{ title: "Quarterly Review · AI Startup Lab Tycoon" }],
	}),
	component: QuarterlyRoute,
});

function QuarterlyRoute() {
	const game = useGameState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / quarterly review"
			title="Quarterly review"
			description="A narrative checkpoint for the decisions, trade-offs, and expectations that shaped the last thirteen weeks."
			headerVisual={<PlaceholderBadge />}
		>
			<section className="border border-[var(--game-amber)]/50 border-dashed bg-card/50 p-4">
				<p className="font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.16em]">
					Review surface is warming up
				</p>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
					Use the debug drawer to preview the quarterly report while the engine
					contract is being assembled.
				</p>
			</section>
		</GamePage>
	);
}
