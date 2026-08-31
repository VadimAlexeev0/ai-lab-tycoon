import {
	type Fact,
	type GameState,
	selectResearchNodes,
} from "@ai-lab-tycoon/engine";

export type EntityKind = "project" | "model" | "product" | "rival" | "node";

export type FactEntityField =
	| "projectId"
	| "modelId"
	| "productId"
	| "rivalId"
	| "nodeId";

export type FactLabels = Partial<Record<FactEntityField, string>>;

/** Turn a stored identifier into readable copy when its entity is gone. */
export function humanizeId(value: string): string {
	const readable = value
		.trim()
		.replace(/([a-z\d])([A-Z])/g, "$1 $2")
		.replace(/[\s_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (readable.length === 0) return "Unknown";
	return readable.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

/** Resolve an entity ID against the current state without mutating it. */
export function resolveEntityLabel(
	state: GameState,
	kind: EntityKind,
	id: string,
): string {
	switch (kind) {
		case "project": {
			const project = state.projects.items.find((item) => item.id === id);
			return project === undefined
				? humanizeId(id)
				: projectLabel(state, project);
		}
		case "model": {
			const model = state.models.items.find((item) => item.id === id);
			return model?.name.trim() || humanizeId(id);
		}
		case "product": {
			const product = state.products.items.find((item) => item.id === id);
			return product === undefined
				? humanizeId(id)
				: `${resolveEntityLabel(state, "model", product.modelId)} · ${channelLabel(product.channel)}`;
		}
		case "rival": {
			const rival = state.rivals.items.find((item) => item.id === id);
			return rival?.name.trim() || humanizeId(id);
		}
		case "node": {
			const node = state.research.nodes.find((item) => item.id === id);
			if (node === undefined) return humanizeId(id);
			try {
				const visibleNode = selectResearchNodes(state).find(
					(item) => item.id === id,
				);
				return visibleNode?.label || humanizeId(id);
			} catch {
				return humanizeId(id);
			}
		}
	}
}

/** Resolve every player-facing entity label carried by a fact. */
export function resolveFactLabels(state: GameState, fact: Fact): FactLabels {
	switch (fact.kind) {
		case "project_progressed":
		case "project_completed":
			return {
				projectId: resolveEntityLabel(state, "project", fact.projectId),
			};
		case "research_completed":
			return { nodeId: resolveEntityLabel(state, "node", fact.nodeId) };
		case "model_trained":
		case "evaluation_completed":
			return { modelId: resolveEntityLabel(state, "model", fact.modelId) };
		case "product_launched":
		case "product_resumed":
		case "revenue":
			return {
				productId: resolveEntityLabel(state, "product", fact.productId),
			};
		case "rival_progressed":
		case "rival_milestone":
			return { rivalId: resolveEntityLabel(state, "rival", fact.rivalId) };
		default:
			return {};
	}
}

/** Alias for call sites that describe the operation as labeling a fact. */
export const labelFactEntities = resolveFactLabels;

function projectLabel(
	state: GameState,
	project: GameState["projects"]["items"][number],
): string {
	switch (project.kind) {
		case "research":
			return `Research · ${resolveEntityLabel(state, "node", project.nodeId)}`;
		case "infrastructure":
			return "Compute infrastructure";
		case "model":
			return `Model design · ${resolveEntityLabel(state, "model", project.modelId)}`;
		case "training":
			return `Training · ${resolveEntityLabel(state, "model", project.modelId)}`;
		case "evaluation":
			return `Evaluation · ${resolveEntityLabel(state, "model", project.modelId)} · ${evaluationLabel(project.evaluation)}`;
		case "product":
			return `Product launch · ${channelLabel(project.channel)}`;
	}
}

function channelLabel(
	channel: "chat" | "developer_api" | "enterprise",
): string {
	return channel === "developer_api"
		? "Developer API"
		: channel.charAt(0).toUpperCase() + channel.slice(1);
}

function evaluationLabel(
	evaluation: "capability" | "safety_reliability",
): string {
	return evaluation === "safety_reliability"
		? "Safety / reliability"
		: "Capability";
}
