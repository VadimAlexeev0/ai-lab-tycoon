import { createFileRoute, useNavigate } from "@tanstack/react-router";

import ArtFrame from "@/game/components/art-frame";
import GamePage from "@/game/components/game-page";
import ResearchTimeline from "@/game/components/research-timeline";
import ResearchTree from "@/game/components/research-tree";
import { useGameState } from "@/game/game-state-context";
import { Route as GameRoute } from "@/routes/game";

export const Route = createFileRoute("/game/research")({
	head: () => ({
		meta: [{ title: "Research · AI Startup Lab Tycoon" }],
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
			<ResearchTree
				disabled={game.actionBusy}
				onAssignProject={game.assignProject}
				onCloseDetail={closeDetail}
				onSelectNode={selectNode}
				selectedNodeId={search.node}
				state={game.state}
			/>
		</GamePage>
	);
}
