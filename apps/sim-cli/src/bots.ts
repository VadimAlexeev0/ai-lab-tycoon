import {
	type DecisionChoice,
	type GameState,
	type ModelDesignSpec,
	type ModelFoundation,
	type ModelTier,
	type ProductChannel,
	selectAvailableProjects,
} from "@ai-lab-tycoon/engine";

export const BOT_NAMES = [
	"random",
	"capability-rusher",
	"evaluator",
	"efficiency-first",
] as const;

export type BotName = (typeof BOT_NAMES)[number];

export type BotAction =
	| { kind: "assign_project"; teamId: string; projectId: string }
	| { kind: "design_model"; spec: ModelDesignSpec }
	| { kind: "buy_compute" }
	| { kind: "hire_team"; name: string }
	| { kind: "resume_product"; productId: string }
	| { kind: "advance_week" };

export type BotController = Readonly<{
	name: BotName;
	chooseDecision: (state: GameState) => DecisionChoice | null;
	chooseAction: (state: GameState) => BotAction;
}>;

type ResearchProject = Extract<
	ReturnType<typeof selectAvailableProjects>[number],
	{ kind: "research" }
>;

type ModelFamily = "text" | "assistant" | "multimodal";

const MODEL_FAMILIES: readonly ModelFamily[] = [
	"text",
	"assistant",
	"multimodal",
];

const MODEL_RESEARCH_NODES: Readonly<Record<ModelFamily, string>> = {
	text: "text_models_principles",
	assistant: "assistant_models_reasoning",
	multimodal: "multimodal_models_fusion",
};

const MODEL_RESEARCH_ORDER = [
	"text_models_principles",
	"text_models_keystone",
	"assistant_models_reasoning",
	"assistant_models_tool_use",
	"assistant_models_keystone",
	"multimodal_models_fusion",
] as const;

const EVALUATOR_RESEARCH_ORDER = [
	...MODEL_RESEARCH_ORDER.slice(0, 2),
	"text_products_safety_basics",
	"text_products_evaluation",
	...MODEL_RESEARCH_ORDER.slice(2),
] as const;

const EFFICIENCY_RESEARCH_ORDER = [
	"text_models_principles",
	"text_models_keystone",
	"assistant_models_reasoning",
	"assistant_models_tool_use",
	"assistant_models_keystone",
	"multimodal_models_fusion",
	"text_infrastructure_compute",
	"text_infrastructure_scaling",
] as const;

const MODEL_TIERS: readonly ModelTier[] = ["lean", "standard", "aggressive"];
const FOUNDATIONS: readonly ModelFoundation[] = [
	"fresh",
	"continued",
	"distilled",
];

const TIER_COSTS: Readonly<Record<ModelTier, number>> = {
	lean: 80,
	standard: 160,
	aggressive: 280,
};

const FOUNDATION_COSTS: Readonly<Record<ModelFoundation, number>> = {
	fresh: 0,
	continued: 120,
	distilled: 180,
};

const DATA_MIXES: Readonly<
	Record<
		ModelFamily,
		readonly [
			{ general: number; code: number; multimodal: number },
			{ general: number; code: number; multimodal: number },
			{ general: number; code: number; multimodal: number },
		]
	>
> = {
	text: [
		{ general: 60, code: 30, multimodal: 10 },
		{ general: 50, code: 0, multimodal: 50 },
		{ general: 70, code: 20, multimodal: 10 },
	],
	assistant: [
		{ general: 50, code: 30, multimodal: 20 },
		{ general: 60, code: 20, multimodal: 20 },
		{ general: 40, code: 40, multimodal: 20 },
	],
	multimodal: [
		{ general: 40, code: 20, multimodal: 40 },
		{ general: 30, code: 20, multimodal: 50 },
		{ general: 50, code: 20, multimodal: 30 },
	],
};

/** Create a small deterministic policy; no wall-clock or ambient randomness is used. */
export function createBot(name: BotName, seed: number): BotController {
	const random = new DeterministicRandom(seed ^ 0xa5a5_5a5a);
	const randomTeamTarget = 1 + random.nextInt(3);
	const randomRisk = random.nextInt(100) < 35;
	const researchOrder = researchOrderFor(name);

	return {
		name,
		chooseDecision: (state) => chooseDecision(state, name, random, randomRisk),
		chooseAction: (state) =>
			chooseAction(
				state,
				name,
				random,
				randomTeamTarget,
				randomRisk,
				researchOrder,
			),
	};
}

function chooseDecision(
	state: GameState,
	name: BotName,
	random: DeterministicRandom,
	riskMode: boolean,
): DecisionChoice | null {
	const decision =
		state.decisions.pending.find((candidate) => candidate.blocking) ??
		state.decisions.pending[0];
	if (decision === undefined) return null;

	if (
		name === "random" &&
		(decision.kind === "launch" || decision.kind === "evaluation") &&
		random.nextInt(100) < 12
	) {
		return { kind: "shelve", decisionId: decision.id };
	}

	switch (decision.kind) {
		case "paradigm": {
			const paradigmId = decision.choices[0];
			if (paradigmId === undefined) return null;
			return {
				kind: "paradigm",
				decisionId: decision.id,
				paradigmId,
			};
		}
		case "publication":
			return {
				kind: "publication",
				decisionId: decision.id,
				nodeId: decision.nodeId,
				outcome:
					name === "efficiency-first"
						? "hoard"
						: name === "capability-rusher" || name === "evaluator"
							? "publish"
							: random.nextInt(2) === 0
								? "publish"
								: "hoard",
			};
		case "launch": {
			const channel = launchChannelForDecision(
				state,
				decision.modelId,
				decision.channel,
				name,
				random,
			);
			if (channel === undefined) {
				return { kind: "shelve", decisionId: decision.id };
			}
			return {
				kind: "launch",
				decisionId: decision.id,
				channel,
			};
		}
		case "evaluation":
			return name === "random" && random.nextInt(100) < 18
				? { kind: "shelve", decisionId: decision.id }
				: {
						kind: "evaluate",
						decisionId: decision.id,
						evaluation: decision.evaluation,
					};
		case "funding":
			return {
				kind: "funding",
				decisionId: decision.id,
				round: decision.round,
				accept: name === "random" ? random.nextInt(100) < 65 : true,
			};
		case "incident":
			return {
				kind: "incident",
				decisionId: decision.id,
				response: incidentResponse(state, name, decision.incident, riskMode),
			};
	}
}

function chooseAction(
	state: GameState,
	name: BotName,
	random: DeterministicRandom,
	randomTeamTarget: number,
	riskMode: boolean,
	researchOrder: readonly string[],
): BotAction {
	const pausedProduct = state.products.items.find(
		(product) => product.status === "paused",
	);
	if (pausedProduct !== undefined && shouldResumeProduct(name, random)) {
		return { kind: "resume_product", productId: pausedProduct.id };
	}

	if (
		name !== "random" ||
		(random.nextInt(100) >= 12 && !riskMode) ||
		random.nextInt(100) >= 5
	) {
		const design = chooseModelDesign(state, name, random);
		if (design !== undefined) return design;
	}

	const compute = chooseComputePurchase(state, name, random);
	if (compute) return compute;

	const hire = chooseHire(state, name, randomTeamTarget, random);
	if (hire !== undefined) return hire;

	const assignment = chooseResearchAssignment(
		state,
		name,
		random,
		researchOrder,
	);
	if (assignment !== undefined) return assignment;

	return { kind: "advance_week" };
}

function chooseModelDesign(
	state: GameState,
	name: BotName,
	random: DeterministicRandom,
): BotAction | undefined {
	if (
		state.models.items.some(
			(model) => model.status === "designing" || model.status === "training",
		)
	) {
		return undefined;
	}
	if (!state.teams.items.some((team) => team.activeProjectId === null)) {
		return undefined;
	}

	const family = MODEL_FAMILIES.find((candidate) => {
		const node = state.research.nodes.find(
			(researchNode) => researchNode.id === MODEL_RESEARCH_NODES[candidate],
		);
		const alreadyDesigned = state.models.items.some(
			(model) => model.family === candidate && model.status !== "shelved",
		);
		return (
			candidate === state.meta.era &&
			node?.status === "completed" &&
			!alreadyDesigned
		);
	});
	if (family === undefined) return undefined;

	const tier = tierFor(name, family, random);
	const preferredFoundation = foundationFor(name, family, random);
	const parent = parentFor(state, family);
	const foundation =
		preferredFoundation === "fresh" || parent === undefined
			? "fresh"
			: preferredFoundation;
	const designCost = TIER_COSTS[tier] + FOUNDATION_COSTS[foundation];
	if (state.company.cash < designCost) return undefined;

	return {
		kind: "design_model",
		spec: {
			name: modelName(family, state.models.items.length + 1),
			family,
			foundation,
			...(foundation === "fresh" ? {} : { parentModelId: parent?.id ?? null }),
			tier,
			dataMix: dataMixFor(family, name, random),
			emphasis: emphasisFor(name, family, random),
		},
	};
}

function chooseComputePurchase(
	state: GameState,
	name: BotName,
	random: DeterministicRandom,
): BotAction | undefined {
	const shortage =
		state.compute.trainingDemand + state.compute.servingDemand >
		state.compute.capacity;
	if (!shortage || state.company.cash < 300) return undefined;
	if (name === "random" && random.nextInt(100) < 30) return undefined;
	return { kind: "buy_compute" };
}

function chooseHire(
	state: GameState,
	name: BotName,
	randomTeamTarget: number,
	_random: DeterministicRandom,
): BotAction | undefined {
	if (state.teams.items.length >= 3 || state.company.cash < 300) {
		return undefined;
	}
	const seedAccepted = state.funding.seed.status === "accepted";
	const target =
		name === "capability-rusher"
			? seedAccepted
				? 3
				: 2
			: name === "evaluator"
				? 2
				: name === "efficiency-first"
					? 1
					: randomTeamTarget;
	if (state.teams.items.length >= target) return undefined;
	const safetyBuffer = name === "random" ? 1 : 2;
	const weeklyBurn = 25 + state.teams.items.length * 50;
	if (state.company.cash - 300 < weeklyBurn * safetyBuffer) {
		return undefined;
	}
	return {
		kind: "hire_team",
		name: `Bot ${name} Team ${state.teams.items.length + 1}`,
	};
}

function chooseResearchAssignment(
	state: GameState,
	name: BotName,
	random: DeterministicRandom,
	researchOrder: readonly string[],
): BotAction | undefined {
	const idleTeam = state.teams.items.find(
		(team) => team.activeProjectId === null,
	);
	if (idleTeam === undefined || state.company.insight <= 0) return undefined;

	const projects = selectAvailableProjects(state).filter(
		(project): project is ResearchProject => project.kind === "research",
	);
	const affordable = projects.filter((project) => {
		const node = state.research.nodes.find(
			(candidate) => candidate.id === project.nodeId,
		);
		return node !== undefined && node.insightCost <= state.company.insight;
	});
	if (affordable.length === 0) return undefined;

	let selected: ResearchProject | undefined;
	if (name === "random") {
		selected = affordable[random.nextInt(affordable.length)];
	} else {
		selected = [...affordable].sort((left, right) => {
			const leftRank = researchOrder.indexOf(left.nodeId);
			const rightRank = researchOrder.indexOf(right.nodeId);
			const normalizedLeft = leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank;
			const normalizedRight =
				rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank;
			return (
				normalizedLeft - normalizedRight || left.id.localeCompare(right.id)
			);
		})[0];
	}
	if (selected === undefined) return undefined;
	return {
		kind: "assign_project",
		teamId: idleTeam.id,
		projectId: selected.id,
	};
}

function tierFor(
	name: BotName,
	family: ModelFamily,
	random: DeterministicRandom,
): ModelTier {
	if (name === "capability-rusher") return "aggressive";
	if (name === "evaluator")
		return family === "multimodal" ? "standard" : "standard";
	if (name === "efficiency-first") return "lean";
	return MODEL_TIERS[random.nextInt(MODEL_TIERS.length)] ?? "lean";
}

function foundationFor(
	name: BotName,
	family: ModelFamily,
	random: DeterministicRandom,
): ModelFoundation {
	if (family === "text") return "fresh";
	if (name === "capability-rusher" || name === "evaluator") return "continued";
	if (name === "efficiency-first") {
		return family === "multimodal" ? "distilled" : "continued";
	}
	return FOUNDATIONS[random.nextInt(FOUNDATIONS.length)] ?? "fresh";
}

function dataMixFor(
	family: ModelFamily,
	name: BotName,
	random: DeterministicRandom,
): ModelDesignSpec["dataMix"] {
	const choices = DATA_MIXES[family];
	if (name !== "random") return { ...choices[0] };
	return { ...(choices[random.nextInt(choices.length)] ?? choices[0]) };
}

function emphasisFor(
	name: BotName,
	_family: ModelFamily,
	random: DeterministicRandom,
): ModelDesignSpec["emphasis"] {
	if (name === "capability-rusher") {
		return { capability: 4, reliability: 1, safety: 0, efficiency: 1 };
	}
	if (name === "evaluator") {
		return { capability: 2, reliability: 2, safety: 1, efficiency: 1 };
	}
	if (name === "efficiency-first") {
		return { capability: 1, reliability: 1, safety: 1, efficiency: 3 };
	}
	const first = random.nextInt(7);
	const second = random.nextInt(7 - first);
	const third = random.nextInt(7 - first - second);
	return {
		capability: first,
		reliability: second,
		safety: third,
		efficiency: 6 - first - second - third,
	};
}

function parentFor(
	state: GameState,
	family: ModelFamily,
): GameState["models"]["items"][number] | undefined {
	const parentFamily = family === "assistant" ? "text" : "assistant";
	return state.models.items.find(
		(model) =>
			model.family === parentFamily &&
			(model.status === "ready" || model.status === "launched"),
	);
}

function modelName(family: ModelFamily, ordinal: number): string {
	const label =
		family === "text"
			? "Text"
			: family === "assistant"
				? "Assistant"
				: "Fusion";
	return `${label}-Bot-${String(ordinal).padStart(2, "0")}`;
}

function researchOrderFor(name: BotName): readonly string[] {
	if (name === "evaluator") return EVALUATOR_RESEARCH_ORDER;
	if (name === "efficiency-first") return EFFICIENCY_RESEARCH_ORDER;
	return MODEL_RESEARCH_ORDER;
}

type LaunchChannelRequirements = Readonly<{
	minEra: "text" | "assistant";
	minimumTrust: number;
	minimumHype: number;
	launchCost: number;
}>;

/** Resource gates mirrored from the engine's product channel balance table. */
const LAUNCH_CHANNEL_REQUIREMENTS = {
	chat: { minEra: "text", minimumTrust: 30, minimumHype: 5, launchCost: 20 },
	developer_api: {
		minEra: "text",
		minimumTrust: 35,
		minimumHype: 15,
		launchCost: 40,
	},
	enterprise: {
		minEra: "assistant",
		minimumTrust: 50,
		minimumHype: 25,
		launchCost: 80,
	},
} as const satisfies Readonly<
	Record<ProductChannel, LaunchChannelRequirements>
>;

const LAUNCH_CHANNELS = ["chat", "developer_api", "enterprise"] as const;

function launchChannelForDecision(
	state: GameState,
	modelId: string,
	requestedChannel: ProductChannel | undefined,
	name: BotName,
	random: DeterministicRandom,
): ProductChannel | undefined {
	const maximumRivalProgress = state.rivals.items.reduce(
		(maximum, rival) =>
			rival.active ? Math.max(maximum, rival.progress) : maximum,
		0,
	);
	const affordableChannels = LAUNCH_CHANNELS.filter((channel) => {
		const requirements = LAUNCH_CHANNEL_REQUIREMENTS[channel];
		const minimumHype =
			requirements.minimumHype + Math.floor(maximumRivalProgress / 25);
		return (
			launchEraIndex(state.meta.era) >= launchEraIndex(requirements.minEra) &&
			state.company.trust >= requirements.minimumTrust &&
			state.company.hype >= minimumHype &&
			state.company.cash >= requirements.launchCost &&
			!state.products.items.some(
				(product) => product.modelId === modelId && product.channel === channel,
			)
		);
	});
	if (requestedChannel !== undefined) {
		return affordableChannels.includes(requestedChannel)
			? requestedChannel
			: undefined;
	}
	return randomLaunchChannel(name, random, affordableChannels);
}

function launchEraIndex(era: "text" | "assistant" | "multimodal"): number {
	return era === "text" ? 0 : era === "assistant" ? 1 : 2;
}

function randomLaunchChannel(
	name: BotName,
	random: DeterministicRandom,
	availableChannels: readonly ProductChannel[],
): ProductChannel | undefined {
	if (availableChannels.length === 0) return undefined;
	if (name !== "random") {
		return availableChannels.includes("chat") ? "chat" : undefined;
	}
	return availableChannels[random.nextInt(availableChannels.length)];
}

function incidentResponse(
	state: GameState,
	name: BotName,
	incident: string,
	riskMode: boolean,
): "repair" | "reduce_scope" | "disclose" {
	if (name === "random") {
		if (
			riskMode &&
			(incident === "quality_safety_scandal" ||
				incident === "data_privacy_incident")
		) {
			return "reduce_scope";
		}
		return ["repair", "reduce_scope", "disclose"][
			new DeterministicRandom(state.meta.week + incident.length).nextInt(3)
		] as "repair" | "reduce_scope" | "disclose";
	}
	if (
		name === "evaluator" ||
		incident === "quality_safety_scandal" ||
		incident === "data_privacy_incident"
	) {
		return "disclose";
	}
	return state.company.cash >= 120 ? "repair" : "disclose";
}

function shouldResumeProduct(
	name: BotName,
	random: DeterministicRandom,
): boolean {
	return name !== "random" || random.nextInt(100) >= 10;
}

class DeterministicRandom {
	private value: number;

	public constructor(seed: number) {
		this.value = seed >>> 0 || 0x6d2b_79f5;
	}

	public nextInt(maxExclusive: number): number {
		this.value = Math.imul(this.value ^ (this.value >>> 15), 1 | this.value);
		this.value += Math.imul(this.value ^ (this.value >>> 7), 61 | this.value);
		this.value = this.value ^ (this.value >>> 14);
		return (this.value >>> 0) % maxExclusive;
	}
}
