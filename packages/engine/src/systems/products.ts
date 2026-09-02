import type { Product } from "../components/products.js";
import type { Fact } from "../components/reports.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import {
	BALANCE,
	type ProductPressureChannelBalance,
} from "../data/balance.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import { deriveKnowledgePressure } from "../knowledge-cutoff.js";
import {
	effectiveProductQuality,
	isProductLaunchEligible,
} from "../products.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/**
 * Operate launched channels after training. Revenue uses public estimate
 * centers, never a model's hidden true scores. Product pressure intentionally
 * keeps nominal growth separate from demand multipliers: market pressure can
 * throttle service without silently changing the nominal growth gate.
 */
export const productsSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	const facts: Fact[] = [];
	let cash = state.company.cash;
	let hype = state.company.hype;
	let trust = state.company.trust;
	const reservations = computeReservations(state);
	const evaluationDemand = reservations.evaluationDemand;
	const projections = state.products.items.flatMap((product) => {
		if (product.status !== "operating") return [];
		const model = state.models.items.find(
			(candidate) => candidate.id === product.modelId,
		);
		if (model === undefined) {
			throw new Error(`Product ${product.id} references an unknown model`);
		}
		const tuning = BALANCE.productChannels[product.channel];
		const pricing = BALANCE.productPressure.channels[product.channel];
		const pressure = deriveKnowledgePressure(model, context.week);
		const currentUsers = product.users ?? tuning.baseUsers;
		const nominalGrowthUsers = safeAdd(
			currentUsers,
			tuning.usersPerWeek,
			`Product ${product.id} nominal users`,
		);
		const nominalDemand = safeMultiply(
			nominalGrowthUsers,
			tuning.servingComputePerUser,
			`Product ${product.id} nominal serving demand`,
		);
		const price = product.price ?? pricing.defaultPrice;
		const marketDemandFactor = marketDemandFactorFor(
			state.company.hype,
			price,
			pricing,
		);
		const demandFactor = safePercentProduct(
			marketDemandFactor,
			pressure.demandFactor,
			`Product ${product.id} demand factor`,
		);
		return [
			{
				product,
				model,
				tuning,
				pricing,
				pressure,
				currentUsers,
				nominalGrowthUsers,
				nominalDemand,
				price,
				marketDemandFactor,
				demandFactor,
				projectedDemand: demandForUsers(
					nominalGrowthUsers,
					tuning.servingComputePerUser,
					demandFactor,
					`Product ${product.id} projected demand`,
				),
			},
		];
	});

	// This reservation deliberately uses nominal users and excludes pressure
	// multipliers. It preserves the V1 "growth only when nominal service can
	// fit" behavior while the measured demand below can still overload serving.
	const projectedNominalDemand = projections.reduce(
		(total, projection) =>
			safeAdd(
				total,
				projection.nominalDemand,
				"Projected nominal serving demand",
			),
		0,
	);
	const allocatedNominalServing = Math.min(
		state.compute.capacity,
		projectedNominalDemand,
	);
	const allocatedProjectedServingCapacity = Math.min(
		Math.max(0, state.compute.capacity - evaluationDemand),
		projections.reduce(
			(total, projection) =>
				safeAdd(
					total,
					projection.projectedDemand,
					"Projected market serving demand",
				),
			0,
		),
	);
	const projectedMarketDemand = projections.reduce(
		(total, projection) =>
			safeAdd(
				total,
				projection.projectedDemand,
				"Projected market serving demand",
			),
		0,
	);
	const projectionsWithPressure = projections.map((projection) => {
		const allocatedNominalProductServing = servingAllocation(
			projection.nominalDemand,
			projectedNominalDemand,
			allocatedNominalServing,
		);
		const allocatedProjectedProductServing = servingAllocation(
			projection.projectedDemand,
			projectedMarketDemand,
			allocatedProjectedServingCapacity,
		);
		const growthThrottled =
			projection.nominalGrowthUsers > projection.currentUsers &&
			projection.nominalDemand > allocatedNominalProductServing;
		const serviceThrottled =
			projection.projectedDemand > allocatedProjectedProductServing;
		const quality = effectiveProductQuality(
			projection.model,
			projection.product.channel,
			context.week,
		);
		const satisfaction = satisfactionFor(
			projection,
			quality,
			sharePercent(
				projection.projectedDemand,
				allocatedProjectedProductServing,
			),
		);
		const churnRate = churnRateFor(satisfaction);
		const churnedUsers = Math.min(
			projection.currentUsers,
			Math.trunc(
				safeMultiply(
					projection.currentUsers,
					churnRate,
					`Product ${projection.product.id} churn`,
				) / 100,
			),
		);
		const acquisitionFactor = Math.min(100, projection.demandFactor);
		const potentialNewUsers = Math.trunc(
			safeMultiply(
				projection.tuning.usersPerWeek,
				acquisitionFactor,
				`Product ${projection.product.id} acquisition`,
			) / 100,
		);
		const newUsers =
			growthThrottled || serviceThrottled ? 0 : potentialNewUsers;
		const users = Math.max(
			0,
			projection.currentUsers - churnedUsers + newUsers,
		);
		return {
			...projection,
			allocatedNominalProductServing,
			allocatedProjectedProductServing,
			growthThrottled,
			serviceThrottled,
			quality,
			satisfaction,
			churnRate,
			churnedUsers,
			newUsers,
			users,
		};
	});

	const totalServingDemand = projectionsWithPressure.reduce(
		(total, projection) =>
			safeAdd(
				total,
				demandForUsers(
					projection.users,
					projection.tuning.servingComputePerUser,
					projection.demandFactor,
					`Product ${projection.product.id} serving demand`,
				),
				"Total serving demand",
			),
		0,
	);
	const availableServingCapacity = Math.max(
		0,
		state.compute.capacity - evaluationDemand,
	);
	const allocatedAvailableServing = Math.min(
		availableServingCapacity,
		totalServingDemand,
	);
	const productsById = new Map(
		projectionsWithPressure.map((projection) => [
			projection.product.id,
			projection,
		]),
	);
	const nextProducts: Product[] = [];
	let activeProductCount = 0;
	let earnedHype = 0;

	for (const product of state.products.items) {
		const operating = productsById.get(product.id);
		if (operating === undefined) {
			const nextProduct = cloneProduct(product);
			if (product.status !== "operating") {
				nextProduct.servingDemand = 0;
				nextProduct.lastRevenue = 0;
			}
			nextProducts.push(nextProduct);
			continue;
		}

		activeProductCount += 1;
		const servingDemand = demandForUsers(
			operating.users,
			operating.tuning.servingComputePerUser,
			operating.demandFactor,
			`Product ${product.id} serving demand`,
		);
		const allocatedProductServing = servingAllocation(
			servingDemand,
			totalServingDemand,
			allocatedAvailableServing,
		);
		const productServedShare = sharePercent(
			servingDemand,
			allocatedProductServing,
		);
		const satisfaction = satisfactionFor(
			operating,
			operating.quality,
			productServedShare,
		);
		const churnRate = churnRateFor(satisfaction);
		const baseRevenue = calculateBaseRevenue(
			operating.tuning.weeklyRevenue,
			operating.tuning.baseUsers,
			operating.quality,
			operating.users,
			operating.pressure.demandFactor,
			operating.price,
			operating.pricing.defaultPrice,
			`Product ${product.id} revenue`,
		);
		const revenue = Math.trunc(
			safeMultiply(
				baseRevenue,
				productServedShare,
				`Product ${product.id} served revenue`,
			) / 100,
		);
		const operatingCost = safeAdd(
			operating.pricing.weeklyOperatingCost,
			safeMultiply(
				allocatedProductServing,
				operating.pricing.servingCostPerDemand,
				`Product ${product.id} serving cost`,
			),
			`Product ${product.id} operating cost`,
		);
		const margin = safeSubtract(
			revenue,
			operatingCost,
			`Product ${product.id} margin`,
		);
		const cumulativeRevenue = safeAdd(
			product.cumulativeRevenue ?? 0,
			revenue,
			`Product ${product.id} cumulative revenue`,
		);
		const cumulativeMargin = safeAdd(
			product.cumulativeMargin ?? 0,
			margin,
			`Product ${product.id} cumulative margin`,
		);
		const nextProduct: Product = {
			...product,
			price: operating.price,
			users: operating.users,
			servingDemand,
			effectiveQuality: operating.quality,
			lastRevenue: revenue,
			cumulativeRevenue,
			lastMargin: margin,
			cumulativeMargin,
			satisfaction,
			churnRate,
			retiredUsers: product.retiredUsers ?? 0,
		};
		nextProducts.push(nextProduct);

		if (
			operating.pressure.recorded &&
			operating.pressure.status !== "fresh" &&
			operating.pressure.knowledgeCutoff !== null &&
			operating.pressure.knowledgeFreshness !== null
		) {
			facts.push({
				kind: "model_staleness",
				modelId: operating.model.id,
				productId: product.id,
				status: operating.pressure.status,
				ageWeeks: operating.pressure.ageWeeks,
				knowledgeCutoff: operating.pressure.knowledgeCutoff,
				knowledgeFreshness: operating.pressure.knowledgeFreshness,
				demandFactor: operating.pressure.demandFactor,
				qualityFactor: operating.pressure.qualityFactor,
				week: context.week,
			});
		}

		const nominalUnmetDemand = Math.max(
			0,
			operating.nominalDemand - operating.allocatedNominalProductServing,
		);
		const marketUnmetDemand = Math.max(
			0,
			servingDemand - allocatedProductServing,
		);
		const unmetDemand = Math.max(nominalUnmetDemand, marketUnmetDemand);
		if (unmetDemand > 0) {
			facts.push({
				kind: "serving_throttled",
				productId: product.id,
				week: context.week,
				unmetDemand,
			});
		}
		facts.push({
			kind: "product_pressure",
			productId: product.id,
			channel: product.channel,
			price: operating.price,
			freshnessStatus: operating.pressure.status,
			quality: operating.quality,
			reliability: publicScore(
				operating.model,
				"reliability",
				operating.pressure.qualityFactor,
			),
			latency: publicScore(
				operating.model,
				"efficiency",
				operating.pressure.qualityFactor,
			),
			satisfaction,
			churnRate,
			fulfilledDemand: allocatedProductServing,
			servedShare: productServedShare,
			churnedUsers: operating.churnedUsers,
			newUsers: operating.newUsers,
			margin,
			week: context.week,
		});
		if (revenue > 0) {
			facts.push({
				kind: "revenue",
				productId: product.id,
				channel: product.channel,
				amount: revenue,
				effectiveQuality: operating.quality,
				servedShare: productServedShare,
				week: context.week,
			});
		}
		if (margin !== 0) {
			cash = safeAdd(cash, margin, "Company cash from product margin");
			facts.push({
				kind: "resource_changed",
				resource: "cash",
				amount: margin,
				week: context.week,
			});
		}
		if (satisfaction >= BALANCE.productPressure.hypeSatisfactionThreshold) {
			earnedHype = safeAdd(
				earnedHype,
				operating.tuning.hypePerWeek,
				"Product earned hype",
			);
		}
		if (operating.tuning.trustPerWeek > 0) {
			const trustGain = Math.min(100 - trust, operating.tuning.trustPerWeek);
			if (trustGain > 0) {
				trust += trustGain;
				facts.push({
					kind: "resource_changed",
					resource: "trust",
					amount: trustGain,
					week: context.week,
				});
			}
		}
	}

	const hypeDecay =
		activeProductCount * BALANCE.productPressure.hypeDecayPerWeek;
	const hypeDelta = safeSubtract(earnedHype, hypeDecay, "Product hype delta");
	const nextHype = Math.min(
		100,
		Math.max(0, safeAdd(hype, hypeDelta, "Company hype from products")),
	);
	if (nextHype !== hype) {
		facts.push({
			kind: "resource_changed",
			resource: "hype",
			amount: nextHype - hype,
			week: context.week,
		});
		hype = nextHype;
	}

	const computeConflict =
		activeProductCount > 0 &&
		(reservations.trainingDemand > 0 || evaluationDemand > 0) &&
		safeAdd(
			totalServingDemand,
			safeAdd(
				reservations.trainingDemand,
				evaluationDemand,
				"Product compute conflict non-serving demand",
			),
			"Product compute conflict total demand",
		) > state.compute.capacity;
	if (computeConflict) {
		const servingCapacityAfterOtherWork = Math.max(
			0,
			state.compute.capacity - reservations.trainingDemand - evaluationDemand,
		);
		facts.push({
			kind: "compute_conflict",
			week: context.week,
			capacity: state.compute.capacity,
			servingDemand: totalServingDemand,
			trainingDemand: reservations.trainingDemand,
			evaluationDemand,
			viral: totalServingDemand >= BALANCE.productPressure.viralDemandThreshold,
			choice:
				totalServingDemand > servingCapacityAfterOtherWork
					? "serving_throttled"
					: "training_starved",
		});
	}

	let nextState: GameState = {
		...state,
		company: {
			...state.company,
			cash,
			hype,
			trust,
		},
		compute: {
			...state.compute,
			servingDemand: totalServingDemand,
		},
		products: { items: nextProducts },
		warnings: updateProductWarnings(
			state.warnings,
			projectionsWithPressure.some(
				(projection) =>
					projection.pressure.recorded &&
					projection.pressure.status === "stale",
			),
			computeConflict,
		),
	};
	nextState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};

	const pending = state.decisions.pending.map((decision) => ({ ...decision }));
	for (const model of state.models.items) {
		if (model.status !== "ready" && model.status !== "launched") continue;

		const modelDecisions = () =>
			pending.filter(
				(decision) =>
					(decision.kind === "launch" || decision.kind === "evaluation") &&
					decision.modelId === model.id,
			);
		const evaluationInProgress = hasActiveEvaluation(state, model.id);
		let offeredChoice = modelDecisions().length > 0 || evaluationInProgress;

		if (model.status === "ready") {
			const evaluationKind = (
				["capability", "safety_reliability"] as const
			).find(
				(kind) =>
					!hasEvaluation(model.id, kind, state) &&
					!pending.some(
						(decision) =>
							decision.kind === "evaluation" &&
							decision.modelId === model.id &&
							decision.evaluation === kind,
					),
			);
			if (
				evaluationKind !== undefined &&
				canAffordEvaluation(nextState, evaluationKind)
			) {
				const allocation = allocateId(nextState, "decision");
				nextState = allocation.state;
				pending.push({
					kind: "evaluation",
					id: allocation.id,
					modelId: model.id,
					evaluation: evaluationKind,
					blocking: true,
				});
				offeredChoice = true;
			}
		}

		if (!evaluationInProgress) {
			for (const channel of ["chat", "developer_api", "enterprise"] as const) {
				if (
					state.products.items.some(
						(product) =>
							product.modelId === model.id && product.channel === channel,
					) ||
					pending.some(
						(decision) =>
							decision.kind === "launch" &&
							decision.modelId === model.id &&
							decision.channel === channel,
					) ||
					!isProductLaunchEligible(nextState, model.id, channel)
				) {
					continue;
				}
				const allocation = allocateId(nextState, "decision");
				nextState = allocation.state;
				pending.push({
					kind: "launch",
					id: allocation.id,
					modelId: model.id,
					channel,
					price: BALANCE.productPressure.channels[channel].defaultPrice,
					blocking: true,
				});
				offeredChoice = true;
			}
		}

		if (model.status === "ready" && !offeredChoice) {
			// V1 has no dedicated no-affordable-choice fact kind yet. Keep the
			// ready model visible in the fact/report stream until that schema can
			// carry the reason explicitly.
			facts.push({
				kind: "model_trained",
				modelId: model.id,
				week: context.week,
			});
		}
	}

	const recomputedState = {
		...nextState,
		compute: withRecomputedCompute(nextState),
	};
	assertGameState(recomputedState, {
		allowNegativeCash: recomputedState.company.cash < 0,
	});
	return { state: recomputedState, facts, pending };
};

function marketDemandFactorFor(
	hype: number,
	price: number,
	pricing: ProductPressureChannelBalance,
): number {
	const priceDelta = price - pricing.defaultPrice;
	const pricePressure = Math.trunc(
		safeMultiply(
			priceDelta,
			pricing.priceDemandSensitivity,
			"Product price pressure",
		) / pricing.defaultPrice,
	);
	const priceDemandFactor = clamp(
		100 - pricePressure,
		BALANCE.productPressure.minimumDemandFactor,
		BALANCE.productPressure.maximumDemandFactor,
	);
	const hypeDemandFactor = clamp(
		100 +
			Math.max(0, hype - BALANCE.productPressure.hypeBaseline) *
				BALANCE.productPressure.hypeDemandPerPoint,
		BALANCE.productPressure.minimumDemandFactor,
		BALANCE.productPressure.maximumDemandFactor,
	);
	return clamp(
		Math.trunc((priceDemandFactor * hypeDemandFactor) / 100),
		BALANCE.productPressure.minimumDemandFactor,
		BALANCE.productPressure.maximumDemandFactor,
	);
}

function demandForUsers(
	users: number,
	computePerUser: number,
	demandFactor: number,
	path: string,
): number {
	return Math.trunc(
		safeMultiply(
			safeMultiply(users, computePerUser, `${path} users`),
			demandFactor,
			`${path} factor`,
		) / 100,
	);
}

function satisfactionFor(
	projection: {
		model: GameState["models"]["items"][number];
		pressure: ReturnType<typeof deriveKnowledgePressure>;
		price: number;
		pricing: ProductPressureChannelBalance;
	},
	quality: number,
	fulfilledShare: number,
): number {
	const weights = BALANCE.productPressure.satisfactionWeights;
	const reliability = publicScore(
		projection.model,
		"reliability",
		projection.pressure.qualityFactor,
	);
	const latency = publicScore(
		projection.model,
		"efficiency",
		projection.pressure.qualityFactor,
	);
	const freshness = projection.pressure.recorded
		? Math.min(
				projection.pressure.knowledgeFreshness ?? 0,
				projection.pressure.qualityFactor,
			)
		: 100;
	const priceValue = Math.min(
		100,
		marketDemandFactorFor(
			BALANCE.productPressure.hypeBaseline,
			projection.price,
			projection.pricing,
		),
	);
	const weighted =
		quality * weights.quality +
		reliability * weights.reliability +
		latency * weights.latency +
		freshness * weights.freshness +
		fulfilledShare * weights.fulfillment +
		priceValue * weights.price;
	return clamp(Math.trunc(weighted / 100), 0, 100);
}

function publicScore(
	model: GameState["models"]["items"][number],
	dimension: "reliability" | "efficiency",
	qualityFactor: number,
): number {
	const estimate = model.estimates?.[dimension]?.estimate ?? 100;
	return Math.trunc((estimate * qualityFactor) / 100);
}

function churnRateFor(satisfaction: number): number {
	if (satisfaction >= BALANCE.productPressure.churnSatisfactionThreshold) {
		return 0;
	}
	return Math.min(
		BALANCE.productPressure.maximumChurnRate,
		(BALANCE.productPressure.churnSatisfactionThreshold - satisfaction) *
			BALANCE.productPressure.churnPerSatisfactionPoint,
	);
}

function calculateBaseRevenue(
	weeklyRevenue: number,
	baseUsers: number,
	quality: number,
	users: number,
	knowledgeDemandFactor: number,
	price: number,
	defaultPrice: number,
	path: string,
): number {
	const numerator = safeMultiply(
		safeMultiply(
			safeMultiply(
				safeMultiply(weeklyRevenue, quality, `${path} weekly quality`),
				users,
				`${path} users`,
			),
			knowledgeDemandFactor,
			`${path} freshness demand`,
		),
		price,
		`${path} price`,
	);
	const denominator = safeMultiply(
		100 * defaultPrice,
		100 * baseUsers,
		`${path} denominator`,
	);
	return Math.trunc(numerator / denominator);
}

function safePercentProduct(left: number, right: number, path: string): number {
	return Math.trunc(safeMultiply(left, right, path) / 100);
}

function sharePercent(demand: number, allocated: number): number {
	if (demand === 0) return 100;
	return clamp(
		Math.trunc(safeMultiply(allocated, 100, "Product served share") / demand),
		0,
		100,
	);
}

function servingAllocation(
	demand: number,
	totalDemand: number,
	allocated: number,
): number {
	if (demand === 0 || totalDemand === 0 || allocated === 0) return 0;
	return Math.trunc(
		safeMultiply(demand, allocated, "Product serving allocation") / totalDemand,
	);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function safeAdd(left: number, right: number, path: string): number {
	const result = left + right;
	if (!Number.isSafeInteger(result)) {
		throw new Error(`${path} exceeded the safe integer limit`);
	}
	return result;
}

function safeSubtract(left: number, right: number, path: string): number {
	const result = left - right;
	if (!Number.isSafeInteger(result)) {
		throw new Error(`${path} exceeded the safe integer limit`);
	}
	return result;
}

function safeMultiply(left: number, right: number, path: string): number {
	const result = left * right;
	if (!Number.isSafeInteger(result)) {
		throw new Error(`${path} exceeded the safe integer limit`);
	}
	return result;
}

function updateProductWarnings(
	warnings: GameState["warnings"],
	stale: boolean,
	computeConflict: boolean,
): GameState["warnings"] {
	const nextWarnings = warnings.filter(
		(warning) =>
			warning.code !== "stale_model" && warning.code !== "compute_conflict",
	);
	if (stale) {
		nextWarnings.push({ code: "stale_model", severity: "warning" });
	}
	if (computeConflict) {
		nextWarnings.push({ code: "compute_conflict", severity: "warning" });
	}
	return nextWarnings;
}

function cloneProduct(product: Product): Product {
	return { ...product };
}

function canAffordEvaluation(
	state: GameState,
	evaluation: "capability" | "safety_reliability",
): boolean {
	const tuning = BALANCE.evaluations[evaluation];
	const reservations = computeReservations(state);
	return (
		state.teams.items.some((team) => team.activeProjectId === null) &&
		state.company.insight >= tuning.insightCost &&
		state.compute.capacity -
			reservations.trainingDemand -
			reservations.servingDemand -
			reservations.evaluationDemand >=
			tuning.computeCost
	);
}

function hasActiveEvaluation(state: GameState, modelId: string): boolean {
	return state.projects.items.some(
		(project) =>
			project.kind === "evaluation" &&
			project.modelId === modelId &&
			project.status === "active",
	);
}

function hasEvaluation(
	modelId: string,
	evaluation: "capability" | "safety_reliability",
	state: GameState,
): boolean {
	return state.projects.items.some(
		(project) =>
			project.kind === "evaluation" &&
			project.modelId === modelId &&
			project.evaluation === evaluation &&
			project.status !== "cancelled",
	);
}
