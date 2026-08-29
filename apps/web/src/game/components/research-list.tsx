import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { GitFork } from "lucide-react";

import { ERA_LABELS, ERA_ORDER } from "@/game/components/era-badge";

import {
	getResearchStatusVisual,
	type ResearchNodeView,
} from "./research-lattice-data";

export type ResearchListProps = {
	choiceFrontiers: readonly string[];
	nodes: readonly ResearchNodeView[];
	onSelect: (nodeId: string, trigger?: HTMLElement) => void;
	reason?: string;
	selectedNodeId?: string;
};

/** The calm, semantic research catalogue shared by fallback and List views. */
export function ResearchList({
	choiceFrontiers,
	nodes,
	onSelect,
	reason,
	selectedNodeId,
}: ResearchListProps) {
	const choiceSet = new Set(choiceFrontiers);
	return (
		<div className="research-lattice-fallback" data-research-fallback="true">
			{reason ? (
				<p className="research-lattice-fallback__notice" role="status">
					{reason}
				</p>
			) : null}
			<ul
				aria-label="Research fallback list"
				className="research-lattice-fallback__eras"
			>
				{ERA_ORDER.map((era) => {
					const eraNodes = nodes.filter((node) => node.era === era);
					return (
						<li className="research-lattice-fallback__era" key={era}>
							<h3 className="research-lattice-fallback__era-title">
								{ERA_LABELS[era]}
							</h3>
							<ul aria-label={`${ERA_LABELS[era]} research nodes`}>
								{eraNodes.map((node) => {
									const isChoice =
										node.exclusiveGroup !== undefined &&
										choiceSet.has(node.exclusiveGroup) &&
										node.status === "available";
									return (
										<li key={node.id}>
											<FallbackNodeButton
												isChoice={isChoice}
												node={node}
												onSelect={onSelect}
												selected={selectedNodeId === node.id}
											/>
										</li>
									);
								})}
							</ul>
						</li>
					);
				})}
			</ul>
			{choiceFrontiers.length > 0 ? (
				<p className="research-lattice-choice-hint" role="note">
					<GitFork className="size-3.5 shrink-0" aria-hidden="true" />
					Choose one path — locks the other.
				</p>
			) : null}
		</div>
	);
}

function FallbackNodeButton({
	isChoice,
	node,
	onSelect,
	selected,
}: {
	isChoice: boolean;
	node: ResearchNodeView;
	onSelect: (nodeId: string, trigger?: HTMLElement) => void;
	selected: boolean;
}) {
	const visual = getResearchStatusVisual(node.status);
	const prerequisiteLabel = node.prerequisites.map(humanize).join(", ");
	return (
		<button
			aria-label={`${node.label}; ${node.insightCost} Insight; ${visual.label}`}
			aria-pressed={selected}
			className={cn(
				"research-lattice-fallback__node",
				visual.className,
				isChoice && "research-lattice-fallback__node--choice",
				selected && "research-lattice-fallback__node--selected",
			)}
			data-research-card="true"
			data-research-status={node.status}
			onClick={(event) => onSelect(node.id, event.currentTarget)}
			type="button"
		>
			<span className="min-w-0 text-left">
				<span className="block truncate font-medium text-foreground text-xs">
					{node.label}
				</span>
				<span className="mt-1 block text-muted-foreground text-xs">
					{visual.announcement}
				</span>
				<span className="mt-1 block text-muted-foreground text-xs">
					Prerequisites: {prerequisiteLabel || "None"}
				</span>
			</span>
			<span className="flex shrink-0 flex-col items-end gap-1 text-xs">
				<span className="text-[var(--game-amber)]">
					{node.insightCost} Insight
				</span>
				<span aria-hidden="true" className="text-base leading-none">
					{visual.icon}
				</span>
				{isChoice ? <span className="lattice-choice-chip">Choice</span> : null}
			</span>
		</button>
	);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export default ResearchList;
