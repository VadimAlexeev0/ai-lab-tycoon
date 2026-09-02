import type { Product } from "../components/products.js";
import type { Fact } from "../components/reports.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
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
 * Operate launched channels after training. Revenue deliberately uses public
 * estimate centers, never a model's hidden true scores.
 */
export const productsSystem: GameSystem = (state, context) => {
	assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
	const facts: Fact[] = [];
	let cash = state.company.cash;
	let hype = state.company.hype;
	let trust = state.company.trust;
	const evaluationDemand = computeReservations(state).evaluationDemand;
	const projections = state.products.items.flatMap((product) => {
		if (product.status !== "operating") return [];
		const model = state.models.items.find(
			(candidate) => candidate.id === product.modelId,
		);
		if (model === undefined) {
			throw new Error(`Product ${product.id} references an unknown model`);
		}
		const tuning = BALANCE.productChannels[product.channel];
		const pressure = deriveKnowledgePressure(model, context.week);
		const currentUsers = product.users ?? tuning.baseUsers;
		const growthUsers = currentUsers + tuning.usersPerWeek;
		return [
			{
				product,
				model,
				tuning,
				pressure,
				currentUsers,
				growthUsers,
				// Knowledge pressure affects live serving, not the nominal user
				// growth gate. Otherwise degraded demand can paradoxically let a
				// product grow into a larger reservation and starve training.
				growthDemand: growthUsers * tuning.servingComputePerUser,
			},
		];
	});
	const projectedServingDemand = projections.reduce(
		(total, projection) => total + projection.growthDemand,
		0,
	);
	const allocatedServing = Math.min(
		state.compute.capacity,
		projectedServingDemand,
	);
	const operatingProducts = projections.map((projection) => {
		const allocatedProductServing = servingAllocation(
			projection.growthDemand,
			projectedServingDemand,
			allocatedServing,
		);
		const growthThrottled =
			projection.growthUsers > projection.currentUsers &&
			projection.growthDemand > allocatedProductServing;
		const users = growthThrottled
			? projection.currentUsers
			: projection.growthUsers;
		return {
			...projection,
			allocatedProductServing,
			growthThrottled,
			users,
			servingDemand: Math.trunc(
				(users *
					projection.tuning.servingComputePerUser *
					projection.pressure.demandFactor) /
					100,
			),
			unmetDemand: Math.max(
				0,
				projection.growthDemand - allocatedProductServing,
			),
		};
	});
	const totalServingDemand = operatingProducts.reduce(
		(total, product) => total + product.servingDemand,
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
	const servedShare =
		totalServingDemand === 0
			? 100
			: Math.trunc((allocatedAvailableServing * 100) / totalServingDemand);
	const productsById = new Map(
		operatingProducts.map((product) => [product.product.id, product]),
	);
	const nextProducts: Product[] = [];

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

		const quality = effectiveProductQuality(
			operating.model,
			product.channel,
			context.week,
		);
		const baseRevenue = Math.trunc(
			(operating.tuning.weeklyRevenue *
				quality *
				operating.users *
				operating.pressure.demandFactor) /
				(100 * operating.tuning.baseUsers * 100),
		);
		const revenue =
			totalServingDemand === 0
				? 0
				: Math.trunc(
						(baseRevenue * allocatedAvailableServing) / totalServingDemand,
					);
		const nextProduct: Product = {
			...product,
			users: operating.users,
			servingDemand: operating.servingDemand,
			effectiveQuality: quality,
			lastRevenue: revenue,
			cumulativeRevenue: (product.cumulativeRevenue ?? 0) + revenue,
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

		if (operating.growthThrottled && operating.unmetDemand > 0) {
			facts.push({
				kind: "serving_throttled",
				productId: product.id,
				week: context.week,
				unmetDemand: operating.unmetDemand,
			});
		}
		if (revenue > 0) {
			cash += revenue;
			facts.push(
				{
					kind: "revenue",
					productId: product.id,
					channel: product.channel,
					amount: revenue,
					effectiveQuality: quality,
					servedShare,
					week: context.week,
				},
				{
					kind: "resource_changed",
					resource: "cash",
					amount: revenue,
					week: context.week,
				},
			);
		}
		if (operating.tuning.hypePerWeek > 0) {
			hype += operating.tuning.hypePerWeek;
			facts.push({
				kind: "resource_changed",
				resource: "hype",
				amount: operating.tuning.hypePerWeek,
				week: context.week,
			});
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
		warnings: updateModelStalenessWarning(
			state.warnings,
			operatingProducts.some(
				(product) =>
					product.pressure.recorded && product.pressure.status === "stale",
			),
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

function servingAllocation(
	demand: number,
	totalDemand: number,
	allocated: number,
): number {
	if (demand === 0 || totalDemand === 0 || allocated === 0) return 0;
	return Math.trunc((demand * allocated) / totalDemand);
}

function updateModelStalenessWarning(
	warnings: GameState["warnings"],
	stale: boolean,
): GameState["warnings"] {
	const nextWarnings = warnings.filter(
		(warning) => warning.code !== "stale_model",
	);
	if (stale) {
		nextWarnings.push({ code: "stale_model", severity: "warning" });
	}
	return nextWarnings;
}

function cloneProduct(product: Product): Product {
	return { ...product };
}
