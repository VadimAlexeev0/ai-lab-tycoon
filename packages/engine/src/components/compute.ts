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

export function assertComputeState(state: ComputeState): void {
	assertNonNegativeInteger(state.capacity, "capacity");
	assertNonNegativeInteger(state.allocated, "allocated compute");
	assertNonNegativeInteger(state.trainingDemand, "training demand");
	assertNonNegativeInteger(state.servingDemand, "serving demand");

	if (state.allocated > state.capacity) {
		throw new Error("Allocated compute cannot exceed capacity");
	}
}

function assertNonNegativeInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`Compute ${name} must be a non-negative integer`);
	}
}
