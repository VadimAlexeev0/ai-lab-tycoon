/**
 * V1 opening and weekly economy values.
 *
 * All values are integer simulation units. Salaries and upkeep are weekly
 * costs; project progress and research insight are also weekly rates.
 */
import type { ProjectKind } from "../components/projects.js";
import {
	assertExactObject,
	assertNonNegativeInteger,
	assertPositiveInteger,
} from "../validation.js";

export type BalanceConstants = Readonly<{
	startingCash: number;
	startingComputeCapacity: number;
	startingInsight: number;
	startingTrust: number;
	startingHype: number;
	startingProjectProgress: number;
	salaries: Readonly<{
		foundingTeam: number;
	}>;
	upkeep: number;
	projectProgressPerWeek: Readonly<Record<ProjectKind, number>>;
	researchInsightPerWeek: number;
	researchProjectDuration: number;
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
/** Progress before a project has received its first weekly work tick. */
export const STARTING_PROJECT_PROGRESS = 0;
/** Weekly salary for each team in the initial V1 staffing tier. */
export const FOUNDING_TEAM_SALARY = 50;
/** Weekly base operating cost before team salaries and other systems. */
export const BASE_UPKEEP = 25;
/** Progress units produced by one team in one week for each project kind. */
export const PROJECT_PROGRESS_PER_WEEK = {
	research: 1,
	infrastructure: 1,
	model: 1,
	training: 1,
	evaluation: 1,
	product: 1,
} as const satisfies Readonly<Record<ProjectKind, number>>;
/** Insight units produced by each idle or researching team per week. */
export const RESEARCH_INSIGHT_PER_WEEK = 1;
/** Duration of each initial research project in weeks. */
export const RESEARCH_PROJECT_DURATION = 1;

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
	startingProjectProgress: STARTING_PROJECT_PROGRESS,
	salaries: {
		foundingTeam: FOUNDING_TEAM_SALARY,
	},
	upkeep: BASE_UPKEEP,
	projectProgressPerWeek: PROJECT_PROGRESS_PER_WEEK,
	researchInsightPerWeek: RESEARCH_INSIGHT_PER_WEEK,
	researchProjectDuration: RESEARCH_PROJECT_DURATION,
} as const satisfies BalanceConstants;

assertBalanceConstants(BALANCE);

/** Fail fast if a tuning table contains non-integer or non-positive values. */
export function assertBalanceConstants(value: BalanceConstants): void {
	assertExactObject(
		value,
		[
			"startingCash",
			"startingComputeCapacity",
			"startingInsight",
			"startingTrust",
			"startingHype",
			"startingProjectProgress",
			"salaries",
			"upkeep",
			"projectProgressPerWeek",
			"researchInsightPerWeek",
			"researchProjectDuration",
		],
		"balance",
	);
	assertNonNegativeInteger(value.startingCash, "Starting cash");
	assertNonNegativeInteger(
		value.startingComputeCapacity,
		"Starting compute capacity",
	);
	assertNonNegativeInteger(value.startingInsight, "Starting insight");
	assertNonNegativeInteger(value.startingTrust, "Starting trust");
	assertNonNegativeInteger(value.startingHype, "Starting hype");
	assertNonNegativeInteger(
		value.startingProjectProgress,
		"Starting project progress",
	);
	assertExactObject(value.salaries, ["foundingTeam"], "Balance salaries");
	assertPositiveInteger(value.salaries.foundingTeam, "Founding team salary");
	assertPositiveInteger(value.upkeep, "Base upkeep");
	assertExactObject(
		value.projectProgressPerWeek,
		[
			"research",
			"infrastructure",
			"model",
			"training",
			"evaluation",
			"product",
		],
		"Project progress balance",
	);
	for (const [kind, progress] of Object.entries(value.projectProgressPerWeek)) {
		assertPositiveInteger(progress, `Progress for ${kind}`);
	}
	assertPositiveInteger(
		value.researchInsightPerWeek,
		"Research insight per week",
	);
	assertPositiveInteger(
		value.researchProjectDuration,
		"Research project duration",
	);
}

export type V1Balance = typeof BALANCE;
