import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import ArtFrame from "@/game/components/art-frame";
import GamePage from "@/game/components/game-page";
import ResearchTimeline from "@/game/components/research-timeline";
import { useGameState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

const LazyResearchTree = lazy(() => import("@/game/components/research-tree"));

export const Route = createFileRoute("/game/research")({
	head: () => ({
		meta: [
			{ title: "Research · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Follow the engine's research frontier from foundational work to the multimodal era, then assign the next project.",
			},
		],
	}),
	component: ResearchRoute,
});

function ResearchRoute() {
	const game = useGameState();
	const search = GameRoute.useSearch();
	const navigate = useNavigate({ from: "/game/research" });
	if (game.state === null) return null;

	function selectNode(nodeId: string) {
		void navigate({
			search: (current) => ({ ...current, node: nodeId }),
		});
	}

	function closeDetail() {
		void navigate({
			replace: true,
			search: (current) => ({ ...current, node: undefined }),
		});
	}

	return (
		<GamePage
			eyebrow="Module 02 / frontier map"
			title="Research"
			description="Follow the engine's layered research DAG from foundational work to the multimodal frontier. Select any node to inspect its economics and assign a team."
			eraState={game.state}
			headerVisual={
				<>
					<ResearchTimeline state={game.state} />
					<ArtFrame
						alt=""
						className="size-12 shrink-0 rounded-md"
						src="/art-v2/light-prism.png"
						tint="bg-primary/10"
					/>
				</>
			}
		>
			<Suspense
				fallback={<PanelLoadingState label="Loading research frontier map…" />}
			>
				<LazyResearchTree
					disabled={game.actionBusy}
					onAssignProject={game.assignProject}
					onCloseDetail={closeDetail}
					onSelectNode={selectNode}
					selectedNodeId={search.node}
					state={game.state}
				/>
			</Suspense>
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
