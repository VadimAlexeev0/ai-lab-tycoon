// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RunwayWarning } from "@/game/derived/runway";

import RunwayWarningStrip, {
	mostSevereWarning,
	RunwayWarningList,
} from "./runway-warning-strip";

const warnings: RunwayWarning[] = [
	{
		code: "runway_critical",
		severity: "critical",
		message: "Cash covers 1.2 weeks at the current burn rate.",
	},
	{
		code: "idle_teams",
		severity: "info",
		message: "Founding Team is idle while Research is available.",
	},
];

afterEach(() => cleanup());

describe("runway warning strip", () => {
	it("selects and surfaces only the most severe warning", () => {
		expect(mostSevereWarning(warnings)).toBe(warnings[0]);

		render(<RunwayWarningStrip warnings={warnings} />);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Cash covers 1.2 weeks");
		expect(alert.textContent).not.toContain("Founding Team");
		expect(alert.getAttribute("data-warning-severity")).toBe("critical");
	});

	it("keeps the full warning context available in the dashboard list", () => {
		render(<RunwayWarningList warnings={warnings} />);

		const list = screen.getByRole("status");
		expect(list.textContent).toContain("Cash covers 1.2 weeks");
		expect(list.textContent).toContain("Founding Team");
	});
});
