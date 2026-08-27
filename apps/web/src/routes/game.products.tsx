import { createFileRoute, useNavigate } from "@tanstack/react-router";

import ComputePanel from "@/game/components/compute-panel";
import FundingPanel from "@/game/components/funding-panel";
import GamePage from "@/game/components/game-page";
import ProductPanel from "@/game/components/product-panel";
import RivalsPanel from "@/game/components/rivals-panel";
import RunResult from "@/game/components/run-result";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/products")({
	component: ProductsRoute,
});

function ProductsRoute() {
	const game = useGameState();
	const navigate = useNavigate();
	if (game.state === null) return null;

	function restartRun() {
		game.chooseNewRun();
		void navigate({ to: "/" });
	}

	return (
		<GamePage
			eyebrow="Module 04 / market operations"
			title="Products"
			description="Turn model readiness into operating products, watch compute demand, and keep funding and rival pressure in view."
		>
			<div className="space-y-6">
				<ProductPanel
					disabled={game.actionBusy}
					onResolveDecision={(choice) => {
						void game.resolveDecision(choice);
					}}
					showLaunchDecisions={false}
					state={game.state}
				/>
				<ComputePanel state={game.state} />
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
					milestoneDismissed={game.milestoneDismissed}
					onContinueSandbox={game.continueSandbox}
					onRestartRun={restartRun}
					state={game.state}
				/>
			</div>
		</GamePage>
	);
}
