import { type GameState, selectResearchNodes } from "@ai-lab-tycoon/engine";

import type {
	createResearchLayout,
	PositionedNode,
	PositionedNodeStatus,
	ResearchEra,
	ResearchLayoutNode,
} from "../derived/research-layout";

const ERA_GATE_IDS: Readonly<Partial<Record<ResearchEra, string>>> = {
	assistant: "text_models_keystone",
	multimodal: "assistant_models_keystone",
};

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

/**
 * Return one era's nodes plus the direct prior-era prerequisites that anchor
 * its incoming edges. Context nodes have their own ancestors trimmed so a
 * focused layout never expands back into the entire historical tree.
 */
export function filterResearchNodesForEra(
	nodes: readonly ResearchLayoutNode[],
	era: ResearchEra,
): ResearchLayoutNode[] {
	const focusedIds = new Set(
		nodes.filter((node) => node.era === era).map((node) => node.id),
	);
	const contextIds = new Set<string>();
	const selectedEraIndex = eraIndexFor(era);
	const nodeById = new Map(nodes.map((node) => [node.id, node]));

	for (const node of nodes) {
		if (!focusedIds.has(node.id)) continue;
		for (const prerequisiteId of node.prerequisites) {
			const prerequisite = nodeById.get(prerequisiteId);
			if (
				prerequisite !== undefined &&
				eraIndexFor(prerequisite.era) < selectedEraIndex
			) {
				contextIds.add(prerequisite.id);
			}
		}
	}

	const includedIds = new Set([...focusedIds, ...contextIds]);
	return nodes
		.filter((node) => includedIds.has(node.id))
		.map((node) => {
			const prerequisites = node.prerequisites.filter((id) =>
				includedIds.has(id),
			);
			if (!contextIds.has(node.id)) {
				return { ...node, prerequisites };
			}
			return { ...node, isContext: true, prerequisites };
		});
}

/** A future era is selectable only after its entry keystone is completed. */
export function isResearchEraUnlocked(
	state: Pick<GameState, "research">,
	era: ResearchEra,
): boolean {
	const currentEraIndex = eraIndexFor(state.research.currentEra);
	const requestedEraIndex = eraIndexFor(era);
	if (requestedEraIndex <= currentEraIndex) return true;
	const gateId = ERA_GATE_IDS[era];
	return (
		gateId !== undefined &&
		state.research.nodes.some(
			(node) => node.id === gateId && node.status === "completed",
		)
	);
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

function eraIndexFor(era: ResearchEra): number {
	return ["text", "assistant", "multimodal"].indexOf(era);
}
