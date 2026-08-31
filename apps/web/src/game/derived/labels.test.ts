import { type Fact, startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import { humanizeId, resolveEntityLabel, resolveFactLabels } from "./labels";

describe("entity labels", () => {
	it("resolves current names for every fact entity kind", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const node = state.research.nodes[0];
		const rival = state.rivals.items[0];
		if (node === undefined || rival === undefined) {
			throw new Error("Expected opening research and rival entities");
		}
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

		expect(resolveEntityLabel(state, "project", "project_001")).toBe(
			"Training · Atlas",
		);
		expect(resolveEntityLabel(state, "model", "model_001")).toBe("Atlas");
		expect(resolveEntityLabel(state, "product", "product_001")).toBe(
			"Atlas · Chat",
		);
		expect(resolveEntityLabel(state, "rival", rival.id)).toBe(rival.name);
		expect(resolveEntityLabel(state, "node", node.id)).not.toBe(node.id);
	});

	it("resolves fact ID fields without exposing their storage IDs", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
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
				channel: "developer_api",
				modelId: "model_001",
				status: "operating",
			},
		];

		const fact: Fact = {
			kind: "revenue",
			productId: "product_001",
			channel: "developer_api",
			amount: 80,
			effectiveQuality: 70,
			week: 2,
		};

		expect(resolveFactLabels(state, fact)).toEqual({
			productId: "Atlas · Developer API",
		});
	});

	it("resolves product resume fact IDs like other product facts", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
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
				channel: "developer_api",
				modelId: "model_001",
				status: "operating",
			},
		];

		expect(
			resolveFactLabels(state, {
				kind: "product_resumed",
				productId: "product_001",
				channel: "developer_api",
				week: 2,
			}),
		).toEqual({ productId: "Atlas · Developer API" });
	});

	it("humanizes missing and stale IDs", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);

		expect(resolveEntityLabel(state, "model", "model_retired_alpha")).toBe(
			"Model Retired Alpha",
		);
		expect(resolveEntityLabel(state, "project", "project_cancelled_007")).toBe(
			"Project Cancelled 007",
		);
		expect(resolveEntityLabel(state, "product", "product_001")).toBe(
			"Product 001",
		);
		expect(humanizeId("node_safety_review")).toBe("Node Safety Review");
	});
});
