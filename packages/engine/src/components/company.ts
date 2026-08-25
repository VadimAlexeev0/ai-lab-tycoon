import {
	assertExactObject,
	assertNonNegativeInteger,
	assertString,
} from "../validation.js";

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

export function assertCompanyState(
	value: unknown,
): asserts value is CompanyState {
	assertExactObject(
		value,
		["name", "cash", "insight", "trust", "hype"],
		"company",
	);
	assertString(value.name, "Company name");
	if (value.name.trim().length === 0) {
		throw new Error("Company name must not be empty");
	}
	assertNonNegativeInteger(value.cash, "Company cash");
	assertNonNegativeInteger(value.insight, "Company insight");
	assertNonNegativeInteger(value.trust, "Company trust");
	assertNonNegativeInteger(value.hype, "Company hype");

	if (value.trust > 100) {
		throw new Error("Company trust must be at most 100");
	}
}
