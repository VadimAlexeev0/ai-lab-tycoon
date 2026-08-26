import type { Product } from "../components/products.js";
import type { Fact } from "../components/reports.js";
import {
	computeReservations,
	withRecomputedCompute,
} from "../compute-reservations.js";
import { BALANCE } from "../data/balance.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
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
	let totalServingDemand = 0;
	const nextProducts: Product[] = [];

	for (const product of state.products.items) {
		const nextProduct = cloneProduct(product);
		if (product.status !== "operating") {
			nextProduct.servingDemand = 0;
			nextProduct.lastRevenue = 0;
			nextProducts.push(nextProduct);
			continue;
		}
		const model = state.models.items.find(
			(candidate) => candidate.id === product.modelId,
		);
		if (model === undefined) {
			throw new Error(`Product ${product.id} references an unknown model`);
		}
		const tuning = BALANCE.productChannels[product.channel];
		const users = (product.users ?? tuning.baseUsers) + tuning.usersPerWeek;
		const quality = effectiveProductQuality(model, product.channel);
		const servingDemand = users * tuning.servingComputePerUser;
		const revenue = Math.trunc(
			(tuning.weeklyRevenue * quality * users) / (100 * tuning.baseUsers),
		);
		totalServingDemand += servingDemand;
		nextProduct.users = users;
		nextProduct.servingDemand = servingDemand;
		nextProduct.effectiveQuality = quality;
		nextProduct.lastRevenue = revenue;
		nextProduct.cumulativeRevenue = (product.cumulativeRevenue ?? 0) + revenue;
		if (revenue > 0) {
			cash += revenue;
			facts.push(
				{
					kind: "revenue",
					productId: product.id,
					channel: product.channel,
					amount: revenue,
					effectiveQuality: quality,
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
		if (tuning.hypePerWeek > 0) {
			hype += tuning.hypePerWeek;
			facts.push({
				kind: "resource_changed",
				resource: "hype",
				amount: tuning.hypePerWeek,
				week: context.week,
			});
		}
		if (tuning.trustPerWeek > 0) {
			const trustGain = Math.min(100 - trust, tuning.trustPerWeek);
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
		nextProducts.push(nextProduct);
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

function cloneProduct(product: Product): Product {
	return { ...product };
}
