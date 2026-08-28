// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	readStoredTheme,
	ThemeProvider,
	useTheme,
} from "../../../../packages/ui/src/components/theme-provider";
import { ThemeSwitcher } from "../../../../packages/ui/src/components/theme-switcher";

function ThemeProbe() {
	const { mode, motif, resolvedMode, setMode, setMotif } = useTheme();

	return (
		<div>
			<output data-testid="theme-state">
				{mode}:{motif}:{resolvedMode}
			</output>
			<button onClick={() => setMode("light")} type="button">
				Set light
			</button>
			<button onClick={() => setMotif("solarflare")} type="button">
				Set solarflare
			</button>
		</div>
	);
}

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: (key) => values.delete(key),
		clear: () => values.clear(),
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		},
	};
}

beforeEach(() => {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: createMemoryStorage(),
	});
});

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	document.documentElement.className = "";
	document.documentElement.removeAttribute("data-theme");
	document.documentElement.removeAttribute("data-mode");
	document.documentElement.removeAttribute("data-theme-mode");
	vi.restoreAllMocks();
});

describe("multi-motif theme provider", () => {
	it("hydrates a stored preference and applies the resolved document attributes", async () => {
		window.localStorage.setItem(
			"ailt-theme",
			JSON.stringify({ mode: "light", motif: "cleanroom" }),
		);

		render(
			<ThemeProvider>
				<ThemeProbe />
			</ThemeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("theme-state").textContent).toContain(
				"light:cleanroom:light",
			);
		});
		expect(document.documentElement.dataset.theme).toBe("cleanroom");
		expect(document.documentElement.dataset.mode).toBe("light");
		expect(document.documentElement.dataset.themeMode).toBe("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("updates the persisted preference when controls change it", async () => {
		render(
			<ThemeProvider>
				<ThemeProbe />
			</ThemeProvider>,
		);

		await waitFor(() => {
			expect(document.documentElement.dataset.theme).toBe("midnight");
		});

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Set light" }));
			fireEvent.click(screen.getByRole("button", { name: "Set solarflare" }));
		});

		await waitFor(() => {
			expect(screen.getByTestId("theme-state").textContent).toContain(
				"light:solarflare:light",
			);
		});
		expect(
			JSON.parse(window.localStorage.getItem("ailt-theme") ?? "{}"),
		).toEqual({ mode: "light", motif: "solarflare" });
	});
});

describe("theme switcher", () => {
	it("exposes labelled keyboard-accessible controls for every mode and motif", async () => {
		render(
			<ThemeProvider>
				<ThemeSwitcher />
			</ThemeProvider>,
		);

		expect(screen.getByRole("group", { name: "Color mode" })).not.toBeNull();
		expect(screen.getByRole("group", { name: "Theme motif" })).not.toBeNull();
		expect(screen.getAllByRole("button")).toHaveLength(7);
		expect(
			screen.getByRole("button", { name: "Use deepfreeze theme" }),
		).not.toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: "Use solarflare theme" }),
		);
		await waitFor(() => {
			expect(document.documentElement.dataset.theme).toBe("solarflare");
		});
	});

	describe("storage fallback", () => {
		it("survives a localStorage getter that throws", () => {
			Object.defineProperty(window, "localStorage", {
				configurable: true,
				get() {
					throw new Error("storage blocked");
				},
			});

			expect(readStoredTheme()).toBeNull();
			Object.defineProperty(window, "localStorage", {
				configurable: true,
				value: createMemoryStorage(),
			});
		});
	});
});
