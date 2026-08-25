export type FundingRound = "seed" | "series_a";
export type FundingStatus = "locked" | "available" | "accepted" | "declined";

export type FundingRoundState = {
	round: FundingRound;
	status: FundingStatus;
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

export function assertFundingState(state: FundingState): void {
	if (state.seed.round !== "seed") {
		throw new Error("Seed funding state must identify the seed round");
	}
	if (state.seriesA.round !== "series_a") {
		throw new Error("Series A funding state must identify the Series A round");
	}
}
