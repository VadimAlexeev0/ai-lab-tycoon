// @vitest-environment jsdom

import { type Fact, startRun } from "@ai-lab-tycoon/engine";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deriveWeekDigest } from "../derived/week-digest";
import WeekResolutionCard from "./week-resolution-card";

function report(id: string, fact: Fact) {
	return {
		id,
		priority: "informational" as const,
		fact,
		acknowledged: false,
	};
}

describe("WeekResolutionCard", () => {
	it("shows fact-backed causal deltas with resolved entity names", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.meta.week = 4;
		state.models.items = [
			{
				id: "model_001",
				name: "Atlas",
				foundation: "fresh",
				status: "ready",
				projectId: null,
			},
		];
		state.products.items = [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_001",
				status: "operating",
			},
		];
		state.projects.items = [
			{
				kind: "training",
				id: "project_001",
				teamId: null,
				status: "completed",
				progress: 1,
				duration: 1,
				modelId: "model_001",
			},
		];
		const facts: Fact[] = [
			{ kind: "resource_changed", resource: "cash", amount: -75, week: 4 },
			{ kind: "resource_changed", resource: "cash", amount: -80, week: 4 },
			{
				kind: "incident_occurred",
				incident: "outage",
				condition: "api_overload",
				affectedEntity: "product_001",
				metric: "latency",
				measurement: 120,
				threshold: 100,
				severity: 3,
				week: 4,
			},
			{ kind: "resource_changed", resource: "cash", amount: -25, week: 4 },
			{
				kind: "revenue",
				productId: "product_001",
				channel: "chat",
				amount: 100,
				effectiveQuality: 80,
				week: 4,
			},
			{ kind: "resource_changed", resource: "cash", amount: 100, week: 4 },
			{ kind: "resource_changed", resource: "insight", amount: 2, week: 4 },
			{ kind: "resource_changed", resource: "trust", amount: -4, week: 4 },
			{ kind: "resource_changed", resource: "hype", amount: 3, week: 4 },
			{
				kind: "serving_throttled",
				productId: "product_001",
				week: 4,
				unmetDemand: 3,
			},
			{
				kind: "training_starved",
				week: 4,
				capacity: 12,
				servingDemand: 15,
				evaluationDemand: 2,
				trainingDemand: 5,
			},
			{
				kind: "product_launched",
				productId: "product_001",
				channel: "chat",
				week: 4,
			},
			{ kind: "model_trained", modelId: "model_001", week: 4 },
			{ kind: "project_completed", projectId: "project_001", week: 4 },
		];
		state.reports.items = facts.map((fact, index) =>
			report(`report_${String(index + 1).padStart(3, "0")}`, fact),
		);

		const digest = deriveWeekDigest(null, state);
		const { container } = render(
			<WeekResolutionCard digest={digest} state={state} />,
		);

		expect(
			screen.getByRole("heading", { name: "Week 4 resolution" }),
		).toBeTruthy();
		expect(
			screen.getByText(
				/Cash fell by 80: 75 upkeep, 80 model work, 25 incident response/,
			),
		).toBeTruthy();
		expect(screen.getAllByText(/Atlas · Chat/).length).toBeGreaterThan(0);
		expect(screen.getByText(/Training · Atlas completed/)).toBeTruthy();
		expect(screen.getByText(/Atlas · Chat serving throttled/)).toBeTruthy();
		expect(
			screen.getByText(/Training paused by compute pressure/),
		).toBeTruthy();
		expect(container.textContent).not.toContain("product_001");
		expect(container.textContent).not.toContain("model_001");
		expect(container.textContent).not.toContain("project_001");
	});
});
