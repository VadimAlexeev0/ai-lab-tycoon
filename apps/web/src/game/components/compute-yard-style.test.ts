import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
	fileURLToPath(
		new URL(
			"../../../../../packages/ui/src/styles/globals.css",
			import.meta.url,
		),
	),
	"utf8",
);

const COMPUTE_YARD_CLASSES = [
	"compute-demand-bar",
	"compute-demand-bar__segment",
	"compute-demand-bar__segment--training",
	"compute-demand-bar__segment--serving",
	"compute-demand-bar__segment--evaluation",
	"compute-demand-bar__legend-swatch",
	"compute-demand-bar__legend-swatch--training",
	"compute-demand-bar__legend-swatch--serving",
	"compute-demand-bar__legend-swatch--evaluation",
	"compute-yard-scene",
	"compute-yard-scene__canvas",
	"compute-yard-scene__overlay",
	"compute-yard-scene__caption",
	"compute-yard-fallback",
	"compute-yard-fallback__notice",
	"compute-yard-fallback__units",
	"compute-yard__block",
	"compute-yard__block--serving",
	"compute-yard__block--training",
	"compute-yard__block--evaluation",
	"compute-yard__block--free",
	"compute-yard__unit-label",
	"compute-yard-legend",
	"compute-yard-legend__item",
	"compute-yard-legend__swatch",
	"compute-yard-legend__swatch--serving",
	"compute-yard-legend__swatch--training",
	"compute-yard-legend__swatch--evaluation",
	"compute-yard-legend__swatch--free",
] as const;

describe("compute yard style coverage", () => {
	it("defines every component-specific class in the shared stylesheet", () => {
		for (const className of COMPUTE_YARD_CLASSES) {
			expect(stylesheet).toContain(`.${className}`);
		}
	});
});
