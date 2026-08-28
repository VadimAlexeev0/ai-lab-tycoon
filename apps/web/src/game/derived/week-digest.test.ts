import { type Fact, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import {
	deriveWeekDigest,
	diffResourceBar,
	summarizeWeekDigest,
} from "./week-digest";

function report(id: string, fact: Fact) {
	return {
		id,
		priority: "informational" as const,
		fact,
		acknowledged: false,
	};
}

describe("deriveWeekDigest", () => {
	it("groups retained reports for the new week by event category", () => {
		const previous = startRun({ companyName: "Acme Labs" }, 42);
		previous.meta.week = 3;
		const current = startRun({ companyName: "Acme Labs" }, 42);
		current.meta.week = 4;
		current.reports.items = [
			report("old", {
				kind: "product_launched",
				productId: "product_old",
				channel: "chat",
				week: 3,
			}),
			report("launch", {
				kind: "product_launched",
				productId: "product_001",
				channel: "enterprise",
				week: 4,
			}),
			report("training", {
				kind: "model_trained",
				modelId: "model_001",
				week: 4,
			}),
			report("evaluation", {
				kind: "evaluation_completed",
				modelId: "model_001",
				evaluation: "capability",
				coverage: 80,
				week: 4,
			}),
			report("incident", {
				kind: "incident_occurred",
				incident: "outage",
				condition: "api_overload",
				affectedEntity: "api",
				metric: "latency",
				measurement: 120,
				threshold: 100,
				severity: 2,
				week: 4,
			}),
			report("funding", {
				kind: "funding_resolved",
				round: "seed",
				outcome: "accepted",
				week: 4,
			}),
			report("project", {
				kind: "project_completed",
				projectId: "project_001",
				week: 4,
			}),
		];

		const digest = deriveWeekDigest(previous, current);

		expect(digest.week).toBe(4);
		expect(digest.launches).toHaveLength(1);
		expect(digest.trainingCompletions).toHaveLength(1);
		expect(digest.evaluations).toHaveLength(1);
		expect(digest.incidents).toHaveLength(1);
		expect(digest.fundingEvents).toHaveLength(1);
		expect(digest.projectCompletions).toHaveLength(1);
		expect(digest.launches[0]?.productId).toBe("product_001");
	});

	it("computes resource deltas from the selector projections", () => {
		const previous = startRun({ companyName: "Acme Labs" }, 42);
		const current = startRun({ companyName: "Acme Labs" }, 42);
		previous.company.cash = 1_000;
		previous.company.insight = 40;
		previous.company.trust = 60;
		previous.company.hype = 20;
		previous.compute.capacity = 100;
		previous.compute.allocated = 25;
		previous.compute.trainingDemand = 10;
		previous.compute.servingDemand = 15;
		current.company.cash = 800;
		current.company.insight = 55;
		current.company.trust = 50;
		current.company.hype = 20;
		current.compute.capacity = 120;
		current.compute.allocated = 40;
		current.compute.trainingDemand = 12;
		current.compute.servingDemand = 18;

		expect(diffResourceBar(previous, current)).toEqual({
			cash: -200,
			compute: {
				capacity: 20,
				allocated: 15,
				trainingDemand: 2,
				servingDemand: 3,
			},
			insight: 15,
			trust: -10,
			hype: 0,
		});
	});

	describe("summarizeWeekDigest", () => {
		it("names the most useful events and cash movement", () => {
			const previous = startRun({ companyName: "Acme Labs" }, 42);
			const current = startRun({ companyName: "Acme Labs" }, 42);
			current.meta.week = 14;
			current.reports.items = [
				report("launch", {
					kind: "product_launched",
					productId: "Apex-1",
					channel: "enterprise",
					week: 14,
				}),
				report("incident", {
					kind: "incident_resolved",
					incidentId: "incident_001",
					incident: "outage",
					response: "repair",
					week: 14,
				}),
			];
			current.company.cash = previous.company.cash + 800;

			const digest = deriveWeekDigest(previous, current);

			expect(
				summarizeWeekDigest(digest, diffResourceBar(previous, current)),
			).toBe("Week 14: Apex-1 launched · Outage contained · +$800");
		});

		it("provides a calm empty-state summary", () => {
			const state = startRun({ companyName: "Acme Labs" }, 42);
			expect(summarizeWeekDigest(deriveWeekDigest(null, state))).toBe(
				"Week 1: No new activity recorded.",
			);
		});
	});
});
