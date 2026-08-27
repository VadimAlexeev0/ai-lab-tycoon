import {
	type GameState,
	selectResearchNodes,
	type VisibleResearchNode,
} from "@ai-lab-tycoon/engine";
import { Check, Lightbulb, Lock, Play } from "lucide-react";

const ERA_ORDER = ["text", "assistant", "multimodal"] as const;

export type ResearchPanelProps = {
	state: GameState;
};

/** A readable horizontal research catalogue; availability never relies on color alone. */
export default function ResearchPanel({ state }: ResearchPanelProps) {
	const visibleNodes = selectResearchNodes(state);
	const nodeById = new Map(state.research.nodes.map((node) => [node.id, node]));
	const availableProjects = new Map(
		state.projects.items
			.filter((project) => project.kind === "research")
			.map((project) => [project.nodeId, project]),
	);

	return (
		<section aria-labelledby="research-panel-heading" className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<p className="font-semibold text-primary text-xs">
						Research / frontier
					</p>
					<h2
						id="research-panel-heading"
						className="mt-1 font-semibold text-foreground text-sm"
					>
						Choose the next unlock
					</h2>
				</div>
				<span className="border border-primary/30 bg-primary/5 px-2 py-1 text-primary text-xs">
					Era: {state.research.currentEra}
				</span>
			</div>

			<ul
				aria-label="Research nodes"
				className="grid auto-cols-[minmax(15rem,19rem)] grid-flow-col gap-3 overflow-x-auto pb-2"
			>
				{visibleNodes.map((node) => {
					const source = nodeById.get(node.id);
					if (source === undefined) return null;
					return (
						<li className="min-w-0" key={node.id}>
							<ResearchCard
								node={node}
								project={availableProjects.get(node.id)}
								source={source}
								state={state}
							/>
						</li>
					);
				})}
			</ul>
			<p className="text-muted-foreground text-xs">
				Select a research project from an idle team to spend Insight and advance
				this catalogue.
			</p>
		</section>
	);
}

function ResearchCard({
	node,
	project,
	source,
	state,
}: {
	node: VisibleResearchNode;
	project: GameState["projects"]["items"][number] | undefined;
	source: GameState["research"]["nodes"][number];
	state: GameState;
}) {
	const missingPrerequisites = source.prerequisites.filter(
		(prerequisite) =>
			!state.research.nodes.some(
				(candidate) =>
					candidate.id === prerequisite && candidate.status === "completed",
			),
	);
	const eraLocked =
		ERA_ORDER.indexOf(source.era) >
		ERA_ORDER.indexOf(state.research.currentEra);
	const status = node.status;
	const detail =
		status === "completed"
			? "Completed — this unlock is active."
			: project?.status === "active"
				? `In progress — ${project.progress} / ${project.duration} weeks.`
				: eraLocked
					? `Locked — requires the ${source.era} era.`
					: missingPrerequisites.length > 0
						? `Locked — requires ${missingPrerequisites.map(humanize).join(", ")}.`
						: "Available — assign a team to begin.";

	return (
		<article
			aria-label={`${humanize(source.id)} research node`}
			className="surface-card flex min-h-52 flex-col bg-background/35 p-3"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="text-muted-foreground text-xs">
						{humanize(source.branch)}
					</p>
					<h3 className="mt-1 font-medium text-foreground text-sm leading-5">
						{humanize(source.id)}
					</h3>
				</div>
				<StatusBadge status={status} />
			</div>

			<div className="mt-4 grid grid-cols-2 gap-2 border-border/70 border-y py-2 text-xs">
				<span className="text-muted-foreground">
					Era <strong className="ml-1 text-foreground">{source.era}</strong>
				</span>
				<span className="text-muted-foreground">
					Cost{" "}
					<strong className="ml-1 text-[var(--game-amber)]">
						{node.insightCost} Insight
					</strong>
				</span>
			</div>

			<p className="mt-3 flex-1 text-muted-foreground text-xs leading-5">
				{detail}
			</p>
			{source.prerequisites.length > 0 ? (
				<p className="mt-2 flex items-start gap-1.5 text-muted-foreground text-xs leading-4">
					<Lightbulb className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
					<span>
						Prerequisite: {source.prerequisites.map(humanize).join(", ")}
					</span>
				</p>
			) : (
				<p className="mt-2 flex items-center gap-1.5 text-muted-foreground text-xs">
					<Play className="size-3" aria-hidden="true" />
					No prerequisite
				</p>
			)}
		</article>
	);
}

function StatusBadge({ status }: { status: VisibleResearchNode["status"] }) {
	const content =
		status === "completed"
			? {
					label: "Completed",
					icon: Check,
					className: "text-[var(--game-positive)]",
				}
			: status === "available"
				? { label: "Available", icon: Play, className: "text-primary" }
				: {
						label: "Locked",
						icon: Lock,
						className: "text-muted-foreground",
					};
	const Icon = content.icon;
	return (
		<span
			className={`inline-flex shrink-0 items-center gap-1 border border-border/70 px-2 py-1 font-semibold text-xs ${content.className}`}
		>
			<Icon className="size-3" aria-hidden="true" />
			{content.label}
		</span>
	);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
