import { describe, expect, it } from "vitest";
import {
	computeReservations,
	withRecomputedCompute,
} from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import { startRun } from "./index.js";

describe("compute reservations", () => {
	it("reports zero demand for an idle opening state", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		expect(computeReservations(state)).toEqual({
			trainingDemand: 0,
			servingDemand: 0,
			evaluationDemand: 0,
			totalDemand: 0,
			allocated: 0,
		});
	});

	it("sums active training, serving, and evaluation demand per entity", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "training",
				projectId: "project_001",
				tier: "aggressive",
			},
			{
				id: "model_002",
				name: "Borealis-1",
				foundation: "fresh",
				status: "training",
				projectId: "project_003",
				tier: "lean",
			},
			{
				id: "model_003",
				name: "Calypso-1",
				foundation: "fresh",
				status: "launched",
				projectId: null,
			},
			{
				id: "model_004",
				name: "Delphine-1",
				foundation: "fresh",
				status: "training",
				projectId: "project_006",
			},
		];
		state.projects.items = [
			{
				kind: "training",
				id: "project_001",
				teamId: "team_001",
				modelId: "model_001",
				status: "active",
				progress: 0,
				duration: 4,
			},
			{
				kind: "training",
				id: "project_003",
				teamId: "team_001",
				modelId: "model_002",
				status: "cancelled",
				progress: 1,
				duration: 2,
			},
			{
				kind: "training",
				id: "project_006",
				teamId: null,
				modelId: "model_004",
				status: "active",
				progress: 1,
				duration: 2,
			},
			{
				kind: "evaluation",
				id: "project_004",
				teamId: "team_001",
				modelId: "model_003",
				evaluation: "capability",
				status: "active",
				progress: 0,
				duration: 1,
			},
			{
				kind: "evaluation",
				id: "project_005",
				teamId: null,
				modelId: "model_003",
				evaluation: "safety_reliability",
				status: "completed",
				progress: 1,
				duration: 1,
			},
		];
		state.products.items = [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_003",
				status: "operating",
				users: 10,
				lastRevenue: 0,
				cumulativeRevenue: 0,
				servingDemand: 30,
				effectiveQuality: 60,
			},
			{
				id: "product_002",
				channel: "developer_api",
				modelId: "model_003",
				status: "paused",
				users: 8,
				lastRevenue: 0,
				cumulativeRevenue: 0,
				servingDemand: 40,
				effectiveQuality: 60,
			},
		];

		const expectedTraining = BALANCE.modelTiers.aggressive.trainingCompute;
		const reservations = computeReservations(state);
		expect(reservations.trainingDemand).toBe(expectedTraining);
		expect(reservations.servingDemand).toBe(30);
		expect(reservations.evaluationDemand).toBe(
			BALANCE.evaluations.capability.computeCost,
		);
		expect(reservations.totalDemand).toBe(
			expectedTraining + 30 + BALANCE.evaluations.capability.computeCost,
		);
	});

	it("caps allocated at capacity while keeping demand visible", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.capacity = 5;
		state.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "training",
				projectId: "project_001",
				tier: "aggressive",
			},
		];
		state.projects.items = [
			{
				kind: "training",
				id: "project_001",
				teamId: "team_001",
				modelId: "model_001",
				status: "active",
				progress: 0,
				duration: 4,
			},
		];

		const reservations = computeReservations(state);
		expect(reservations.trainingDemand).toBe(
			BALANCE.modelTiers.aggressive.trainingCompute,
		);
		expect(reservations.allocated).toBe(5);
	});

	it("ignores training projects whose model has no tier", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "training",
				projectId: "project_001",
			},
		];
		state.projects.items = [
			{
				kind: "training",
				id: "project_001",
				teamId: "team_001",
				modelId: "model_001",
				status: "active",
				progress: 0,
				duration: 4,
			},
		];

		const reservations = computeReservations(state);
		expect(reservations.trainingDemand).toBe(0);
		expect(reservations.totalDemand).toBe(0);
	});

	it("recomputes the compute component without touching capacity", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.capacity = 9;
		state.compute.allocated = 3;
		state.compute.servingDemand = 4;
		state.compute.trainingDemand = 2;
		state.products.items = [
			{
				id: "product_001",
				channel: "chat",
				modelId: "model_001",
				status: "operating",
				users: 10,
				lastRevenue: 0,
				cumulativeRevenue: 0,
				servingDemand: 7,
				effectiveQuality: 60,
			},
		];
		state.models.items = [
			{
				id: "model_001",
				name: "Aurora-1",
				foundation: "fresh",
				status: "launched",
				projectId: null,
			},
		];

		const compute = withRecomputedCompute(state);
		expect(compute.capacity).toBe(9);
		expect(compute.servingDemand).toBe(7);
		expect(compute.trainingDemand).toBe(0);
		expect(compute.allocated).toBe(7);
	});
});
