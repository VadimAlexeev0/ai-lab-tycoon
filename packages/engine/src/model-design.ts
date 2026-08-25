import type {
	Model,
	ModelEstimates,
	ModelFoundation,
	ModelTrueScores,
} from "./components/models.js";
import { BALANCE } from "./data/balance.js";
import {
	DATA_MIX_DIMENSIONS,
	type DataMix,
	MODEL_DIMENSIONS,
	MODEL_EMPHASIS_DIMENSIONS,
	MODEL_FAMILIES,
	MODEL_FAMILY_IDS,
	MODEL_TIERS,
	type ModelEmphasis,
	type ModelFamilyDefinition,
	type ModelFamilyId,
	type ModelTier,
} from "./data/model-families.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import { nextInt } from "./rng.js";
import type { EngineResult, GameState, RngState } from "./state.js";
import {
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertNullableString,
	assertObject,
	assertString,
} from "./validation.js";

const MODEL_FOUNDATIONS = ["fresh", "continued", "distilled"] as const;
const DEFAULT_DATA_MIX: DataMix = { general: 50, code: 30, multimodal: 20 };
const DEFAULT_EMPHASIS: ModelEmphasis = {
	capability: 2,
	reliability: 2,
	safety: 1,
	efficiency: 1,
};

export type ModelDesignSpec = Readonly<{
	name: string;
	family?: ModelFamilyId;
	/** Alias accepted for clients that call the field modelFamily. */
	modelFamily?: ModelFamilyId;
	foundation: ModelFoundation;
	parentModelId?: string | null;
	/** Alias accepted for clients that call the parent a foundation model. */
	foundationModelId?: string | null;
	/** Short alias for parentModelId. */
	parentId?: string | null;
	tier?: ModelTier;
	/** Alias accepted for clients that call the field computeTier. */
	computeTier?: ModelTier;
	dataMix: DataMix;
	emphasis: ModelEmphasis;
	/** Use a specific idle team instead of the first idle team. */
	teamId?: string;
	assignedTeamId?: string;
}>;

type NormalizedModelDesignSpec = Readonly<{
	name: string;
	family: ModelFamilyId;
	foundation: ModelFoundation;
	parentModelId: string | null;
	tier: ModelTier;
	dataMix: DataMix;
	emphasis: ModelEmphasis;
	teamId?: string;
}>;

/**
 * Design and immediately assign one training run. The input state is never
 * mutated; IDs are allocated from the returned state's counters in order.
 */
export function designModel(
	state: GameState,
	spec: ModelDesignSpec,
): EngineResult {
	assertGameState(state);
	const normalized = normalizeModelDesignSpec(spec);
	const family = getFamily(normalized.family);
	const tier = BALANCE.modelTiers[normalized.tier];

	if (!family.allowedEras.includes(state.meta.era)) {
		throw new Error(
			`Model family ${family.id} is not available in the ${state.meta.era} era`,
		);
	}
	const researchNode = state.research.nodes.find(
		(node) => node.id === family.unlockedByResearchNodeId,
	);
	if (researchNode?.status !== "completed") {
		throw new Error(
			`Model family ${family.id} requires completed research node ${family.unlockedByResearchNodeId}`,
		);
	}
	for (const dimension of DATA_MIX_DIMENSIONS) {
		const minimum = family.dataMixRequirements[dimension];
		if (normalized.dataMix[dimension] < minimum) {
			throw new Error(
				`Data mix for ${family.id} must include at least ${minimum} ${dimension} data`,
			);
		}
	}

	if (
		state.models.items.some(
			(model) => model.status === "designing" || model.status === "training",
		) ||
		state.projects.items.some(
			(project) => project.kind === "training" && project.status === "active",
		)
	) {
		throw new Error("Only one active training run is allowed");
	}

	validateFoundation(state, normalized);
	const foundationBalance = BALANCE.modelFoundations[normalized.foundation];
	const totalCost = tier.cost + foundationBalance.cost;
	const team = selectTeam(state, normalized.teamId);
	if (state.company.cash < totalCost) {
		throw new Error(
			`Insufficient cash for ${normalized.tier} ${normalized.foundation} model design cost ${totalCost}`,
		);
	}

	let allocated = allocateId(state, "model");
	const modelId = allocated.id;
	allocated = allocateId(allocated.state, "project");
	const projectId = allocated.id;
	allocated = allocateId(allocated.state, "command");
	const commandId = allocated.id;

	const model: Model = {
		id: modelId,
		name: normalized.name,
		family: normalized.family,
		foundation: normalized.foundation,
		parentModelId: normalized.parentModelId,
		tier: normalized.tier,
		scoreCeiling: tier.scoreCeiling,
		dataMix: { ...normalized.dataMix },
		emphasis: { ...normalized.emphasis },
		status: "designing",
		projectId,
	};
	const trainingProject = {
		kind: "training" as const,
		id: projectId,
		teamId: team.id,
		modelId,
		status: "active" as const,
		progress: BALANCE.startingProjectProgress,
		duration: tier.duration + foundationBalance.duration,
	};
	const nextState: GameState = {
		...allocated.state,
		company: {
			...allocated.state.company,
			cash: allocated.state.company.cash - totalCost,
		},
		compute: {
			...allocated.state.compute,
			trainingDemand: tier.trainingCompute,
		},
		teams: {
			items: allocated.state.teams.items.map((item) =>
				item.id === team.id
					? { ...item, activeProjectId: projectId }
					: { ...item },
			),
		},
		projects: {
			items: [
				...allocated.state.projects.items.map((item) => ({ ...item })),
				trainingProject,
			],
		},
		models: {
			items: [
				...allocated.state.models.items.map((item) => ({ ...item })),
				model,
			],
			activeModelId: modelId,
		},
		commandLog: [
			...allocated.state.commandLog,
			{
				id: commandId,
				kind: "design_model",
				week: state.meta.week,
				modelId,
				projectId,
				teamId: team.id,
				name: normalized.name,
				family: normalized.family,
				foundation: normalized.foundation,
				parentModelId: normalized.parentModelId,
				tier: normalized.tier,
				dataMix: { ...normalized.dataMix },
				emphasis: { ...normalized.emphasis },
			},
		],
	};

	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}

/** Generate hidden scores and separate noisy estimates at training completion. */
export function generateTrueScores(
	rng: RngState,
	model: Model,
	parent?: Model,
): { rng: RngState; trueScores: ModelTrueScores; estimates: ModelEstimates } {
	const family = getFamily(model.family ?? "text");
	const tier = BALANCE.modelTiers[model.tier ?? "standard"];
	const dataMix = model.dataMix ?? DEFAULT_DATA_MIX;
	const emphasis = model.emphasis ?? DEFAULT_EMPHASIS;
	if (
		model.foundation !== "fresh" &&
		(parent === undefined ||
			(parent.status !== "ready" && parent.status !== "launched") ||
			parent.trueScores === undefined)
	) {
		throw new Error(
			`The ${model.foundation} foundation requires a ready or launched scored parent model`,
		);
	}

	let nextRng = rng;
	const trueScores = {} as Record<(typeof MODEL_DIMENSIONS)[number], number>;
	const estimateScores = {} as Record<
		(typeof MODEL_DIMENSIONS)[number],
		number
	>;

	for (const dimension of MODEL_DIMENSIONS) {
		const scoreDraw = nextInt(
			nextRng,
			"training",
			BALANCE.modelScore.trainingJitterMin,
			BALANCE.modelScore.trainingJitterMax,
		);
		nextRng = scoreDraw.rng;
		const profileHint = family.baseScoreProfile[dimension];
		const dataContribution = dataContributionFor(dimension, dataMix);
		const emphasisContribution = emphasisContributionFor(dimension, emphasis);
		const tierContribution = Math.trunc(
			(tier.scoreCeiling - BALANCE.modelScore.tierBaseline) /
				BALANCE.modelScore.tierDivisor,
		);
		const rawScore =
			BALANCE.modelScore.base +
			profileHint * BALANCE.modelScore.profileWeight +
			Math.trunc(
				dataContribution / BALANCE.modelScore.dataContributionDivisor,
			) +
			emphasisContribution * BALANCE.modelScore.emphasisWeight +
			tierContribution +
			scoreDraw.value;
		const floor = foundationFloorFor(
			model.foundation,
			parent?.trueScores?.[dimension],
		);
		trueScores[dimension] = clamp(
			Math.max(rawScore, floor),
			0,
			tier.scoreCeiling,
		);

		const estimateDraw = nextInt(
			nextRng,
			"training",
			BALANCE.modelScore.estimateNoiseMin,
			BALANCE.modelScore.estimateNoiseMax,
		);
		nextRng = estimateDraw.rng;
		const noisyEstimate = clamp(
			trueScores[dimension] +
				BALANCE.modelScore.estimateBias +
				estimateDraw.value,
			0,
			100,
		);
		estimateScores[dimension] =
			noisyEstimate === trueScores[dimension]
				? clamp(
						trueScores[dimension] < 100
							? trueScores[dimension] +
									BALANCE.modelScore.minimumEstimateBandWidth
							: trueScores[dimension] -
									BALANCE.modelScore.minimumEstimateBandWidth,
						0,
						100,
					)
				: noisyEstimate;
	}

	return {
		rng: nextRng,
		trueScores,
		estimates: deriveEstimateBands(trueScores, 0, estimateScores),
	};
}

/**
 * Turn hidden scores into public estimate bands. Point estimates are kept
 * separate from true scores so the band center cannot reveal the hidden value.
 */
export function deriveEstimateBands(
	trueScores: ModelTrueScores,
	evaluationCoverage = 0,
	estimateScores?: ModelTrueScores,
): ModelEstimates {
	if (estimateScores === undefined) {
		throw new Error("Separate noisy estimate scores are required");
	}
	const normalizedCoverage = normalizeEvaluationCoverage(evaluationCoverage);
	const width = Math.max(
		BALANCE.modelScore.minimumEstimateBandWidth,
		BALANCE.defaultEstimateBandWidth -
			normalizedCoverage *
				BALANCE.modelScore.estimateBandWidthReductionPerCoverage,
	);
	const estimates = {} as Record<
		(typeof MODEL_DIMENSIONS)[number],
		{ estimate: number; lower: number; upper: number }
	>;
	for (const dimension of MODEL_DIMENSIONS) {
		const trueScore = trueScores[dimension];
		if (!Number.isInteger(trueScore) || trueScore < 0 || trueScore > 100) {
			throw new Error(
				`True score for ${dimension} must be an integer between 0 and 100`,
			);
		}
		const pointEstimate = estimateScores[dimension];
		if (!Number.isFinite(pointEstimate)) {
			throw new Error(`Estimate for ${dimension} must be finite`);
		}
		const estimate = clamp(Math.trunc(pointEstimate), 0, 100);
		estimates[dimension] = {
			estimate,
			lower: Math.max(0, estimate - width),
			upper: Math.min(100, estimate + width),
		};
	}
	return estimates;
}

function normalizeEvaluationCoverage(value: number): number {
	if (!Number.isFinite(value)) {
		throw new Error("Evaluation coverage must be finite");
	}
	return Math.max(0, Math.trunc(value));
}

function normalizeModelDesignSpec(value: unknown): NormalizedModelDesignSpec {
	assertObject(value, "model design spec");
	const allowed = new Set([
		"name",
		"family",
		"modelFamily",
		"foundation",
		"parentModelId",
		"foundationModelId",
		"parentId",
		"tier",
		"computeTier",
		"dataMix",
		"emphasis",
		"teamId",
		"assignedTeamId",
	]);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowed.has(key)) {
			throw new Error(
				`Model design spec contains an unexpected field: ${String(key)}`,
			);
		}
	}
	if (!Object.hasOwn(value, "name")) {
		throw new Error("Model name is required");
	}
	assertString(value.name, "Model name");
	if (value.name.trim().length === 0) {
		throw new Error("Model name must not be empty");
	}
	if (!Object.hasOwn(value, "foundation")) {
		throw new Error("Model foundation is required");
	}
	assertEnum(value.foundation, MODEL_FOUNDATIONS, "Model foundation");
	if (!Object.hasOwn(value, "dataMix")) {
		throw new Error("Model data mix is required");
	}
	const dataMix = normalizeDataMix(value.dataMix);
	if (!Object.hasOwn(value, "emphasis")) {
		throw new Error("Model emphasis is required");
	}
	const emphasis = normalizeEmphasis(value.emphasis);
	const family = resolveEnumAlias(
		value.family,
		value.modelFamily,
		"Model family",
		MODEL_FAMILY_IDS,
	);
	const tier = resolveEnumAlias(
		value.tier,
		value.computeTier,
		"Model compute tier",
		MODEL_TIERS,
	);
	const parentModelId = normalizeParentId(value);
	const teamId = normalizeTeamId(value);
	return {
		name: value.name,
		family,
		foundation: value.foundation,
		parentModelId,
		tier,
		dataMix,
		emphasis,
		...(teamId === undefined ? {} : { teamId }),
	};
}

function normalizeDataMix(value: unknown): DataMix {
	assertExactObject(value, DATA_MIX_DIMENSIONS, "Model data mix");
	for (const dimension of DATA_MIX_DIMENSIONS) {
		assertNonNegativeInteger(value[dimension], `Model data mix ${dimension}`);
	}
	const dataMix = value as {
		general: number;
		code: number;
		multimodal: number;
	};
	if (dataMix.general + dataMix.code + dataMix.multimodal !== 100) {
		throw new Error("Model data mix must total exactly 100");
	}
	return {
		general: dataMix.general,
		code: dataMix.code,
		multimodal: dataMix.multimodal,
	};
}

function normalizeEmphasis(value: unknown): ModelEmphasis {
	assertExactObject(value, MODEL_EMPHASIS_DIMENSIONS, "Model emphasis");
	for (const dimension of MODEL_EMPHASIS_DIMENSIONS) {
		assertNonNegativeInteger(value[dimension], `Model emphasis ${dimension}`);
	}
	const emphasis = value as {
		capability: number;
		reliability: number;
		safety: number;
		efficiency: number;
	};
	const total =
		emphasis.capability +
		emphasis.reliability +
		emphasis.safety +
		emphasis.efficiency;
	if (total !== BALANCE.modelEmphasisPoints) {
		throw new Error(
			`Model emphasis must total exactly ${BALANCE.modelEmphasisPoints}`,
		);
	}
	return {
		capability: emphasis.capability,
		reliability: emphasis.reliability,
		safety: emphasis.safety,
		efficiency: emphasis.efficiency,
	};
}

function normalizeParentId(value: Record<string, unknown>): string | null {
	const aliases = [
		value.parentModelId,
		value.foundationModelId,
		value.parentId,
	].filter((candidate) => candidate !== undefined);
	if (aliases.length === 0) {
		return null;
	}
	const first = aliases[0];
	for (const alias of aliases) {
		if (alias !== first) {
			throw new Error("Model parent fields must agree");
		}
	}
	assertNullableString(first, "Model parent id");
	if (first !== null) {
		assertIdentifier(first, "Model parent id");
	}
	return first;
}

function normalizeTeamId(value: Record<string, unknown>): string | undefined {
	const aliases = [value.teamId, value.assignedTeamId].filter(
		(candidate) => candidate !== undefined,
	);
	if (aliases.length === 0) {
		return undefined;
	}
	const first = aliases[0];
	for (const alias of aliases) {
		if (alias !== first) {
			throw new Error("Model team fields must agree");
		}
	}
	assertIdentifier(first, "Model team id");
	return first;
}

function resolveEnumAlias<T extends string>(
	firstValue: unknown,
	secondValue: unknown,
	path: string,
	values: readonly T[],
): T {
	if (firstValue === undefined && secondValue === undefined) {
		throw new Error(`${path} is required`);
	}
	if (
		firstValue !== undefined &&
		secondValue !== undefined &&
		firstValue !== secondValue
	) {
		throw new Error(`${path} aliases must agree`);
	}
	const selected = firstValue === undefined ? secondValue : firstValue;
	assertEnum(selected, values, path);
	return selected;
}

function getFamily(id: ModelFamilyId): ModelFamilyDefinition {
	const family = MODEL_FAMILIES.find((candidate) => candidate.id === id);
	if (family === undefined) {
		throw new Error(`Unknown model family: ${id}`);
	}
	return family;
}

function validateFoundation(
	state: GameState,
	spec: NormalizedModelDesignSpec,
): Model | undefined {
	if (spec.foundation === "fresh") {
		if (spec.parentModelId !== null) {
			throw new Error("Fresh foundation cannot specify a parent model");
		}
		return undefined;
	}
	if (spec.parentModelId === null) {
		throw new Error(
			`${spec.foundation} foundation requires a compatible parent model`,
		);
	}
	const parent = state.models.items.find(
		(model) => model.id === spec.parentModelId,
	);
	if (parent === undefined) {
		throw new Error(`Unknown parent model: ${spec.parentModelId}`);
	}
	if (parent.status !== "ready" && parent.status !== "launched") {
		throw new Error(
			`Parent model ${parent.id} must be ready or launched before it can be used`,
		);
	}
	if (parent.trueScores === undefined) {
		throw new Error(
			`Parent model ${parent.id} must have true scores before it can be used`,
		);
	}
	if (!isCompatibleParent(parent, spec.family)) {
		throw new Error(
			`Parent model ${parent.id} is not compatible with ${spec.family} foundation`,
		);
	}
	return parent;
}

function isCompatibleParent(
	parent: Model,
	targetFamilyId: ModelFamilyId,
): boolean {
	if (parent.family === undefined) {
		return false;
	}
	const parentEra = eraIndex(parent.family);
	const targetEra = eraIndex(targetFamilyId);
	return parentEra <= targetEra;
}

function eraIndex(familyId: ModelFamilyId): number {
	const family = getFamily(familyId);
	const era = family.allowedEras[0];
	return era === "text" ? 0 : era === "assistant" ? 1 : 2;
}

function selectTeam(
	state: GameState,
	requestedTeamId: string | undefined,
): { id: string } {
	const team =
		requestedTeamId === undefined
			? state.teams.items.find(
					(candidate) => candidate.activeProjectId === null,
				)
			: state.teams.items.find((candidate) => candidate.id === requestedTeamId);
	if (team === undefined) {
		throw new Error(
			requestedTeamId === undefined
				? "Model training requires an idle team"
				: `Unknown team for model training: ${requestedTeamId}`,
		);
	}
	if (team.activeProjectId !== null) {
		throw new Error(`Team ${team.id} must be idle before model training`);
	}
	return team;
}

function dataContributionFor(
	dimension: (typeof MODEL_DIMENSIONS)[number],
	dataMix: DataMix,
): number {
	const weights = BALANCE.modelScore.dataMixWeights[dimension];
	return DATA_MIX_DIMENSIONS.reduce(
		(total, dataDimension) =>
			total + dataMix[dataDimension] * weights[dataDimension],
		0,
	);
}

function emphasisContributionFor(
	dimension: (typeof MODEL_DIMENSIONS)[number],
	emphasis: ModelEmphasis,
): number {
	const weights = BALANCE.modelScore.emphasisWeights[dimension];
	return MODEL_EMPHASIS_DIMENSIONS.reduce(
		(total, emphasisDimension) =>
			total + emphasis[emphasisDimension] * weights[emphasisDimension],
		0,
	);
}

function foundationFloorFor(
	foundation: ModelFoundation,
	parentScore: number | undefined,
): number {
	const floorPercent = BALANCE.modelFoundations[foundation].floorPercent;
	if (floorPercent === 0) {
		return 0;
	}
	if (parentScore === undefined) {
		throw new Error(
			`The ${foundation} foundation requires a scored parent model`,
		);
	}
	return Math.ceil((parentScore * floorPercent) / 100);
}

function clamp(value: number, lower: number, upper: number): number {
	return Math.min(upper, Math.max(lower, value));
}
