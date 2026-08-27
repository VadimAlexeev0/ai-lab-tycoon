import {
	type GameState,
	selectResearchNodes,
	selectTeams,
	type VisibleResearchNode,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import {
	Check,
	ChevronRight,
	CircleDashed,
	CircleDot,
	Info,
	LockKeyhole,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const ERA_ORDER = ["text", "assistant", "multimodal"] as const;
const BRANCH_ORDER = ["models", "infrastructure", "products_safety"] as const;
const ERA_LABELS: Record<(typeof ERA_ORDER)[number], string> = {
	text: "Text era",
	assistant: "Assistant era",
	multimodal: "Multimodal era",
};
const CARD_WIDTH = 300;
const CARD_HEIGHT = 104;
const ERA_WIDTH = 360;
const CANVAS_PADDING = 28;

type ResearchNodeState = "locked" | "available" | "in-progress" | "completed";
type ResearchProject = Extract<
	GameState["projects"]["items"][number],
	{ kind: "research" }
>;

type PositionedResearchNode = {
	node: VisibleResearchNode;
	source: GameState["research"]["nodes"][number];
	project: ResearchProject | undefined;
	state: ResearchNodeState;
	progress: number;
	tier: number;
	x: number;
	y: number;
};

export type ResearchTreeProps = {
	state: GameState;
	disabled?: boolean;
	selectedNodeId?: string;
	onSelectNode: (nodeId: string) => void;
	onCloseDetail: () => void;
	onAssignProject: (teamId: string, projectId: string) => Promise<boolean>;
};

export default function ResearchTree({
	disabled = false,
	onAssignProject,
	onCloseDetail,
	onSelectNode,
	selectedNodeId,
	state,
}: ResearchTreeProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		scrollLeft: number;
	} | null>(null);
	const [isPanning, setIsPanning] = useState(false);
	const layout = useMemo(() => createResearchLayout(state), [state]);
	const selectedNode = layout.nodes.find(
		(node) => node.node.id === selectedNodeId,
	);

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		const viewport = viewportRef.current;
		if (viewport === null) return;
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			scrollLeft: viewport.scrollLeft,
		};
		viewport.setPointerCapture(event.pointerId);
		setIsPanning(true);
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		const viewport = viewportRef.current;
		const drag = dragRef.current;
		if (
			viewport === null ||
			drag === null ||
			drag.pointerId !== event.pointerId
		)
			return;
		viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
	}

	function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
		const viewport = viewportRef.current;
		if (viewport?.hasPointerCapture(event.pointerId)) {
			viewport.releasePointerCapture(event.pointerId);
		}
		dragRef.current = null;
		setIsPanning(false);
	}

	return (
		<section aria-labelledby="research-tree-heading" className="space-y-4">
			<style>{RESEARCH_TREE_STYLES}</style>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Research / frontier map
					</p>
					<h2
						id="research-tree-heading"
						className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
					>
						Trace the research DAG
					</h2>
				</div>
				<span className="border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-[10px] text-primary uppercase tracking-[0.12em]">
					Current era: {state.research.currentEra}
				</span>
			</div>
			<p className="max-w-3xl text-muted-foreground text-xs leading-5">
				Each card is an engine research node. Read left-to-right by era, then
				follow the curved prerequisite paths. Drag or scroll the map on narrow
				screens.
			</p>

			<div
				aria-labelledby="research-tree-heading"
				className={cn(
					"select-none overflow-x-auto overscroll-x-contain border border-border bg-background/35",
					isPanning ? "cursor-grabbing" : "cursor-grab",
				)}
				onPointerCancel={handlePointerEnd}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerEnd}
				ref={viewportRef}
				style={{ touchAction: "pan-y" }}
			>
				<div
					className="relative"
					style={{ height: layout.height, width: layout.width }}
				>
					{ERA_ORDER.map((era, index) => (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute top-0 border-border/70 border-r px-1 py-3"
							key={era}
							style={{
								height: layout.height,
								left: index * ERA_WIDTH,
								width: ERA_WIDTH,
							}}
						>
							<div className="flex items-center gap-2 font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.16em]">
								<span className="text-muted-foreground">0{index + 1}</span>
								{ERA_LABELS[era]}
							</div>
							<div className="mt-1 font-mono text-[9px] text-muted-foreground uppercase tracking-[0.1em]">
								Era column / tier depth
							</div>
						</div>
					))}

					<svg
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 overflow-visible text-primary/50"
						viewBox={`0 0 ${layout.width} ${layout.height}`}
					>
						{layout.nodes.flatMap((target) =>
							target.source.prerequisites.flatMap((prerequisiteId) => {
								const source = layout.nodes.find(
									(candidate) => candidate.node.id === prerequisiteId,
								);
								if (source === undefined) return [];
								return [
									<path
										className={cn(
											"research-connector",
											target.state === "available" ||
												target.state === "in-progress"
												? "research-connector-available"
												: undefined,
										)}
										d={connectorPath(source, target)}
										fill="none"
										key={`${prerequisiteId}-${target.node.id}`}
										stroke="currentColor"
										strokeLinecap="round"
										strokeWidth="1.5"
									/>,
								];
							}),
						)}
					</svg>

					{layout.nodes.map((positioned) => (
						<ResearchNodeCard
							key={positioned.node.id}
							node={positioned}
							onSelect={onSelectNode}
							selected={positioned.node.id === selectedNodeId}
						/>
					))}
				</div>
			</div>

			<div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
				<LegendIcon icon={<LockKeyhole className="size-3" />} label="Locked" />
				<LegendIcon
					icon={<CircleDashed className="size-3" />}
					label="Available"
				/>
				<LegendIcon
					icon={<CircleDot className="size-3" />}
					label="In progress"
				/>
				<LegendIcon icon={<Check className="size-3" />} label="Completed" />
			</div>
			{selectedNode ? (
				<ResearchDetailPane
					disabled={disabled}
					node={selectedNode}
					onAssignProject={onAssignProject}
					onClose={onCloseDetail}
					state={state}
				/>
			) : null}
		</section>
	);
}

function ResearchNodeCard({
	node,
	onSelect,
	selected,
}: {
	node: PositionedResearchNode;
	onSelect: (nodeId: string) => void;
	selected: boolean;
}) {
	const StatusIcon =
		node.state === "completed"
			? Check
			: node.state === "in-progress"
				? CircleDot
				: node.state === "available"
					? CircleDashed
					: LockKeyhole;
	return (
		<button
			aria-label={`${humanize(node.node.id)} research node, ${node.state}`}
			aria-pressed={selected}
			className={cn(
				"absolute flex flex-col gap-2 border bg-card p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
				node.state === "completed"
					? "border-[var(--game-positive)]/60 bg-[var(--game-positive)]/5"
					: node.state === "available"
						? "research-available border-primary/80"
						: node.state === "in-progress"
							? "border-primary/70 bg-primary/5"
							: "frost-lock border-border/70",
				selected ? "ring-2 ring-primary" : undefined,
			)}
			data-research-state={node.state}
			onClick={() => onSelect(node.node.id)}
			style={{
				height: CARD_HEIGHT,
				left: node.x,
				top: node.y,
				width: CARD_WIDTH,
			}}
			type="button"
		>
			<div className="flex min-w-0 items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.1em]">
						{humanize(node.source.branch)}
					</p>
					<h3 className="mt-1 truncate font-medium text-foreground text-xs">
						{humanize(node.node.id)}
					</h3>
				</div>
				<StatusIcon
					className={cn(
						"size-4 shrink-0",
						node.state === "completed"
							? "text-[var(--game-positive)]"
							: node.state === "available" || node.state === "in-progress"
								? "text-primary"
								: "text-muted-foreground",
					)}
					aria-hidden="true"
				/>
			</div>
			<div className="mt-auto flex items-center justify-between gap-2 border-border/70 border-t pt-2 font-mono text-[9px] text-muted-foreground uppercase tracking-[0.08em]">
				<span>Tier {node.tier}</span>
				<span className="text-[var(--game-amber)]">
					{node.node.insightCost} Insight
				</span>
			</div>
			{node.state === "in-progress" ? (
				<ProgressArc progress={node.progress} />
			) : null}
		</button>
	);
}

function ProgressArc({ progress }: { progress: number }) {
	const circumference = 2 * Math.PI * 8;
	const offset = circumference * (1 - progress / 100);
	return (
		<span
			aria-label={`Research progress ${progress}%`}
			className="absolute right-2 bottom-2"
			role="img"
		>
			<svg aria-hidden="true" className="size-5 -rotate-90" viewBox="0 0 20 20">
				<circle
					cx="10"
					cy="10"
					fill="none"
					r="8"
					stroke="currentColor"
					strokeOpacity="0.2"
					strokeWidth="2"
				/>
				<circle
					cx="10"
					cy="10"
					fill="none"
					r="8"
					stroke="currentColor"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					strokeWidth="2"
				/>
			</svg>
		</span>
	);
}

function ResearchDetailPane({
	disabled,
	node,
	onAssignProject,
	onClose,
	state,
}: {
	disabled: boolean;
	node: PositionedResearchNode;
	onAssignProject: (teamId: string, projectId: string) => Promise<boolean>;
	onClose: () => void;
	state: GameState;
}) {
	const idleTeams = selectTeams(state).filter((team) => team.status === "idle");
	const [teamId, setTeamId] = useState(idleTeams[0]?.id ?? "");
	const researchProject =
		node.project?.status === "available" ? node.project : undefined;

	useEffect(() => {
		if (!idleTeams.some((team) => team.id === teamId)) {
			setTeamId(idleTeams[0]?.id ?? "");
		}
	}, [idleTeams, teamId]);

	async function assignSelectedProject() {
		if (researchProject === undefined || teamId.length === 0) return;
		const assigned = await onAssignProject(teamId, researchProject.id);
		if (assigned) onClose();
	}

	return (
		<aside
			aria-labelledby="research-detail-heading"
			className="fixed inset-y-0 right-0 z-[45] flex w-full max-w-md flex-col overflow-y-auto border-border border-l bg-card p-4 shadow-2xl sm:p-5"
		>
			<div className="flex items-start justify-between gap-3 border-border/70 border-b pb-3">
				<div className="min-w-0">
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Research node detail
					</p>
					<h2
						id="research-detail-heading"
						className="mt-1 font-mono font-semibold text-base text-foreground uppercase tracking-[0.08em]"
					>
						{humanize(node.node.id)}
					</h2>
				</div>
				<button
					aria-label="Close research node detail"
					className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={onClose}
					type="button"
				>
					<X className="size-4" aria-hidden="true" />
				</button>
			</div>

			<div className="mt-4 grid grid-cols-2 gap-2 border-border/70 border-b pb-3 font-mono text-[10px] uppercase tracking-[0.1em]">
				<DetailValue label="Status" value={node.state} />
				<DetailValue label="Tier" value={`${node.tier}`} />
				<DetailValue label="Cost" value={`${node.node.insightCost} Insight`} />
				<DetailValue label="Era" value={node.source.era} />
			</div>

			<section
				className="mt-4 space-y-2"
				aria-labelledby="research-effects-heading"
			>
				<h3
					id="research-effects-heading"
					className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Effects
				</h3>
				<div className="flex items-start gap-2 border border-primary/25 bg-primary/5 px-3 py-2 text-muted-foreground text-xs leading-5">
					<Info
						className="mt-0.5 size-3.5 shrink-0 text-primary"
						aria-hidden="true"
					/>
					<p>{effectForNode(node.source.branch, node.source.era)}</p>
				</div>
			</section>

			<section
				className="mt-5 space-y-2"
				aria-labelledby="research-prereqs-heading"
			>
				<h3
					id="research-prereqs-heading"
					className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Prerequisites
				</h3>
				{node.source.prerequisites.length > 0 ? (
					<ul className="space-y-1.5">
						{node.source.prerequisites.map((prerequisite) => {
							const completed = state.research.nodes.some(
								(candidate) =>
									candidate.id === prerequisite &&
									candidate.status === "completed",
							);
							return (
								<li
									className="flex items-center justify-between gap-2 border border-border/70 px-2.5 py-2 text-xs"
									key={prerequisite}
								>
									<span className="min-w-0 truncate text-foreground">
										{humanize(prerequisite)}
									</span>
									<span
										className={cn(
											"shrink-0 font-mono text-[9px] uppercase tracking-[0.08em]",
											completed
												? "text-[var(--game-positive)]"
												: "text-[var(--game-amber)]",
										)}
									>
										{completed ? "Complete" : "Open"}
									</span>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="border border-border/70 px-2.5 py-2 text-muted-foreground text-xs">
						No prerequisites — this is an entry node.
					</p>
				)}
			</section>

			<section
				className="mt-5 space-y-2 border-border/70 border-t pt-4"
				aria-labelledby="research-assign-heading"
			>
				<h3
					id="research-assign-heading"
					className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Assign team
				</h3>
				{node.state === "available" && researchProject !== undefined ? (
					<>
						<label className="sr-only" htmlFor="research-team-select">
							Choose an idle team
						</label>
						<select
							className="h-10 w-full border border-input bg-background px-2 text-foreground text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
							disabled={disabled || idleTeams.length === 0}
							id="research-team-select"
							onChange={(event) => setTeamId(event.target.value)}
							value={teamId}
						>
							<option value="">Choose an idle team…</option>
							{idleTeams.map((team) => (
								<option key={team.id} value={team.id}>
									{team.name} · {team.id}
								</option>
							))}
						</select>
						<Button
							disabled={
								disabled || teamId.length === 0 || idleTeams.length === 0
							}
							onClick={() => void assignSelectedProject()}
							type="button"
						>
							Assign research team
							<ChevronRight data-icon="inline-end" aria-hidden="true" />
						</Button>
						<p className="text-[10px] text-muted-foreground leading-4">
							This spends {node.node.insightCost} Insight through the existing
							assign-project command.
						</p>
					</>
				) : node.state === "in-progress" ? (
					<p className="border border-primary/25 bg-primary/5 px-3 py-2 text-muted-foreground text-xs leading-5">
						A team is already working this node: {node.progress}% complete.
					</p>
				) : node.state === "completed" ? (
					<p className="border border-[var(--game-positive)]/30 bg-[var(--game-positive)]/5 px-3 py-2 text-muted-foreground text-xs leading-5">
						This research effect is active in the engine state.
					</p>
				) : (
					<p className="border border-border/70 bg-background/35 px-3 py-2 text-muted-foreground text-xs leading-5">
						Complete the prerequisites and era gate before a team can be
						assigned.
					</p>
				)}
			</section>
		</aside>
	);
}

function DetailValue({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-muted-foreground">{label}</p>
			<p className="mt-1 text-foreground">{value}</p>
		</div>
	);
}

function LegendIcon({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{icon}
			{label}
		</span>
	);
}

function createResearchLayout(state: GameState): {
	nodes: PositionedResearchNode[];
	width: number;
	height: number;
} {
	const visibleNodes = selectResearchNodes(state);
	const sourceById = new Map(
		state.research.nodes.map((node) => [node.id, node]),
	);
	const projectByNodeId = new Map(
		state.projects.items
			.filter(
				(project): project is ResearchProject => project.kind === "research",
			)
			.map((project) => [project.nodeId, project]),
	);
	const depthMemo = new Map<string, number>();
	const nodesByEra = new Map<
		(typeof ERA_ORDER)[number],
		VisibleResearchNode[]
	>();
	for (const era of ERA_ORDER) nodesByEra.set(era, []);
	for (const node of visibleNodes) {
		nodesByEra.get(nodeEra(state, node.id))?.push(node);
	}

	const positioned: PositionedResearchNode[] = [];
	let maxRow = 0;
	for (const era of ERA_ORDER) {
		const eraNodes = (nodesByEra.get(era) ?? []).sort((left, right) => {
			const depthDifference =
				depthFor(left.id, sourceById, depthMemo) -
				depthFor(right.id, sourceById, depthMemo);
			if (depthDifference !== 0) return depthDifference;
			return branchIndex(left.branch) - branchIndex(right.branch);
		});
		const branchCounts = new Map<string, number>();
		for (const node of eraNodes) {
			const source = sourceById.get(node.id);
			if (source === undefined) continue;
			const branch = branchIndex(node.branch);
			const localIndex = branchCounts.get(node.branch) ?? 0;
			branchCounts.set(node.branch, localIndex + 1);
			const row = branch * 4 + localIndex;
			maxRow = Math.max(maxRow, row);
			const project = projectByNodeId.get(node.id);
			const activeProject = project?.status === "active" ? project : undefined;
			positioned.push({
				node,
				project,
				progress:
					activeProject === undefined
						? 0
						: Math.round(
								(activeProject.progress / activeProject.duration) * 100,
							),
				source,
				state: activeProject === undefined ? node.status : "in-progress",
				tier: depthFor(node.id, sourceById, depthMemo) + 1,
				x: ERA_ORDER.indexOf(era) * ERA_WIDTH + CANVAS_PADDING,
				y: 42 + row * 118,
			});
		}
	}

	return {
		height: Math.max(310, 42 + (maxRow + 1) * 118 + 28),
		nodes: positioned,
		width: ERA_ORDER.length * ERA_WIDTH,
	};
}

function nodeEra(state: GameState, nodeId: string): (typeof ERA_ORDER)[number] {
	const era = state.research.nodes.find((node) => node.id === nodeId)?.era;
	return era === "assistant" || era === "multimodal" ? era : "text";
}

function branchIndex(branch: string): number {
	const index = BRANCH_ORDER.indexOf(branch as (typeof BRANCH_ORDER)[number]);
	return index === -1 ? 0 : index;
}

function depthFor(
	id: string,
	nodesById: Map<string, GameState["research"]["nodes"][number]>,
	memo: Map<string, number>,
	visiting = new Set<string>(),
): number {
	const memoized = memo.get(id);
	if (memoized !== undefined) return memoized;
	if (visiting.has(id)) return 0;
	const node = nodesById.get(id);
	if (node === undefined) return 0;
	visiting.add(id);
	const depth =
		node.prerequisites.length === 0
			? 0
			: 1 +
				Math.max(
					...node.prerequisites.map((prerequisite) =>
						depthFor(prerequisite, nodesById, memo, visiting),
					),
				);
	visiting.delete(id);
	memo.set(id, depth);
	return depth;
}

function connectorPath(
	source: PositionedResearchNode,
	target: PositionedResearchNode,
): string {
	const sourceCenterX = source.x + CARD_WIDTH / 2;
	const targetCenterX = target.x + CARD_WIDTH / 2;
	const sourceY = source.y + CARD_HEIGHT / 2;
	const targetY = target.y + CARD_HEIGHT / 2;
	if (source.x === target.x) {
		const bendX = sourceCenterX + 44;
		return `M ${sourceCenterX} ${sourceY} C ${bendX} ${sourceY}, ${bendX} ${targetY}, ${targetCenterX} ${targetY}`;
	}
	const sourceX = source.x + CARD_WIDTH;
	const targetX = target.x;
	const bend = Math.max(44, (targetX - sourceX) / 2);
	return `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`;
}

function effectForNode(branch: string, era: string): string {
	if (branch === "models") {
		return `Advances the ${era} model frontier and makes its downstream model work eligible.`;
	}
	if (branch === "infrastructure") {
		return `Improves ${era}-era compute operations, increasing the lab's infrastructure options.`;
	}
	return `Improves ${era}-era product safety and market readiness for downstream launches.`;
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

const RESEARCH_TREE_STYLES = `
	.research-available {
		animation: research-node-pulse 2.4s ease-in-out infinite;
	}
	.research-connector-available {
		stroke-dasharray: 6 6;
		animation: research-dash-flow 1.8s linear infinite;
	}
	.frost-lock {
		filter: grayscale(0.8);
		opacity: 0.68;
	}
	@keyframes research-node-pulse {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 0%, transparent); }
		50% { box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent); }
	}
	@keyframes research-dash-flow {
		to { stroke-dashoffset: -24; }
	}
`;
