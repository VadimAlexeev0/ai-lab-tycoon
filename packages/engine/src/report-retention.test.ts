import { describe, expect, it } from "vitest";

import {
	assertFact,
	createReportsState,
	type Fact,
	type Report,
} from "./components/reports.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import { selectRecentReports } from "./selectors.js";
import { appendFactsAsReports, priorityForFact } from "./systems/reporting.js";

const REPORT_COUNT = 205;

function report(index: number): Report {
	return {
		id: `report_${String(index).padStart(3, "0")}`,
		priority: "informational",
		fact: {
			kind: "resource_changed",
			resource: "cash",
			amount: 1,
			week: 1,
		},
		acknowledged: false,
	};
}

function resourceFacts(count: number): Fact[] {
	return Array.from({ length: count }, () => ({
		kind: "resource_changed" as const,
		resource: "cash" as const,
		amount: 1,
		week: 1,
	}));
}

describe("report retention", () => {
	it("classifies product resumes as important reports and queues them", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const fact: Fact = {
			kind: "product_resumed",
			productId: "product_001",
			channel: "chat",
			week: 1,
		};

		expect(priorityForFact(fact)).toBe("important");
		const next = appendFactsAsReports(state, [fact]);
		expect(next.reports.items.at(-1)).toMatchObject({
			priority: "important",
			fact,
		});
		expect(next.queue.reportIds).toContain(next.reports.items.at(-1)?.id);
	});

	it("hydrates only the newest reports while retaining the lifetime count", () => {
		const hydrated = createReportsState(
			Array.from({ length: REPORT_COUNT }, (_, index) => report(index + 1)),
		);

		expect(hydrated.items).toHaveLength(200);
		expect(hydrated.items[0]?.id).toBe("report_006");
		expect(hydrated.items.at(-1)?.id).toBe("report_205");
		expect((hydrated as unknown as { totalCount: number }).totalCount).toBe(
			REPORT_COUNT,
		);
	});

	it("bounds appended reports and keeps queue and selector projections coherent", () => {
		const initial = startRun({ companyName: "Acme Labs" }, 42);
		initial.reports = createReportsState(
			Array.from({ length: 200 }, (_, index) => report(index + 1)),
		);
		initial.queue.reportIds = initial.reports.items.map((item) => item.id);
		initial.counters.report = 201;
		const next = appendFactsAsReports(initial, resourceFacts(1));

		expect(next.reports.items).toHaveLength(200);
		expect(next.reports.items[0]?.id).toBe("report_002");
		expect(next.reports.items.at(-1)?.id).toBe("report_201");
		expect((next.reports as unknown as { totalCount: number }).totalCount).toBe(
			201,
		);
		expect(next.queue.reportIds).toHaveLength(200);
		expect(selectRecentReports(next)).toHaveLength(200);
		expect(() => assertGameState(next)).not.toThrow();
		expect(initial.reports.items).toHaveLength(200);
	});

	it("validates compute pressure facts and integer served-share percentages", () => {
		expect(() =>
			assertFact({
				kind: "serving_throttled",
				productId: "product_001",
				week: 2,
				unmetDemand: 3,
			}),
		).not.toThrow();
		expect(() =>
			assertFact({
				kind: "training_starved",
				week: 2,
				capacity: 12,
				servingDemand: 15,
				evaluationDemand: 0,
				trainingDemand: 3,
			}),
		).not.toThrow();
		expect(() =>
			assertFact({
				kind: "revenue",
				productId: "product_001",
				channel: "chat",
				amount: 25,
				effectiveQuality: 50,
				servedShare: 50,
				week: 2,
			}),
		).not.toThrow();
		expect(() =>
			assertFact({
				kind: "revenue",
				productId: "product_001",
				channel: "chat",
				amount: 25,
				effectiveQuality: 50,
				servedShare: 0.5,
				week: 2,
			}),
		).toThrow(/integer|served share/i);
	});
});
