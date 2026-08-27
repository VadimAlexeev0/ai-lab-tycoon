import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { getComputeGridSignals, getComputeSlotStates } from "./compute-grid";

describe("compute grid projections", () => {
	it("projects capacity and demand from the resource selector", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(getComputeGridSignals(state)).toMatchObject({
			allocated: 0,
			capacity: 12,
			evaluationDemand: 0,
			servingDemand: 0,
			shortage: false,
			totalDemand: 0,
			trainingDemand: 0,
		});
	});

	it("fills slots by allocation and marks contention when demand exceeds capacity", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.capacity = 4;
		state.compute.allocated = 3;
		state.compute.trainingDemand = 3;
		state.compute.servingDemand = 2;

		const signals = getComputeGridSignals(state);
		expect(signals.shortage).toBe(true);
		expect(getComputeSlotStates(signals)).toEqual([
			"allocated",
			"allocated",
			"allocated",
			"available",
		]);
	});
});
