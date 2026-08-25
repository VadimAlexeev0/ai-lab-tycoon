/**
 * V1 opening and weekly economy values.
 *
 * All values are integer simulation units. Salaries and upkeep are weekly
 * costs; the weekly systems that spend them arrive in Task 5.
 */
export type BalanceConstants = Readonly<{
	startingCash: number;
	startingComputeCapacity: number;
	startingInsight: number;
	startingTrust: number;
	startingHype: number;
	salaries: Readonly<{
		foundingTeam: number;
	}>;
	upkeep: number;
}>;

/** Cash available when a new V1 run opens. */
export const STARTING_CASH = 1_000;
/** Shared compute capacity available when a new V1 run opens. */
export const STARTING_COMPUTE_CAPACITY = 12;
/** Insight available before the first week of research. */
export const STARTING_INSIGHT = 0;
/** Trust available when a new V1 run opens. */
export const STARTING_TRUST = 60;
/** Hype available when a new V1 run opens. */
export const STARTING_HYPE = 10;
/** Weekly salary for the initial Founding Team. */
export const FOUNDING_TEAM_SALARY = 50;
/** Weekly base operating cost before team salaries and other systems. */
export const BASE_UPKEEP = 25;

/**
 * Canonical typed balance table for V1.
 *
 * Keep opening-state and future weekly-system values here rather than
 * repeating economy numbers in systems or surfaces.
 */
export const BALANCE = {
	startingCash: STARTING_CASH,
	startingComputeCapacity: STARTING_COMPUTE_CAPACITY,
	startingInsight: STARTING_INSIGHT,
	startingTrust: STARTING_TRUST,
	startingHype: STARTING_HYPE,
	salaries: {
		foundingTeam: FOUNDING_TEAM_SALARY,
	},
	upkeep: BASE_UPKEEP,
} as const satisfies BalanceConstants;

export type V1Balance = typeof BALANCE;
