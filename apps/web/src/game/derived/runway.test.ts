import { type Fact, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { BALANCE } from "../../../../../packages/engine/src/data/balance.js";

import {
	averageRecentRevenue,
	deriveRunway,
	deriveRunwayWarnings,
	weeklyBurn,
} from "./runway";

function report(id: string, fact: Fact) {
	return {
		id,
		priority: "informational" as const,
		fact,
		acknowledged: false,
	};
}

function revenueFact(productId: string, amount: number, week: number): Fact {
	return {
		kind: "revenue",
		productId,
		channel: "chat",
		amount,
		effectiveQuality: 80,
		week,
	};
}

describe("runway derivation", () => {
	it("subtracts the average of the last three revenue facts from weekly burn", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = 100;
		state.reports.items = [
			report("report_001", revenueFact("product_old", 10, 1)),
			report("report_002", revenueFact("product_old", 20, 2)),
			report("report_003", revenueFact("product_old", 30, 3)),
			report("report_004", revenueFact("product_old", 90, 4)),
		];

		expect(weeklyBurn(state)).toBe(75);
		expect(averageRecentRevenue(state)).toBe(140 / 3);
		const runway = deriveRunway(state);
		expect(runway.weeklyBurn).toBe(75);
		expect(runway.weeklyRevenue).toBe(140 / 3);
		expect(runway.netWeeklyBurn).toBe(75 - 140 / 3);
		expect(runway.weeksOfRunway).toBe(100 / (75 - 140 / 3));
		expect(
			runway.warnings.find((warning) => warning.code === "runway_low"),
		).toBeTruthy();
	});

	it("returns no runway countdown when revenue is profitable", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = 100;
		state.reports.items = [
			report("report_001", revenueFact("product_old", 100, 1)),
			report("report_002", revenueFact("product_old", 100, 2)),
			report("report_003", revenueFact("product_old", 100, 3)),
		];

		const runway = deriveRunway(state);
		expect(runway.netWeeklyBurn).toBe(-25);
		expect(runway.weeksOfRunway).toBeNull();
		expect(
			runway.warnings.some(
				(warning) =>
					warning.code === "runway_low" || warning.code === "runway_critical",
			),
		).toBe(false);
	});

	it("uses zero income when there are no retained revenue facts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.company.cash = 750;

		const runway = deriveRunway(state);
		expect(averageRecentRevenue(state)).toBe(0);
		expect(runway.netWeeklyBurn).toBe(75);
		expect(runway.weeksOfRunway).toBe(10);
	});

	it("escalates critical runway and emits operational warnings", () => {
		const state = fundableState();
		state.company.cash = 100;
		state.compute.capacity = 12;
		state.compute.servingDemand = 12;

		const warnings = deriveRunwayWarnings(state);
		expect(warnings.map((warning) => warning.code)).toEqual([
			"runway_critical",
			"compute_saturated",
			"idle_teams",
			"funding_ready",
		]);
		expect(warnings[0]?.severity).toBe("critical");
		expect(warnings[2]?.message).toContain("Founding Team");
		expect(warnings[2]?.message).toContain("Research");
		expect(warnings[2]?.message).not.toContain("team_001");
		expect(warnings[2]?.message).not.toContain("project_001");
	});

	it("reports funding readiness when a round's live factors meet its gate", () => {
		const state = fundableState();

		const fundingWarning = deriveRunwayWarnings(state).find(
			(warning) => warning.code === "funding_ready",
		);
		expect(fundingWarning).toEqual(
			expect.objectContaining({
				code: "funding_ready",
				severity: "info",
			}),
		);
		expect(fundingWarning?.message).toContain("Seed");
	});
});

function fundableState() {
	const state = startRun({ companyName: "Acme Labs" }, 42);
	state.company.hype = BALANCE.funding.seed.minimumHype;
	state.company.trust = BALANCE.funding.seed.minimumTrust;
	state.models.items = [
		{
			id: "model_001",
			name: "Aurora-1",
			foundation: "fresh",
			status: "ready",
			projectId: null,
			estimates: {
				capability: estimateBand(BALANCE.funding.seed.minimumModelScore),
				coding: estimateBand(60),
				reliability: estimateBand(60),
				safety: estimateBand(60),
				efficiency: estimateBand(60),
				multimodal: estimateBand(0),
			},
		},
	];
	return state;
}

function estimateBand(estimate: number) {
	return { estimate, lower: estimate, upper: estimate };
}
