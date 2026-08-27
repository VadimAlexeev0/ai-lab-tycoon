import { createFileRoute } from "@tanstack/react-router";

import GamePage from "@/game/components/game-page";
import ModelCard from "@/game/components/model-card";
import ModelDesigner from "@/game/components/model-designer";
import { useGameState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/models")({
	component: ModelsRoute,
});

function ModelsRoute() {
	const game = useGameState();
	if (game.state === null) return null;

	return (
		<GamePage
			eyebrow="Module 03 / model workbench"
			title="Models"
			description="Design, train, and evaluate models while keeping private engine scores behind the public estimate boundary."
		>
			<div className="space-y-6">
				<ModelDesigner
					disabled={game.actionBusy}
					onDesign={(spec) => {
						void game.designModel(spec);
					}}
					state={game.state}
				/>
				<ModelCard
					disabled={game.actionBusy}
					onEvaluate={(modelId, evaluation) => {
						void game.evaluateModel(modelId, evaluation);
					}}
					state={game.state}
				/>
			</div>
		</GamePage>
	);
}
