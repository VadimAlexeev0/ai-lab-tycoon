import { type GameState, selectResearchNodes } from "@ai-lab-tycoon/engine";

import type {
	createResearchLayout,
	PositionedNode,
	PositionedNodeStatus,
} from "../derived/research-layout";

export type ResearchProject = Extract<
	GameState["projects"]["items"][number],
	{ kind: "research" }
>;

export type ResearchNodeView = PositionedNode & {
	label: string;
	description: string;
	prerequisites: string[];
	insightCost: number;
	project: ResearchProject | undefined;
	progress: number;
};

export type StatusVisual = {
	className: string;
	icon: string;
	label: string;
	announcement: string;
};

/** Single source of truth for card, list, connector, and dialog status labels. */
export const RESEARCH_STATUS_VISUALS: Readonly<
	Record<PositionedNodeStatus, StatusVisual>
> = {
	available: {
		announcement: "Available — assign a team to begin.",
		className: "lattice-status-available",
		icon: "◌",
		label: "Available",
	},
	completed: {
		announcement: "Completed — this unlock is active.",
		className: "lattice-status-completed",
		icon: "✓",
		label: "Completed",
	},
	"in-progress": {
		announcement: "In progress — a team is researching this node.",
		className: "lattice-status-in-progress",
		icon: "●",
		label: "In progress",
	},
	locked: {
		announcement: "Locked — complete its prerequisites first.",
		className: "lattice-status-locked",
		icon: "▣",
		label: "Locked",
	},
	"locked-out": {
		announcement: "Path not taken — another exclusive path was chosen.",
		className: "lattice-status-locked-out",
		icon: "×",
		label: "Path not taken",
	},
};

export function getResearchStatusVisual(
	status: PositionedNodeStatus,
): StatusVisual {
	return RESEARCH_STATUS_VISUALS[status];
}

export function getResearchStatusClass(status: PositionedNodeStatus): string {
	return getResearchStatusVisual(status).className;
}

export function projectResearchNodeViews(
	state: GameState,
	layout: ReturnType<typeof createResearchLayout>,
): ResearchNodeView[] {
	const visibleById = new Map(
		selectResearchNodes(state).map((node) => [node.id, node]),
	);
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
	return layout.nodes.map((positioned) => {
		const visible = visibleById.get(positioned.id);
		const source = sourceById.get(positioned.id);
		const project = projectByNodeId.get(positioned.id);
		const activeProject = project?.status === "active" ? project : undefined;
		return {
			...positioned,
			description: visible?.description ?? "Research description unavailable.",
			insightCost: source?.insightCost ?? visible?.insightCost ?? 0,
			label: visible?.label ?? humanize(positioned.id),
			prerequisites: [...(source?.prerequisites ?? visible?.prereqs ?? [])],
			progress:
				activeProject === undefined || activeProject.duration <= 0
					? 0
					: Math.max(
							0,
							Math.min(
								100,
								Math.round(
									(activeProject.progress / activeProject.duration) * 100,
								),
							),
						),
			project,
		};
	});
}

export function findChoiceFrontiers(
	nodes: readonly PositionedNode[],
): string[] {
	const groups = new Map<string, PositionedNode[]>();
	for (const node of nodes) {
		if (node.exclusiveGroup === undefined) continue;
		const members = groups.get(node.exclusiveGroup) ?? [];
		members.push(node);
		groups.set(node.exclusiveGroup, members);
	}
	return [...groups]
		.filter(([, members]) => {
			const committed = members.some(
				(node) => node.status === "completed" || node.status === "in-progress",
			);
			return !committed && members.some((node) => node.status === "available");
		})
		.map(([groupId]) => groupId)
		.sort();
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
