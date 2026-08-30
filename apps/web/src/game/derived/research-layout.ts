import type { GameState } from "@ai-lab-tycoon/engine";

export const RESEARCH_ERAS = ["text", "assistant", "multimodal"] as const;
export const RESEARCH_BRANCHES = [
	"models",
	"infrastructure",
	"products_safety",
] as const;

export type ResearchEra = (typeof RESEARCH_ERAS)[number];
export type ResearchBranch = (typeof RESEARCH_BRANCHES)[number];
export type ResearchNodeStatus = "locked" | "available" | "completed";
export type PositionedNodeStatus =
	| ResearchNodeStatus
	| "in-progress"
	| "locked-out";

/**
 * The smallest state shape the layout needs. The optional annotations are
 * intentionally accepted here so future engine saves can add choices without
 * making this module depend on a renderer or the full catalog.
 */
export type ResearchLayoutNode = {
	id: string;
	era: ResearchEra;
	branch: ResearchBranch;
	status: ResearchNodeStatus;
	insightCost: number;
	prerequisites: readonly string[];
	exclusiveGroup?: string;
	alternativeGroup?: string;
	exclusive?: boolean | string;
	isKeystone?: boolean;
	/** Context prerequisites are dimmed in the focused lattice view. */
	isContext?: boolean;
};

export type ResearchLayoutProject = {
	id?: string;
	kind: string;
	nodeId?: string;
	status: string;
	teamId?: string | null;
	progress?: number;
	duration?: number;
};

export type ResearchLayoutState = {
	research: {
		currentEra: ResearchEra;
		nodes: readonly ResearchLayoutNode[];
	};
	projects?: {
		items: readonly ResearchLayoutProject[];
	};
};

export type PositionedNode = {
	id: string;
	x: number;
	y: number;
	z: number;
	lane: ResearchBranch;
	era: ResearchEra;
	status: PositionedNodeStatus;
	isKeystone: boolean;
	exclusiveGroup?: string;
	/** True when this node is shown only to anchor a focused era's edges. */
	isContext?: boolean;
};

export type Edge = {
	from: string;
	to: string;
	isDivergence: boolean;
	isExclusive: boolean;
	exclusiveGroup?: string;
};

export type ExclusiveGroup = {
	id: string;
	memberIds: string[];
	parentIds: string[];
};

export type ResearchLayoutOptions = {
	/** Distance between era columns, measured in shared CSS3D/WebGL units. */
	eraStep?: number;
	/** Distance between the three branch lanes. */
	laneStep?: number;
	/** Distance between successive same-branch topological depths. */
	depthStep?: number;
	originX?: number;
	originY?: number;
	originZ?: number;
	/** Derive conservative structural forks in addition to explicit metadata. */
	deriveStructuralExclusivity?: boolean;
};

const DEFAULT_OPTIONS: Required<
	Pick<
		ResearchLayoutOptions,
		| "eraStep"
		| "laneStep"
		| "depthStep"
		| "originX"
		| "originY"
		| "originZ"
		| "deriveStructuralExclusivity"
	>
> = {
	// Keep the retained z-depth shallow; the flat projection also uses this
	// spacing on y so same-lane chains never collapse into one card.
	depthStep: 96,
	deriveStructuralExclusivity: true,
	eraStep: 360,
	laneStep: 190,
	originX: 0,
	originY: 0,
	originZ: 0,
};

// The CSS cards are roughly 96px tall at their largest. Keep a full card's
// worth of breathing room in the flat projection, not only unique points.
const FLAT_NODE_GAP = 112;

const KEYSTONE_IDS = new Set([
	"text_models_keystone",
	"assistant_models_keystone",
	"multimodal_models_fusion",
]);

/**
 * Return a deterministic 3-D projection of the research DAG.
 *
 * The graph is ordered with Kahn's algorithm rather than recursive depth
 * memoization. A malformed cycle therefore fails loudly instead of quietly
 * producing a plausible but incorrect position.
 */
export function createResearchLayout(
	state: ResearchLayoutState | Pick<GameState, "research" | "projects">,
	options: ResearchLayoutOptions = {},
): { nodes: PositionedNode[]; edges: Edge[] } {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const sourceNodes = state.research.nodes as readonly ResearchLayoutNode[];
	const nodeById = indexNodes(sourceNodes);
	const topoOrder = topologicalOrder(sourceNodes, nodeById);
	const globalDepth = new Map<string, number>();
	const branchDepth = new Map<string, number>();

	for (const current of topoOrder) {
		let deepestGlobal = 0;
		let deepestBranch = 0;
		for (const prerequisiteId of current.prerequisites) {
			const prerequisite = nodeById.get(prerequisiteId);
			if (prerequisite === undefined) {
				throw new Error(
					`Research layout references unknown prerequisite "${prerequisiteId}" from "${current.id}"`,
				);
			}
			deepestGlobal = Math.max(
				deepestGlobal,
				(globalDepth.get(prerequisiteId) ?? 0) + 1,
			);
			if (prerequisite.branch === current.branch) {
				deepestBranch = Math.max(
					deepestBranch,
					(branchDepth.get(prerequisiteId) ?? 0) + 1,
				);
			}
		}
		globalDepth.set(current.id, deepestGlobal);
		branchDepth.set(current.id, deepestBranch);
	}

	const exclusiveGroups = detectExclusiveGroups(sourceNodes, {
		deriveStructural: opts.deriveStructuralExclusivity,
	});
	const groupByNodeId = new Map<string, string>();
	for (const group of exclusiveGroups) {
		for (const memberId of group.memberIds) {
			groupByNodeId.set(memberId, group.id);
		}
	}

	const statusById = new Map<string, PositionedNodeStatus>();
	for (const current of sourceNodes) {
		statusById.set(
			current.id,
			isActiveResearchProject(state, current.id)
				? "in-progress"
				: current.status,
		);
	}
	applyLockedOutStatuses(exclusiveGroups, nodeById, statusById);

	const flatPositioning = createFlatPositioning(topoOrder, branchDepth, opts);
	const positionedNodes = topoOrder.map((current) => {
		const eraIndex = eraIndexFor(current.era);
		const laneIndex = RESEARCH_BRANCHES.indexOf(current.branch);
		const exclusiveGroup = groupByNodeId.get(current.id);
		const x = opts.originX + eraIndex * opts.eraStep;
		const y =
			opts.originY +
			(laneIndex - 1) *
				(flatPositioning.laneStepByEra.get(current.era) ?? opts.laneStep) +
			(flatPositioning.yOffsetByNodeId.get(current.id) ?? 0);
		const node: PositionedNode = {
			id: current.id,
			x,
			y,
			z: opts.originZ + (branchDepth.get(current.id) ?? 0) * opts.depthStep,
			lane: current.branch,
			era: current.era,
			status: statusById.get(current.id) ?? current.status,
			isKeystone: isResearchKeystone(current),
		};
		if (exclusiveGroup !== undefined) node.exclusiveGroup = exclusiveGroup;
		if (current.isContext === true) node.isContext = true;
		return node;
	});

	const edges = createEdges(topoOrder, exclusiveGroups, nodeById);
	return { nodes: positionedNodes, edges };
}

/**
 * Detect explicit choice metadata and conservative structural forks.
 *
 * Structural detection only calls siblings a choice when every downstream
 * closure is disjoint from every other sibling closure. Ordinary research
 * branches that later converge therefore remain ordinary DAG edges.
 */
export function detectExclusiveGroups(
	nodes: readonly ResearchLayoutNode[],
	options: { deriveStructural?: boolean } = {},
): ExclusiveGroup[] {
	const nodeById = indexNodes(nodes);
	const childrenByParent = createChildrenIndex(nodes);
	const groups = new Map<string, ExclusiveGroup>();
	const explicitlyGrouped = new Set<string>();

	for (const current of nodes) {
		const explicitId = explicitGroupId(current);
		if (explicitId === undefined) continue;
		explicitlyGrouped.add(current.id);
		const existing = groups.get(explicitId);
		if (existing === undefined) {
			groups.set(explicitId, {
				id: explicitId,
				memberIds: [current.id],
				parentIds: [],
			});
		} else {
			existing.memberIds.push(current.id);
		}
	}

	for (const group of groups.values()) {
		group.memberIds = sortIds(group.memberIds);
		group.parentIds = sharedParentIds(group.memberIds, nodeById);
	}

	if (options.deriveStructural !== true) {
		return sortGroups(groups.values());
	}

	for (const [parentId, siblingIds] of childrenByParent) {
		const candidates = siblingIds.filter(
			(candidateId) => !explicitlyGrouped.has(candidateId),
		);
		if (
			candidates.length < 2 ||
			!areMutuallyUnreachable(candidates, childrenByParent)
		) {
			continue;
		}
		const id = `derived:${parentId}`;
		const existing = groups.get(id);
		if (existing === undefined) {
			groups.set(id, {
				id,
				memberIds: sortIds(candidates),
				parentIds: [parentId],
			});
		} else {
			existing.memberIds = sortIds(
				new Set([...existing.memberIds, ...candidates]),
			);
			existing.parentIds = sortIds(new Set([...existing.parentIds, parentId]));
		}
	}

	return sortGroups(
		[...groups.values()].filter((group) => group.memberIds.length >= 2),
	);
}

export function isResearchKeystone(
	node: Pick<ResearchLayoutNode, "id" | "isKeystone">,
): boolean {
	return (
		node.isKeystone === true ||
		KEYSTONE_IDS.has(node.id) ||
		node.id.endsWith("_keystone")
	);
}

function indexNodes(
	nodes: readonly ResearchLayoutNode[],
): Map<string, ResearchLayoutNode> {
	const nodeById = new Map<string, ResearchLayoutNode>();
	for (const node of nodes) {
		if (!RESEARCH_ERAS.includes(node.era)) {
			throw new Error(
				`Unknown research era "${String(node.era)}" for node "${node.id}"`,
			);
		}
		if (nodeById.has(node.id)) {
			throw new Error(`Duplicate research layout node "${node.id}"`);
		}
		nodeById.set(node.id, node);
	}
	return nodeById;
}

function topologicalOrder(
	nodes: readonly ResearchLayoutNode[],
	nodeById: ReadonlyMap<string, ResearchLayoutNode>,
): ResearchLayoutNode[] {
	const indegree = new Map<string, number>();
	const dependents = new Map<string, string[]>();
	for (const node of nodes) {
		indegree.set(node.id, 0);
		dependents.set(node.id, []);
	}
	for (const node of nodes) {
		const uniquePrerequisites = new Set(node.prerequisites);
		for (const prerequisiteId of uniquePrerequisites) {
			if (!nodeById.has(prerequisiteId)) {
				throw new Error(
					`Research layout references unknown prerequisite "${prerequisiteId}" from "${node.id}"`,
				);
			}
			indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
			dependents.get(prerequisiteId)?.push(node.id);
		}
	}

	const ready = nodes
		.filter((node) => indegree.get(node.id) === 0)
		.map((node) => node.id)
		.sort(compareNodeIds(nodeById));
	const ordered: ResearchLayoutNode[] = [];
	while (ready.length > 0) {
		const nextId = ready.shift();
		if (nextId === undefined) break;
		const next = nodeById.get(nextId);
		if (next === undefined) continue;
		ordered.push(next);
		for (const dependentId of dependents.get(nextId) ?? []) {
			const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
			indegree.set(dependentId, nextIndegree);
			if (nextIndegree === 0) {
				ready.push(dependentId);
				ready.sort(compareNodeIds(nodeById));
			}
		}
	}
	if (ordered.length !== nodes.length) {
		const unresolved = nodes
			.filter((node) => !ordered.some((item) => item.id === node.id))
			.map((node) => node.id)
			.sort();
		throw new Error(
			`Research layout contains a prerequisite cycle involving ${unresolved.join(", ")}`,
		);
	}
	return ordered;
}

function compareNodeIds(nodeById: ReadonlyMap<string, ResearchLayoutNode>) {
	return (leftId: string, rightId: string): number => {
		const left = nodeById.get(leftId);
		const right = nodeById.get(rightId);
		if (left === undefined || right === undefined)
			return leftId.localeCompare(rightId);
		const eraDifference = eraIndexFor(left.era) - eraIndexFor(right.era);
		if (eraDifference !== 0) return eraDifference;
		const laneDifference =
			RESEARCH_BRANCHES.indexOf(left.branch) -
			RESEARCH_BRANCHES.indexOf(right.branch);
		if (laneDifference !== 0) return laneDifference;
		return left.id.localeCompare(right.id);
	};
}

function eraIndexFor(era: ResearchEra): number {
	const index = RESEARCH_ERAS.indexOf(era);
	if (index === -1) {
		throw new Error(`Unknown research era "${String(era)}"`);
	}
	return index;
}

function explicitGroupId(node: ResearchLayoutNode): string | undefined {
	if (
		typeof node.exclusiveGroup === "string" &&
		node.exclusiveGroup.length > 0
	) {
		return node.exclusiveGroup;
	}
	if (
		typeof node.alternativeGroup === "string" &&
		node.alternativeGroup.length > 0
	) {
		return node.alternativeGroup;
	}
	if (typeof node.exclusive === "string" && node.exclusive.length > 0) {
		return node.exclusive;
	}
	return undefined;
}

function createChildrenIndex(
	nodes: readonly ResearchLayoutNode[],
): Map<string, string[]> {
	const childrenByParent = new Map<string, string[]>();
	for (const node of nodes) {
		for (const prerequisiteId of new Set(node.prerequisites)) {
			const children = childrenByParent.get(prerequisiteId) ?? [];
			children.push(node.id);
			childrenByParent.set(prerequisiteId, children);
		}
	}
	for (const children of childrenByParent.values()) children.sort();
	return childrenByParent;
}

function sharedParentIds(
	memberIds: readonly string[],
	nodeById: ReadonlyMap<string, ResearchLayoutNode>,
): string[] {
	const parentSets = memberIds.map(
		(memberId) => new Set([...(nodeById.get(memberId)?.prerequisites ?? [])]),
	);
	const first = parentSets[0];
	if (first === undefined) return [];
	const shared = [...first].filter((parentId) =>
		parentSets.every((parents) => parents.has(parentId)),
	);
	return shared.sort();
}

function areMutuallyUnreachable(
	candidateIds: readonly string[],
	childrenByParent: ReadonlyMap<string, readonly string[]>,
): boolean {
	const closures = candidateIds.map((candidateId) =>
		descendantClosure(candidateId, childrenByParent),
	);
	for (let leftIndex = 0; leftIndex < closures.length; leftIndex += 1) {
		const left = closures[leftIndex];
		if (left === undefined) return false;
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < closures.length;
			rightIndex += 1
		) {
			const right = closures[rightIndex];
			if (right === undefined) return false;
			for (const id of left) {
				if (right.has(id)) return false;
			}
		}
	}
	return true;
}

function descendantClosure(
	startId: string,
	childrenByParent: ReadonlyMap<string, readonly string[]>,
): Set<string> {
	const closure = new Set<string>();
	const pending = [startId];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined || closure.has(current)) continue;
		closure.add(current);
		for (const childId of childrenByParent.get(current) ?? [])
			pending.push(childId);
	}
	return closure;
}

function sortGroups(groups: Iterable<ExclusiveGroup>): ExclusiveGroup[] {
	return [...groups]
		.filter((group) => group.memberIds.length >= 2)
		.map((group) => ({
			...group,
			memberIds: sortIds(group.memberIds),
			parentIds: sortIds(group.parentIds),
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
}

function sortIds(ids: Iterable<string>): string[] {
	return [...new Set(ids)].sort();
}

type FlatPositioning = {
	laneStepByEra: ReadonlyMap<ResearchEra, number>;
	yOffsetByNodeId: ReadonlyMap<string, number>;
};

/**
 * Pack each era's branch bands independently for the orthographic projection.
 * Nodes at the same topological depth use adjacent slots, and each depth level
 * advances far enough to clear the tallest card in that level. Branch bands
 * then receive a full-card gap, so the z collapse cannot create occlusion.
 */
function createFlatPositioning(
	topoOrder: readonly ResearchLayoutNode[],
	branchDepth: ReadonlyMap<string, number>,
	options: Required<
		Pick<
			ResearchLayoutOptions,
			| "eraStep"
			| "laneStep"
			| "depthStep"
			| "originX"
			| "originY"
			| "originZ"
			| "deriveStructuralExclusivity"
		>
	>,
): FlatPositioning {
	const levelsByEraAndBranch = new Map<
		ResearchEra,
		Map<ResearchBranch, Map<number, ResearchLayoutNode[]>>
	>();
	for (const node of topoOrder) {
		const branches = levelsByEraAndBranch.get(node.era) ?? new Map();
		const levels = branches.get(node.branch) ?? new Map();
		const depth = branchDepth.get(node.id) ?? 0;
		const nodesAtDepth = levels.get(depth) ?? [];
		nodesAtDepth.push(node);
		levels.set(depth, nodesAtDepth);
		branches.set(node.branch, levels);
		levelsByEraAndBranch.set(node.era, branches);
	}

	const yOffsetByNodeId = new Map<string, number>();
	const laneStepByEra = new Map<ResearchEra, number>();
	const depthStep = Math.abs(options.depthStep);
	const laneStep = Math.abs(options.laneStep);
	for (const [era, branches] of levelsByEraAndBranch) {
		let maximumBranchSpan = 0;
		for (const levels of branches.values()) {
			let cursor = 0;
			for (const nodesAtDepth of [...levels].sort(
				([leftDepth], [rightDepth]) => leftDepth - rightDepth,
			)) {
				const nodesAtLevel = nodesAtDepth[1];
				if (nodesAtLevel === undefined) continue;
				for (let index = 0; index < nodesAtLevel.length; index += 1) {
					const node = nodesAtLevel[index];
					if (node !== undefined) {
						yOffsetByNodeId.set(node.id, cursor + index * FLAT_NODE_GAP);
					}
				}
				cursor += Math.max(depthStep, nodesAtLevel.length * FLAT_NODE_GAP, 1);
			}
			maximumBranchSpan = Math.max(maximumBranchSpan, cursor);
		}
		laneStepByEra.set(
			era,
			Math.max(laneStep, maximumBranchSpan + FLAT_NODE_GAP, 1),
		);
	}

	return { laneStepByEra, yOffsetByNodeId };
}

function isActiveResearchProject(
	state: ResearchLayoutState | Pick<GameState, "research" | "projects">,
	nodeId: string,
): boolean {
	return (
		state.projects?.items.some(
			(project) =>
				project.kind === "research" &&
				project.nodeId === nodeId &&
				(project.status === "active" || project.status === "in-progress"),
		) ?? false
	);
}

function applyLockedOutStatuses(
	groups: readonly ExclusiveGroup[],
	nodeById: ReadonlyMap<string, ResearchLayoutNode>,
	statusById: Map<string, PositionedNodeStatus>,
): void {
	const childrenByParent = createChildrenIndex([...nodeById.values()]);
	for (const group of groups) {
		const committed = group.memberIds.filter((memberId) => {
			const status = statusById.get(memberId);
			return status === "completed" || status === "in-progress";
		});
		if (committed.length !== 1) continue;
		const committedId = committed[0];
		if (committedId === undefined) continue;
		for (const alternateId of group.memberIds) {
			if (alternateId === committedId) continue;
			for (const abandonedId of descendantClosure(
				alternateId,
				childrenByParent,
			)) {
				if (abandonedId === committedId) continue;
				const existing = statusById.get(abandonedId);
				if (existing !== "completed" && existing !== "in-progress") {
					statusById.set(abandonedId, "locked-out");
				}
			}
		}
	}
}

function createEdges(
	topoOrder: readonly ResearchLayoutNode[],
	groups: readonly ExclusiveGroup[],
	nodeById: ReadonlyMap<string, ResearchLayoutNode>,
): Edge[] {
	const groupBranches = groups.map((group) => ({
		group,
		branchNodeIds: new Set(
			group.memberIds.flatMap((memberId) => [
				...descendantClosure(
					memberId,
					createChildrenIndex([...nodeById.values()]),
				),
			]),
		),
	}));
	const edges: Edge[] = [];
	for (const target of topoOrder) {
		for (const prerequisiteId of target.prerequisites) {
			let edgeGroup: string | undefined;
			let isDivergence = false;
			let isExclusive = false;
			for (const candidate of groupBranches) {
				const divergence =
					candidate.group.memberIds.includes(target.id) &&
					candidate.group.parentIds.includes(prerequisiteId);
				const branchEdge =
					candidate.branchNodeIds.has(target.id) ||
					candidate.branchNodeIds.has(prerequisiteId);
				if (divergence || branchEdge) {
					edgeGroup = candidate.group.id;
					isDivergence ||= divergence;
					isExclusive = true;
					break;
				}
			}
			const edge: Edge = {
				from: prerequisiteId,
				to: target.id,
				isDivergence,
				isExclusive,
			};
			if (edgeGroup !== undefined) edge.exclusiveGroup = edgeGroup;
			edges.push(edge);
		}
	}
	return edges;
}
