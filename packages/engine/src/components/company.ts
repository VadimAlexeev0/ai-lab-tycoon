export type CompanyResources = {
	cash: number;
	insight: number;
	trust: number;
	hype: number;
};

export type CompanyState = CompanyResources & {
	name: string;
};

export function createCompanyState(
	name: string,
	resources: CompanyResources = {
		cash: 0,
		insight: 0,
		trust: 60,
		hype: 0,
	},
): CompanyState {
	return {
		name,
		cash: resources.cash,
		insight: resources.insight,
		trust: resources.trust,
		hype: resources.hype,
	};
}

export function assertCompanyState(state: CompanyState): void {
	if (state.name.trim().length === 0) {
		throw new Error("Company name must not be empty");
	}

	assertNonNegativeInteger(state.cash, "cash");
	assertNonNegativeInteger(state.insight, "insight");
	assertNonNegativeInteger(state.trust, "trust");
	assertNonNegativeInteger(state.hype, "hype");

	if (state.trust > 100) {
		throw new Error("Company trust must be at most 100");
	}
}

function assertNonNegativeInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`Company ${name} must be a non-negative integer`);
	}
}
