export type ResearchEra = "text" | "assistant" | "multimodal";
export type ResearchBranch = "models" | "infrastructure" | "products_safety";
export type ResearchNodeStatus = "locked" | "available" | "completed";

export type ResearchNode = {
	id: string;
	era: ResearchEra;
	branch: ResearchBranch;
	status: ResearchNodeStatus;
	prerequisites: string[];
};

export type ResearchState = {
	currentEra: ResearchEra;
	nodes: ResearchNode[];
};

export function createResearchState(
	currentEra: ResearchEra = "text",
	nodes: ResearchNode[] = [],
): ResearchState {
	return {
		currentEra,
		nodes: nodes.map((node) => ({
			...node,
			prerequisites: [...node.prerequisites],
		})),
	};
}

export function assertResearchState(state: ResearchState): void {
	const ids: string[] = [];
	for (const node of state.nodes) {
		assertIdentifier(node.id, "research node id");
		if (ids.includes(node.id)) {
			throw new Error(`Duplicate research node id: ${node.id}`);
		}
		ids.push(node.id);
	}

	for (const node of state.nodes) {
		for (const prerequisite of node.prerequisites) {
			assertIdentifier(prerequisite, "research prerequisite id");
			if (prerequisite === node.id) {
				throw new Error(`Research node ${node.id} cannot require itself`);
			}
			if (!ids.includes(prerequisite)) {
				throw new Error(
					`Research node ${node.id} references an unknown prerequisite`,
				);
			}
		}
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}
