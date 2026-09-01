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
			report("resume", {
				kind: "product_resumed",
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
			report("throttle", {
				kind: "serving_throttled",
				productId: "product_001",
				week: 4,
				unmetDemand: 3,
			}),
			report("starved", {
				kind: "training_starved",
				week: 4,
				capacity: 12,
				servingDemand: 15,
				evaluationDemand: 0,
				trainingDemand: 5,
			}),
		];

		const digest = deriveWeekDigest(previous, current);

		expect(digest.week).toBe(4);
		expect(digest.launches).toHaveLength(1);
		expect(digest.resumes).toHaveLength(1);
		expect(digest.trainingCompletions).toHaveLength(1);
		expect(digest.evaluations).toHaveLength(1);
		expect(digest.incidents).toHaveLength(1);
		expect(digest.fundingEvents).toHaveLength(1);
		expect(digest.projectCompletions).toHaveLength(1);
		expect(digest.servingThrottles).toHaveLength(1);
		expect(digest.trainingStarvations).toHaveLength(1);
		expect(digest.launches[0]?.productId).toBe("product_001");
	});

	it("exposes selected paradigms without losing current-week precedence", () => {
		const previous = startRun({ companyName: "Acme Labs" }, 42);
		previous.meta.week = 3;
		const current = startRun({ companyName: "Acme Labs" }, 42);
		current.meta.week = 4;
		current.research.paradigmId = "scale_maximalism";
		current.reports.items = [
			report("previous", {
				kind: "paradigm_selected",
				paradigmId: "data_curation_doctrine",
				era: "text",
				week: 3,
			}),
			report("current", {
				kind: "paradigm_selected",
				paradigmId: "scale_maximalism",
				era: "text",
				week: 4,
			}),
		];

		const digest = deriveWeekDigest(previous, current);

		expect(digest.paradigmSelections).toHaveLength(1);
		expect(digest.paradigmSelections[0]).toMatchObject({
			paradigmId: "scale_maximalism",
			week: 4,
		});
		expect(summarizeWeekDigest(digest, undefined, current)).toBe(
			"Week 4: Scale Maximalism selected — Benefit: +8 model score ceiling; Liability: +2 training Compute.",
		);
	});

	it("includes completed-week facts after the state week advances", () => {
		const previous = startRun({ companyName: "Acme Labs" }, 42);
		previous.meta.week = 7;
		const current = startRun({ companyName: "Acme Labs" }, 42);
		current.meta.week = 8;
		current.reports.items = [
			report("spark", {
				kind: "research_spark_discovered",
				sparkId: "inference_optimization",
				nodeId: "inference_price_war",
				discount: 1,
				trigger: "serving_throttled",
				week: 7,
			}),
		];

		const digest = deriveWeekDigest(previous, current);

		expect(digest.week).toBe(8);
		expect(digest.sparkDiscoveries).toHaveLength(1);
		expect(digest.sparkDiscoveries[0]).toMatchObject({
			sparkId: "inference_optimization",
			week: 7,
		});
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

		it("names a resumed product in the compact summary", () => {
			const previous = startRun({ companyName: "Acme Labs" }, 42);
			const current = startRun({ companyName: "Acme Labs" }, 42);
			current.meta.week = 14;
			current.models.items = [
				{
					id: "model_001",
					name: "Atlas",
					foundation: "fresh",
					status: "launched",
					projectId: null,
				},
			];
			current.products.items = [
				{
					id: "product_001",
					channel: "chat",
					modelId: "model_001",
					status: "operating",
				},
			];
			current.reports.items = [
				report("resume", {
					kind: "product_resumed",
					productId: "product_001",
					channel: "chat",
					week: 14,
				}),
			];

			expect(
				summarizeWeekDigest(
					deriveWeekDigest(previous, current),
					diffResourceBar(current, current),
					current,
				),
			).toBe("Week 14: Atlas · Chat resumed");
		});

		it("provides a calm empty-state summary", () => {
			const state = startRun({ companyName: "Acme Labs" }, 42);
			expect(summarizeWeekDigest(deriveWeekDigest(null, state))).toBe(
				"Week 1: No new activity recorded.",
			);
		});
	});
});
