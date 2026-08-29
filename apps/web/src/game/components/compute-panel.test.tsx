/** @vitest-environment jsdom */

import { startRun } from "@ai-lab-tycoon/engine";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ComputePanel from "./compute-panel";

afterEach(() => {
	cleanup();
});

describe("ComputePanel", () => {
	it("shows current demand and links procurement to the Compute grid", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.allocated = 4;
		state.compute.trainingDemand = 3;
		state.compute.servingDemand = 2;

		render(<ComputePanel state={state} />);

		expect(screen.getByText("Training + serving demand: 5")).toBeDefined();
		expect(
			screen
				.getByRole("link", { name: "Manage on Compute grid" })
				.getAttribute("href"),
		).toBe("/game/compute");
	});

	it("shows when serving saturation pauses growth", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		state.compute.capacity = 12;
		state.compute.servingDemand = 12;

		render(<ComputePanel state={state} />);

		expect(
			screen.getByText("Serving demand 12 of 12 — growth paused"),
		).toBeDefined();
	});
});

it("keeps compute balance values aligned with the engine", async () => {
	const { BALANCE } = await import(
		"../../../../../packages/engine/src/data/balance.js"
	);
	expect(300).toBe(BALANCE.computePurchaseCost);
	expect(12).toBe(BALANCE.computePurchaseUnits);
	expect(300).toBe(BALANCE.hireTeamCost);
});
