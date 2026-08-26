import { assertEnum, assertExactObject } from "../validation.js";

export type FundingRound = "seed" | "series_a";
export type FundingStatus = "locked" | "available" | "accepted" | "declined";

const FUNDING_STATUSES = [
	"locked",
	"available",
	"accepted",
	"declined",
] as const;

export type FundingRoundState = {
	round: FundingRound;
	status: FundingStatus;
};

export type FundingGateFactors = {
	hype: number;
	trust: number;
	modelScore: number;
	operatingProducts: number;
	cumulativeRevenue: number;
};

export type FundingState = {
	seed: FundingRoundState;
	seriesA: FundingRoundState;
};

export function createFundingState(): FundingState {
	return {
		seed: {
			round: "seed",
			status: "available",
		},
		seriesA: {
			round: "series_a",
			status: "locked",
		},
	};
}

export function assertFundingState(
	value: unknown,
): asserts value is FundingState {
	assertExactObject(value, ["seed", "seriesA"], "funding");
	assertFundingRound(value.seed, "seed", "Seed funding state");
	assertFundingRound(value.seriesA, "series_a", "Series A funding state");
}

function assertFundingRound(
	value: unknown,
	round: "seed" | "series_a",
	path: string,
): void {
	assertExactObject(value, ["round", "status"], path);
	assertEnum(value.round, [round], `${path} round`);
	assertEnum(value.status, FUNDING_STATUSES, `${path} status`);
}
