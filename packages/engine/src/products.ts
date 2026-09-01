import type { Model } from "./components/models.js";
import type { Product, ProductChannel } from "./components/products.js";
import type { Fact } from "./components/reports.js";
import { withRecomputedCompute } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import {
	MODEL_DIMENSIONS,
	type ModelDimension,
} from "./data/model-families.js";
import { assertRunActive } from "./guards.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { EngineResult, GameState } from "./state.js";
import { appendFactsAsReports } from "./systems/reporting.js";
import { assertEnum, assertIdentifier, assertObject } from "./validation.js";

const PRODUCT_CHANNELS = ["chat", "developer_api", "enterprise"] as const;
type LaunchChannelInput = ProductChannel | "api";
export type ProductLaunchRequest = Readonly<{
	modelId: string;
	channel: LaunchChannelInput;
}>;

/** Launch a product channel from a model that has a public scored estimate. */
export function launchProduct(
	state: GameState,
	modelId: string,
	channel: LaunchChannelInput,
): EngineResult;
export function launchProduct(
	state: GameState,
	request: ProductLaunchRequest,
): EngineResult;
export function launchProduct(
	state: GameState,
	modelOrRequest: string | ProductLaunchRequest,
	channel?: LaunchChannelInput,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	const request = normalizeRequest(modelOrRequest, channel);
	const result = applyProductLaunch(state, request, true);
	const reportedState = appendFactsAsReports(result.state, result.facts);
	assertGameState(reportedState);
	return {
		...result,
		state: reportedState,
	};
}

/** Apply an already validated launch choice without adding another choice log. */
export function applyProductLaunch(
	state: GameState,
	request: Readonly<{ modelId: string; channel: ProductChannel }>,
	appendCommand: boolean,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	const model = state.models.items.find(
		(candidate) => candidate.id === request.modelId,
	);
	if (model === undefined) {
		throw new Error(`Cannot launch an unknown model: ${request.modelId}`);
	}
	if (model.status !== "ready" && model.status !== "launched") {
		throw new Error("Only a ready or launched model can be launched");
	}
	const tuning = BALANCE.productChannels[request.channel];
	if (state.meta.era === "text" && tuning.minEra !== "text") {
		throw new Error(
			`${request.channel} products require the ${tuning.minEra} era`,
		);
	}
	if (eraIndex(state.meta.era) < eraIndex(tuning.minEra)) {
		throw new Error(
			`${request.channel} products require the ${tuning.minEra} era`,
		);
	}
	if (state.company.trust < tuning.minimumTrust) {
		throw new Error(
			`${request.channel} products require Trust ${tuning.minimumTrust}`,
		);
	}
	const minimumHype = rivalLaunchPressure(state, tuning.minimumHype);
	if (state.company.hype < minimumHype) {
		throw new Error(`${request.channel} products require Hype ${minimumHype}`);
	}
	if (state.company.cash < tuning.launchCost) {
		throw new Error(
			`Insufficient cash for ${request.channel} launch cost ${tuning.launchCost}`,
		);
	}
	if (
		state.products.items.some(
			(product) =>
				product.modelId === model.id && product.channel === request.channel,
		)
	) {
		throw new Error(
			`Model ${model.id} already has a ${request.channel} product`,
		);
	}
	const quality = effectiveQuality(model, tuning.qualityDimensions);
	assertChannelScore(
		model,
		"capability",
		tuning.minimumCapability,
		request.channel,
	);
	assertChannelScore(model, "coding", tuning.minimumCoding, request.channel);
	assertChannelScore(
		model,
		"reliability",
		tuning.minimumReliability,
		request.channel,
	);
	assertChannelScore(model, "safety", tuning.minimumSafety, request.channel);

	const productAllocation = allocateId(state, "product");
	const commandAllocation = appendCommand
		? allocateId(productAllocation.state, "command")
		: { state: productAllocation.state, id: "" };
	const product: Product = {
		id: productAllocation.id,
		channel: request.channel,
		modelId: model.id,
		status: "operating",
		users: tuning.baseUsers,
		lastRevenue: 0,
		cumulativeRevenue: 0,
		servingDemand: tuning.baseUsers * tuning.servingComputePerUser,
		effectiveQuality: quality,
	};
	const nextState: GameState = {
		...commandAllocation.state,
		company: {
			...commandAllocation.state.company,
			cash: commandAllocation.state.company.cash - tuning.launchCost,
		},
		models: {
			...commandAllocation.state.models,
			items: commandAllocation.state.models.items.map((candidate) =>
				candidate.id === model.id
					? { ...candidate, status: "launched" }
					: cloneModel(candidate),
			),
			activeModelId: model.id,
		},
		products: {
			items: [
				...commandAllocation.state.products.items.map(cloneProduct),
				product,
			],
		},
		terminal:
			model.family === "multimodal" && !state.terminal.frontierReached
				? { ...commandAllocation.state.terminal, frontierReached: true }
				: { ...commandAllocation.state.terminal },
		commandLog: appendCommand
			? [
					...commandAllocation.state.commandLog,
					{
						id: commandAllocation.id,
						kind: "launch_product",
						week: state.meta.week,
						productId: product.id,
						modelId: model.id,
						channel: request.channel,
					},
				]
			: commandAllocation.state.commandLog.map((entry) => ({ ...entry })),
	};
	const facts: Fact[] = [
		{
			kind: "resource_changed",
			resource: "cash",
			amount: -tuning.launchCost,
			week: state.meta.week,
		},
		{
			kind: "product_launched",
			productId: product.id,
			channel: request.channel,
			week: state.meta.week,
		},
	];
	if (model.family === "multimodal" && !state.terminal.frontierReached) {
		facts.push({
			kind: "milestone_reached",
			milestone: "first_multimodal_launch",
			week: state.meta.week,
		});
	}
	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState);
	return { state: recomputedState, facts, pending: [] };
}

export function applyProductResume(
	state: GameState,
	productId: string,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	assertIdentifier(productId, "Product id");
	const product = state.products.items.find((item) => item.id === productId);
	if (product === undefined) {
		throw new Error(`Cannot resume an unknown product: ${productId}`);
	}
	if (product.status !== "paused") {
		throw new Error(`Only a paused product can be resumed: ${productId}`);
	}
	const model = state.models.items.find(
		(candidate) => candidate.id === product.modelId,
	);
	if (model === undefined) {
		throw new Error(`Product ${product.id} references an unknown model`);
	}
	const tuning = BALANCE.productChannels[product.channel];
	// V1 pause policy is persist-with-decay=0: preserve the current user base,
	// then recompute serving demand from those users without a growth tick.
	const users = product.users ?? tuning.baseUsers;
	const resumedProduct: Product = {
		...product,
		status: "operating",
		users,
		lastRevenue: 0,
		servingDemand: users * tuning.servingComputePerUser,
		effectiveQuality: effectiveProductQuality(model, product.channel),
	};
	const commandAllocation = allocateId(state, "command");
	const nextState: GameState = {
		...commandAllocation.state,
		products: {
			items: state.products.items.map((candidate) =>
				candidate.id === product.id ? resumedProduct : cloneProduct(candidate),
			),
		},
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "product_resume",
				week: state.meta.week,
				productId: product.id,
			},
		],
	};
	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState);
	const facts: Fact[] = [
		{
			kind: "product_resumed",
			productId: product.id,
			channel: product.channel,
			week: state.meta.week,
		},
	];
	const reportedState = appendFactsAsReports(recomputedState, facts);
	assertGameState(reportedState);
	return {
		state: reportedState,
		facts,
		pending: state.decisions.pending.map((decision) => ({ ...decision })),
	};
}
export function rivalLaunchPressure(
	state: GameState,
	baseMinimumHype: number,
): number {
	const maximumProgress = state.rivals.items.reduce(
		(maximum, rival) =>
			rival.active ? Math.max(maximum, rival.progress) : maximum,
		0,
	);
	return baseMinimumHype + Math.floor(maximumProgress / 25);
}

export function isProductLaunchEligible(
	state: GameState,
	modelId: string,
	channel: ProductChannel,
): boolean {
	const model = state.models.items.find(
		(candidate) => candidate.id === modelId,
	);
	if (
		model === undefined ||
		(model.status !== "ready" && model.status !== "launched")
	) {
		return false;
	}
	const tuning = BALANCE.productChannels[channel];
	const minimumHype = rivalLaunchPressure(state, tuning.minimumHype);
	if (
		eraIndex(state.meta.era) < eraIndex(tuning.minEra) ||
		state.company.trust < tuning.minimumTrust ||
		state.company.hype < minimumHype ||
		state.company.cash < tuning.launchCost ||
		state.products.items.some(
			(product) => product.modelId === modelId && product.channel === channel,
		)
	) {
		return false;
	}
	try {
		assertChannelScore(model, "capability", tuning.minimumCapability, channel);
		assertChannelScore(model, "coding", tuning.minimumCoding, channel);
		assertChannelScore(
			model,
			"reliability",
			tuning.minimumReliability,
			channel,
		);
		assertChannelScore(model, "safety", tuning.minimumSafety, channel);
		return true;
	} catch {
		return false;
	}
}

export function effectiveProductQuality(
	model: Model,
	channel: ProductChannel,
): number {
	return effectiveQuality(
		model,
		BALANCE.productChannels[channel].qualityDimensions,
	);
}

function normalizeRequest(
	modelOrRequest: string | ProductLaunchRequest,
	channel?: LaunchChannelInput,
): { modelId: string; channel: ProductChannel } {
	if (typeof modelOrRequest === "string") {
		assertIdentifier(modelOrRequest, "Launch model id");
		if (channel === undefined) {
			throw new Error("Product channel is required");
		}
		return { modelId: modelOrRequest, channel: normalizeChannel(channel) };
	}
	assertObject(modelOrRequest, "Product launch request");
	if (!Object.hasOwn(modelOrRequest, "modelId")) {
		throw new Error("Launch model id is required");
	}
	if (!Object.hasOwn(modelOrRequest, "channel")) {
		throw new Error("Product channel is required");
	}
	assertIdentifier(modelOrRequest.modelId, "Launch model id");
	return {
		modelId: modelOrRequest.modelId,
		channel: normalizeChannel(modelOrRequest.channel),
	};
}

function normalizeChannel(value: unknown): ProductChannel {
	if (value === "api") return "developer_api";
	assertEnum(value, PRODUCT_CHANNELS, "Product channel");
	return value;
}

function effectiveQuality(
	model: Model,
	dimensions: readonly ModelDimension[],
): number {
	if (model.estimates === undefined) {
		throw new Error("Model must have estimates before it can be launched");
	}
	let total = 0;
	for (const dimension of dimensions) {
		const band = model.estimates[dimension];
		if (band === undefined) {
			throw new Error(`Model estimate is missing ${dimension}`);
		}
		total += band.estimate;
	}
	return Math.trunc(total / dimensions.length);
}

function assertChannelScore(
	model: Model,
	dimension: ModelDimension,
	minimum: number,
	channel: ProductChannel,
): void {
	if (minimum === 0) return;
	if (model.estimates === undefined) {
		throw new Error("Model must have estimates before it can be launched");
	}
	const estimate = model.estimates[dimension];
	if (estimate === undefined || estimate.estimate < minimum) {
		throw new Error(
			`${channel} products require ${dimension} estimate ${minimum}`,
		);
	}
}

function eraIndex(era: "text" | "assistant" | "multimodal"): number {
	return era === "text" ? 0 : era === "assistant" ? 1 : 2;
}

function cloneProduct(product: Product): Product {
	return { ...product };
}

function cloneModel(model: Model): Model {
	return {
		...model,
		...(model.dataMix === undefined ? {} : { dataMix: { ...model.dataMix } }),
		...(model.dataAllocation === undefined
			? {}
			: {
					dataAllocation: model.dataAllocation.map((allocation) => ({
						...allocation,
					})),
				}),
		...(model.dataDebt === undefined ? {} : { dataDebt: model.dataDebt }),
		...(model.emphasis === undefined
			? {}
			: { emphasis: { ...model.emphasis } }),
		...(model.trueScores === undefined
			? {}
			: { trueScores: { ...model.trueScores } }),
		...(model.estimates === undefined
			? {}
			: { estimates: cloneEstimates(model.estimates) }),
	};
}

function cloneEstimates(
	estimates: NonNullable<Model["estimates"]>,
): NonNullable<Model["estimates"]> {
	return Object.fromEntries(
		MODEL_DIMENSIONS.map((dimension) => [
			dimension,
			{ ...estimates[dimension] },
		]),
	) as NonNullable<Model["estimates"]>;
}
