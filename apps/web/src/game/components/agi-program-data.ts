import {
	type Fact,
	type GameState,
	selectRecentReports,
} from "@ai-lab-tycoon/engine";

export const AGI_PROGRAM_SLOT_COUNT = 6 as const;

type AgiProgramRequirement =
	| "Era IV required"
	| "Era V required"
	| "Era VI required";

type AgiProgramSlotDefinition = {
	id: string;
	label: string;
	concept: string;
	requirement: AgiProgramRequirement;
	complete: (state: GameState) => boolean;
	evidence: (state: GameState) => string | null;
};

export type AgiProgramSlot = {
	id: string;
	label: string;
	concept: string;
	requirement: AgiProgramRequirement;
	complete: boolean;
	evidence: string | null;
};

const AGI_PROGRAM_SLOT_DEFINITIONS: readonly AgiProgramSlotDefinition[] = [
	{
		id: "frontier-synthesis",
		label: "Frontier synthesis",
		concept: "Era keystone / multimodal foundation",
		requirement: "Era IV required",
		complete: (state) => findMultimodalResearchFact(state) !== undefined,
		evidence: (state) => findMultimodalResearchFact(state)?.nodeId ?? null,
	},
	{
		id: "embodied-world-model",
		label: "Embodied world model",
		concept: "AGI piece / multimodal model branch",
		requirement: "Era IV required",
		complete: (state) => findReadyMultimodalModel(state) !== undefined,
		evidence: (state) => findReadyMultimodalModel(state)?.id ?? null,
	},
	{
		id: "reliability-proof",
		label: "Reliability proof",
		concept: "Era keystone / safety evidence",
		requirement: "Era V required",
		complete: (state) => findSafetyEvaluationFact(state) !== undefined,
		evidence: (state) => findSafetyEvaluationFact(state)?.modelId ?? null,
	},
	{
		id: "agentic-deployment",
		label: "Agentic deployment",
		concept: "AGI piece / enterprise release gate",
		requirement: "Era V required",
		complete: (state) => findEnterpriseLaunchFact(state) !== undefined,
		evidence: (state) => findEnterpriseLaunchFact(state)?.productId ?? null,
	},
	{
		id: "recursive-improvement",
		label: "Recursive improvement",
		concept: "Era keystone / descendant model",
		requirement: "Era VI required",
		complete: (state) => findDescendantModel(state) !== undefined,
		evidence: (state) => findDescendantModel(state)?.id ?? null,
	},
	{
		id: "program-charter",
		label: "Program charter",
		concept: "AGI piece / frontier milestone",
		requirement: "Era VI required",
		complete: (state) =>
			findFrontierMilestone(state) !== undefined ||
			state.terminal.frontierReached,
		evidence: (state) =>
			findFrontierMilestone(state)?.kind ??
			(state.terminal.frontierReached ? "terminal.frontierReached" : null),
	},
];

/** Project late-game sockets from evidence already present in the V1 state. */
export function buildAgiProgramSlots(state: GameState): AgiProgramSlot[] {
	return AGI_PROGRAM_SLOT_DEFINITIONS.map((definition) => ({
		id: definition.id,
		label: definition.label,
		concept: definition.concept,
		requirement: definition.requirement,
		complete: definition.complete(state),
		evidence: definition.evidence(state),
	}));
}

function findMultimodalResearchFact(
	state: GameState,
): Extract<Fact, { kind: "research_completed" }> | undefined {
	return selectRecentReports(state)
		.map((report) => report.fact)
		.find(
			(fact): fact is Extract<Fact, { kind: "research_completed" }> =>
				fact.kind === "research_completed" &&
				state.research.nodes.find((node) => node.id === fact.nodeId)?.era ===
					"multimodal",
		);
}

function findReadyMultimodalModel(state: GameState) {
	return state.models.items.find(
		(model) =>
			model.family === "multimodal" &&
			(model.status === "ready" || model.status === "launched"),
	);
}

function findSafetyEvaluationFact(
	state: GameState,
): Extract<Fact, { kind: "evaluation_completed" }> | undefined {
	return selectRecentReports(state)
		.map((report) => report.fact)
		.find(
			(fact): fact is Extract<Fact, { kind: "evaluation_completed" }> =>
				fact.kind === "evaluation_completed" &&
				fact.evaluation === "safety_reliability",
		);
}

function findEnterpriseLaunchFact(
	state: GameState,
): Extract<Fact, { kind: "product_launched" }> | undefined {
	return selectRecentReports(state)
		.map((report) => report.fact)
		.find(
			(fact): fact is Extract<Fact, { kind: "product_launched" }> =>
				fact.kind === "product_launched" && fact.channel === "enterprise",
		);
}

function findDescendantModel(state: GameState) {
	return state.models.items.find(
		(model) =>
			(model.foundation === "continued" || model.foundation === "distilled") &&
			model.parentModelId !== undefined &&
			model.parentModelId !== null &&
			(model.status === "ready" || model.status === "launched"),
	);
}

function findFrontierMilestone(
	state: GameState,
): Extract<Fact, { kind: "milestone_reached" }> | undefined {
	return selectRecentReports(state)
		.map((report) => report.fact)
		.find(
			(fact): fact is Extract<Fact, { kind: "milestone_reached" }> =>
				fact.kind === "milestone_reached" &&
				fact.milestone === "first_multimodal_launch",
		);
}
