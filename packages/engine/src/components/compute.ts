import { assertExactObject, assertNonNegativeInteger } from "../validation.js";

export type ComputeState = {
	capacity: number;
	allocated: number;
	trainingDemand: number;
	servingDemand: number;
};

export function createComputeState(capacity = 0): ComputeState {
	return {
		capacity,
		allocated: 0,
		trainingDemand: 0,
		servingDemand: 0,
	};
}

export function assertComputeState(
	value: unknown,
): asserts value is ComputeState {
	assertExactObject(
		value,
		["capacity", "allocated", "trainingDemand", "servingDemand"],
		"compute",
	);
	assertNonNegativeInteger(value.capacity, "Compute capacity");
	assertNonNegativeInteger(value.allocated, "Compute allocated");
	assertNonNegativeInteger(value.trainingDemand, "Compute training demand");
	assertNonNegativeInteger(value.servingDemand, "Compute serving demand");

	if (value.allocated > value.capacity) {
		throw new Error("Allocated compute cannot exceed capacity");
	}
}
