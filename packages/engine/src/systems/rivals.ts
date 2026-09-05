import type { Fact } from "../components/reports.js";
import type { Rival } from "../components/rivals.js";
import { BALANCE } from "../data/balance.js";
import { getRivalStrategyActions, RIVAL_MILESTONES } from "../data/rivals.js";
import { assertGameState } from "../invariants.js";
import type { GameState } from "../state.js";
import type { GameSystem } from "./types.js";

/** Advance visible rival clocks and emit each threshold actually crossed. */
export const rivalsSystem: GameSystem = createRivalsSystem();

/** @internal Replay-only v10 semantics; not part of the package root API. */
export const rivalsSystemForLegacyV10Replay: GameSystem =
	createRivalsSystem(true);

function createRivalsSystem(legacyV10Replay = false): GameSystem {
	return (state, context) => {
		assertGameState(state, { allowNegativeCash: state.company.cash < 0 });
		const facts: Fact[] = [];
		const nextRivals = state.rivals.items.map((rival) => {
			const active = state.meta.era === "text" ? rival.active : true;
			if (!active) return cloneRival(rival, false);
			const clock = BALANCE.rivalClocks[rival.archetype].progressPerWeek;
			const nextProgress = Math.min(100, rival.progress + clock);
			const progressedBy = nextProgress - rival.progress;
			if (progressedBy > 0) {
				facts.push({
					kind: "rival_progressed",
					rivalId: rival.id,
					amount: progressedBy,
					week: context.week,
				});
			}
			for (const milestone of RIVAL_MILESTONES) {
				if (
					rival.progress < milestone.threshold &&
					nextProgress >= milestone.threshold
				) {
					facts.push({
						kind: "rival_milestone",
						rivalId: rival.id,
						milestone: milestone.id,
						week: context.week,
					});
				}
			}

			if (legacyV10Replay) {
				return {
					...rival,
					active: true,
					progress: nextProgress,
				};
			}

			const actions = getRivalStrategyActions(rival.archetype);
			let eventCursor = rival.eventCursor;
			const publishedNodeIds = [...rival.publishedNodeIds];
			const launchedFamilyIds = [...rival.launchedFamilyIds];
			while (true) {
				const action = actions[eventCursor];
				if (action === undefined || action.threshold > nextProgress) break;
				const pressure =
					action.kind === "publication"
						? BALANCE.rivalStrategy.publicationPressure
						: BALANCE.rivalStrategy.launchPressure;
				if (action.kind === "publication") {
					publishedNodeIds.push(action.nodeId);
					facts.push({
						kind: "rival_published",
						rivalId: rival.id,
						actionId: action.id,
						nodeId: action.nodeId,
						threshold: action.threshold,
						progress: nextProgress,
						pressure,
						week: context.week,
					});
				} else {
					launchedFamilyIds.push(action.familyId);
					facts.push({
						kind: "rival_launched",
						rivalId: rival.id,
						actionId: action.id,
						familyId: action.familyId,
						threshold: action.threshold,
						progress: nextProgress,
						pressure,
						week: context.week,
					});
				}
				eventCursor += 1;
			}

			return {
				...rival,
				active: true,
				progress: nextProgress,
				publishedNodeIds,
				launchedFamilyIds,
				eventCursor,
			};
		});

		const nextState: GameState = {
			...state,
			rivals: { items: nextRivals },
		};
		assertGameState(nextState, {
			allowNegativeCash: nextState.company.cash < 0,
		});
		return { state: nextState, facts, pending: [] };
	};
}

function cloneRival(rival: Rival, active: boolean): Rival {
	return {
		...rival,
		active,
		publishedNodeIds: [...rival.publishedNodeIds],
		launchedFamilyIds: [...rival.launchedFamilyIds],
	};
}
