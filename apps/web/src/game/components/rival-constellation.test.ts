import { describe, expect, it } from "vitest";

import { getRivalArchetypePosition } from "./rival-constellation";

describe("rival constellation placement", () => {
	it("maps each rival archetype to a stable horizontal anchor", () => {
		expect(getRivalArchetypePosition("hacker")).toBe(-1);
		expect(getRivalArchetypePosition("mogul")).toBe(0);
		expect(getRivalArchetypePosition("operator")).toBe(1);
	});
});
