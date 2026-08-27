import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import PlaceholderBadge from "@/game/components/placeholder-badge";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/pulse")({
	head: () => ({
		meta: [{ title: "Industry Pulse · AI Startup Lab Tycoon" }],
	}),
	component: PulseRoute,
});

function PulseRoute() {
	const game = useGameState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Archive / industry pulse"
			title="Industry pulse"
			description="A deterministic press desk for the public clocks, market shifts, and rival signals around your lab."
			headerVisual={<PlaceholderBadge />}
		>
			<section className="border border-[var(--game-amber)]/50 border-dashed bg-card/50 p-4">
				<p className="font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.16em]">
					News desk is warming up
				</p>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
					Use the debug drawer to force a deterministic headline batch without
					writing preview content into the active run.
				</p>
			</section>
		</GamePage>
	);
}
