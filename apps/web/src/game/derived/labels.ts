import {
	type Fact,
	type GameState,
	type ResearchEffect,
	selectResearchNodes,
	selectResearchParadigm,
	type VisibleResearchParadigm,
} from "@ai-lab-tycoon/engine";

export type EntityKind = "project" | "model" | "product" | "rival" | "node";

export type FactEntityField =
	| "projectId"
	| "modelId"
	| "productId"
	| "rivalId"
	| "nodeId"
	| "paradigmId";

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

/** Render the engine's typed research result without recreating its rules. */
export function summarizeResearchEffects(
	effects: readonly ResearchEffect[] | undefined,
): string {
	if (effects === undefined || effects.length === 0) return "";
	return effects.map(summarizeResearchEffect).join("; ");
}

export type ParadigmSelectedFact = Extract<Fact, { kind: "paradigm_selected" }>;
export type ResearchPublicationResolutionFact = Extract<
	Fact,
	{ kind: "research_publication_resolved" }
>;

type ResearchParadigmEffect = VisibleResearchParadigm["benefits"][number];

/** Render the engine-owned paradigm projection without duplicating its catalog. */
export function summarizeResearchParadigmSelection(
	state: GameState | undefined,
	fact: ParadigmSelectedFact,
): string {
	const paradigm = state === undefined ? null : selectResearchParadigm(state);
	const selected = paradigm?.id === fact.paradigmId ? paradigm : undefined;
	const label = selected?.label ?? humanizeId(fact.paradigmId);
	const benefit = selected
		? summarizeResearchParadigmEffects(selected.benefits)
		: "not available in the current projection";
	const liability = selected
		? summarizeResearchParadigmEffects(selected.liabilities)
		: "not available in the current projection";
	return `${label} selected — Benefit: ${benefit}; Liability: ${liability}.`;
}

/** Resolve the research node named by a publication-resolution fact. */
export function resolveResearchPublicationNodeLabel(
	state: GameState | undefined,
	fact: ResearchPublicationResolutionFact,
): string {
	return state === undefined
		? humanizeId(fact.nodeId)
		: resolveEntityLabel(state, "node", fact.nodeId);
}

/** Render the irreversible publication outcome and its player-facing tradeoff. */
export function summarizeResearchPublicationResolution(
	state: GameState | undefined,
	fact: ResearchPublicationResolutionFact,
): string {
	const nodeLabel = resolveResearchPublicationNodeLabel(state, fact);
	return fact.outcome === "publish"
		? `${nodeLabel} published — Public credit and visibility build trust and hype while active rivals receive a visible clue.`
		: `${nodeLabel} kept proprietary — Keeping the lead preserves your advantage, but carries an openness/trust cost.`;
}

/** Return readable effect copy for the selected-paradigm player card. */
export function summarizeResearchParadigmEffects(
	effects: readonly ResearchParadigmEffect[],
): string {
	return effects.map(summarizeResearchParadigmEffect).join("; ");
}

function summarizeResearchParadigmEffect(
	effect: ResearchParadigmEffect,
): string {
	switch (effect.kind) {
		case "model_score_ceiling_bonus":
			return `+${effect.amount} model score ceiling`;
		case "model_score_ceiling_penalty":
			return `−${effect.amount} model score ceiling`;
		case "training_compute_surcharge":
			return `+${effect.amount} training Compute`;
		case "data_quality_impact_bonus":
			return `+${effect.amount} data quality impact`;
		case "training_variance_bonus":
			return `+${effect.amount} training variance`;
	}
}

function summarizeResearchEffect(effect: ResearchEffect): string {
	switch (effect.kind) {
		case "training_compute_reduction":
			return `−${effect.amount} training Compute`;
		case "model_score_bonus":
			return `+${effect.amount} ${humanizeId(effect.dimension)} model score`;
		case "evaluation_coverage_bonus":
			return `+${effect.amount} ${humanizeId(effect.evaluation)} evaluation coverage`;
	}
	return "";
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
		case "research_spark_discovered":
		case "research_publication_resolved":
			return { nodeId: resolveEntityLabel(state, "node", fact.nodeId) };
		case "paradigm_selected": {
			const paradigm = selectResearchParadigm(state);
			return {
				paradigmId:
					paradigm?.id === fact.paradigmId
						? paradigm.label
						: humanizeId(fact.paradigmId),
			};
		}
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
