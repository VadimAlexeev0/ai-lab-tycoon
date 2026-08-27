import { describe, expect, it } from "vitest";

import {
	RIVAL_DOCTRINE_BY_RIVAL_ID,
	RIVAL_DOCTRINES,
	rivalDoctrineForId,
} from "@/game/rival-doctrine";

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

	it("maps the three existing rivals round-robin to read-only doctrines", () => {
		expect(RIVAL_DOCTRINE_BY_RIVAL_ID).toEqual({
			rival_001: "capability",
			rival_002: "efficiency",
			rival_003: "capability",
		});
		expect(rivalDoctrineForId("rival_001")).toEqual(RIVAL_DOCTRINES.capability);
		expect(rivalDoctrineForId("rival_002")).toEqual(RIVAL_DOCTRINES.efficiency);
		expect(RIVAL_DOCTRINES.capability).toMatchObject({
			label: "Cathedral of Compute",
			note: expect.stringContaining("Heavy Insight"),
		});
		expect(RIVAL_DOCTRINES.efficiency).toMatchObject({
			label: "Foundry of Efficiency",
			note: expect.stringContaining("Cheaper compute"),
		});
	});
});
