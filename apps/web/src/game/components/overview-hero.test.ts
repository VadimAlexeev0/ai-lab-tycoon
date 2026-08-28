import { describe, expect, it } from "vitest";

import { getQuarterForWeek, getWeekInQuarter } from "./overview-hero";

describe("dashboard week position", () => {
	it("keeps the thirteen-week quarter boundaries stable", () => {
		expect(getQuarterForWeek(1)).toBe(1);
		expect(getWeekInQuarter(1)).toBe(1);
		expect(getWeekInQuarter(13)).toBe(13);
		expect(getQuarterForWeek(14)).toBe(2);
		expect(getWeekInQuarter(14)).toBe(1);
		expect(getQuarterForWeek(78)).toBe(6);
		expect(getWeekInQuarter(78)).toBe(13);
	});
});
