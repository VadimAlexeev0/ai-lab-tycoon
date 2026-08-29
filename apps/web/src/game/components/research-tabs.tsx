import type { GameState } from "@ai-lab-tycoon/engine";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@ai-lab-tycoon/ui/components/tabs";
import { lazy, Suspense, useMemo } from "react";
import { createResearchLayout } from "../derived/research-layout";
import {
	findChoiceFrontiers,
	projectResearchNodeViews,
} from "./research-lattice-data";
import ResearchList from "./research-list";
import ResearchQueue from "./research-queue";

const LazyResearchTree = lazy(
	() => import("@/game/components/research-tree-3d"),
);

export type ResearchTabsProps = {
	disabled?: boolean;
	onAssignProject: (teamId: string, projectId: string) => Promise<boolean>;
	onCloseDetail: () => void;
	onSelectNode: (nodeId: string) => void;
	selectedNodeId?: string;
	state: GameState;
};

/** The research workspace tabs: interactive lattice, semantic list, and queue. */
export default function ResearchTabs({
	disabled = false,
	onAssignProject,
	onCloseDetail,
	onSelectNode,
	selectedNodeId,
	state,
}: ResearchTabsProps) {
	const layout = useMemo(() => createResearchLayout(state), [state]);
	const nodes = useMemo(
		() => projectResearchNodeViews(state, layout),
		[layout, state],
	);
	const choiceFrontiers = useMemo(
		() => findChoiceFrontiers(layout.nodes),
		[layout.nodes],
	);

	return (
		<Tabs className="space-y-4" defaultValue="lattice">
			<TabsList
				aria-label="Research sections"
				className="w-full sm:w-fit"
				variant="line"
			>
				<TabsTrigger value="lattice">Lattice</TabsTrigger>
				<TabsTrigger value="list">List</TabsTrigger>
				<TabsTrigger value="queue">Queue</TabsTrigger>
			</TabsList>

			<TabsContent value="lattice">
				<Suspense
					fallback={
						<PanelLoadingState label="Loading research frontier map…" />
					}
				>
					<LazyResearchTree
						disabled={disabled}
						onAssignProject={onAssignProject}
						onCloseDetail={onCloseDetail}
						onSelectNode={onSelectNode}
						selectedNodeId={selectedNodeId}
						state={state}
					/>
				</Suspense>
			</TabsContent>

			<TabsContent value="list">
				<ResearchList
					choiceFrontiers={choiceFrontiers}
					nodes={nodes}
					onSelect={onSelectNode}
					selectedNodeId={selectedNodeId}
				/>
			</TabsContent>

			<TabsContent value="queue">
				<ResearchQueue
					disabled={disabled}
					onAssignProject={onAssignProject}
					state={state}
				/>
			</TabsContent>
		</Tabs>
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
