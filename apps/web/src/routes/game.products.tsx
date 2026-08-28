import { createFileRoute, useNavigate } from "@tanstack/react-router";

import ComputeGrid from "@/game/components/compute-grid";
import ComputePanel from "@/game/components/compute-panel";
import FundingPanel from "@/game/components/funding-panel";
import GamePage from "@/game/components/game-page";
import MarketPulse from "@/game/components/market-pulse";
import ProductPanel from "@/game/components/product-panel";
import RivalsPanel from "@/game/components/rivals-panel";
import RunResult from "@/game/components/run-result";
import { useRunState, useUiState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/products")({
	head: () => ({
		meta: [
			{ title: "Products · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Turn model readiness into operating products, watch compute demand, and keep funding and rival pressure in view.",
			},
		],
	}),
	component: ProductsRoute,
});

function ProductsRoute() {
	const game = useRunState();
	const ui = useUiState();
	const navigate = useNavigate();
	if (game.state === null) return null;

	function restartRun() {
		void navigate({ to: "/play", search: { new: "1" } });
	}

	return (
		<GamePage
			title="Products"
			description="Turn model readiness into operating products, watch compute demand, and keep funding and rival pressure in view."
		>
			<div className="space-y-6">
				<section
					aria-label="Market pulse waveform"
					className="glass-pane glass-edge overflow-hidden"
				>
					<MarketPulse className="h-20 sm:h-24" state={game.state} weeks={26} />
				</section>
				<ProductPanel
					disabled={game.actionBusy}
					onResolveDecision={(choice) => {
						void game.resolveDecision(choice);
					}}
					showLaunchDecisions={false}
					state={game.state}
				/>
				<ComputePanel state={game.state} />
				<ComputeGrid state={game.state} />
				<RivalsPanel state={game.state} />
				<FundingPanel
					disabled={game.actionBusy}
					onResolveDecision={(choice) => {
						void game.resolveDecision(choice);
					}}
					state={game.state}
				/>
				<RunResult
					disabled={game.actionBusy}
					milestoneDismissed={ui.milestoneDismissed}
					onContinueSandbox={ui.continueSandbox}
					onRestartRun={restartRun}
					state={game.state}
				/>
			</div>
		</GamePage>
	);
}
