import { describe, expect, it } from "vitest";

import { GAUGE_CIRCUMFERENCE, getGaugeStrokeOffset } from "./rivals-panel";

describe("rival radial gauge projection", () => {
	it("maps bounded progress to a full-circle stroke offset", () => {
		expect(getGaugeStrokeOffset(0)).toBe(GAUGE_CIRCUMFERENCE);
		expect(getGaugeStrokeOffset(100)).toBe(0);
		expect(getGaugeStrokeOffset(50)).toBe(GAUGE_CIRCUMFERENCE / 2);
	});

	it("clamps malformed display values to the visible gauge range", () => {
		expect(getGaugeStrokeOffset(-10)).toBe(GAUGE_CIRCUMFERENCE);
		expect(getGaugeStrokeOffset(110)).toBe(0);
	});
});
