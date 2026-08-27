import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import GamePage from "@/game/components/game-page";
import ModelCard from "@/game/components/model-card";
import { useGameState } from "@/game/game-state-context";

const LazyModelDesigner = lazy(
	() => import("@/game/components/model-designer"),
);

export const Route = createFileRoute("/game/models")({
	head: () => ({
		meta: [
			{ title: "Models · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Design, train, and evaluate models while keeping private engine scores behind the public estimate boundary.",
			},
		],
	}),
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
				<Suspense
					fallback={<PanelLoadingState label="Loading model workbench…" />}
				>
					<LazyModelDesigner
						disabled={game.actionBusy}
						onDesign={(spec) => {
							void game.designModel(spec);
						}}
						state={game.state}
					/>
				</Suspense>
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

function PanelLoadingState({ label }: { label: string }) {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="flex min-h-48 items-center justify-center border border-border/70 bg-background/35 px-3 text-center text-muted-foreground text-xs"
		>
			{label}
		</div>
	);
}
