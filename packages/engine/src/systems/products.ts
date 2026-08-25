import type { Product } from "../components/products.js";
import type { Fact } from "../components/reports.js";
import { BALANCE } from "../data/balance.js";
import { allocateId } from "../ids.js";
import { assertGameState } from "../invariants.js";
import { effectiveProductQuality } from "../products.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/**
 * Operate launched channels after training. Revenue deliberately uses public
 * estimate centers, never a model's hidden true scores.
 */
export const productsSystem: GameSystem = (state, context) => {
	assertGameState(state);
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
		// A bankrupt company cannot be rescued by revenue from the same turn.
		const revenue =
			cash < 0 ? 0 : Math.trunc((tuning.weeklyRevenue * quality) / 100);
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
			allocated: Math.min(
				state.compute.capacity,
				Math.max(
					state.compute.allocated,
					state.compute.trainingDemand + totalServingDemand,
				),
			),
		},
		products: { items: nextProducts },
	};

	const pending = state.decisions.pending.map((decision) => ({ ...decision }));
	for (const model of state.models.items) {
		if (
			model.status !== "ready" ||
			state.products.items.some((product) => product.modelId === model.id) ||
			pending.some(
				(decision) =>
					(decision.kind === "launch" || decision.kind === "evaluation") &&
					decision.modelId === model.id,
			)
		) {
			continue;
		}
		const allocation = allocateId(nextState, "decision");
		nextState = {
			...allocation.state,
			decisions: allocation.state.decisions,
		};
		pending.push({
			kind: "launch",
			id: allocation.id,
			modelId: model.id,
			blocking: true,
		});
	}

	assertGameState(nextState);
	return { state: nextState, facts, pending };
};

function cloneProduct(product: Product): Product {
	return { ...product };
}
