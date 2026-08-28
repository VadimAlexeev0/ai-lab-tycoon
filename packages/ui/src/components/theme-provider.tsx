"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export const THEME_STORAGE_KEY = "ailt-theme";

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedThemeMode = Exclude<ThemeMode, "system">;

export const THEME_MOTIFS = [
	"midnight",
	"cleanroom",
	"solarflare",
	"deepfreeze",
] as const;
export type ThemeMotif = (typeof THEME_MOTIFS)[number];

export type ThemePreference = {
	mode: ThemeMode;
	motif: ThemeMotif;
};

export const DEFAULT_THEME: ThemePreference = {
	mode: "dark",
	motif: "midnight",
};

export const MOTIF_METADATA = {
	midnight: {
		label: "Midnight",
		description: "Deep navy command center",
		background: "#0a0e1a",
		primary: "#4fd8e8",
	},
	cleanroom: {
		label: "Cleanroom",
		description: "Clinical teal workspace",
		background: "#f7f7f2",
		primary: "#0e807d",
	},
	solarflare: {
		label: "Solarflare",
		description: "Warm charcoal and amber",
		background: "#161210",
		primary: "#ff9e3d",
	},
	deepfreeze: {
		label: "Deepfreeze",
		description: "Ice-blue research slate",
		background: "#0b1624",
		primary: "#77e6ff",
	},
} as const satisfies Record<
	ThemeMotif,
	{ label: string; description: string; background: string; primary: string }
>;

export type ThemeContextValue = ThemePreference & {
	resolvedMode: ResolvedThemeMode;
	isHydrated: boolean;
	setMode: (mode: ThemeMode) => void;
	setMotif: (motif: ThemeMotif) => void;
	setTheme: (theme: ThemePreference) => void;
	resetTheme: () => void;
};

export type ThemeProviderProps = {
	children: ReactNode;
	defaultMode?: ThemeMode;
	defaultMotif?: ThemeMotif;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isThemeMode(value: unknown): value is ThemeMode {
	return (
		typeof value === "string" &&
		(THEME_MODES as readonly string[]).includes(value)
	);
}

export function isThemeMotif(value: unknown): value is ThemeMotif {
	return (
		typeof value === "string" &&
		(THEME_MOTIFS as readonly string[]).includes(value)
	);
}

export function parseStoredTheme(value: string | null): ThemePreference | null {
	if (!value) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(value);
		if (
			!isRecord(parsed) ||
			!isThemeMode(parsed.mode) ||
			!isThemeMotif(parsed.motif)
		) {
			return null;
		}

		return {
			mode: parsed.mode,
			motif: parsed.motif,
		};
	} catch {
		return null;
	}
}

export function readStoredTheme(storage?: Storage): ThemePreference | null {
	try {
		const source =
			storage ??
			(typeof window === "undefined" ? undefined : window.localStorage);
		return parseStoredTheme(source?.getItem(THEME_STORAGE_KEY) ?? null);
	} catch {
		return null;
	}
}

function writeStoredTheme(theme: ThemePreference): void {
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
	} catch {
		// Private browsing and storage-blocked contexts still get live theming.
	}
}

export function getSystemMode(
	mediaQuery: MediaQueryList | undefined = typeof window === "undefined" ||
	typeof window.matchMedia !== "function"
		? undefined
		: window.matchMedia("(prefers-color-scheme: dark)"),
): ResolvedThemeMode {
	return mediaQuery?.matches ? "dark" : "light";
}

export function applyThemeToDocument(
	theme: ThemePreference,
	resolvedMode: ResolvedThemeMode,
	root: HTMLElement | undefined = typeof document === "undefined"
		? undefined
		: document.documentElement,
): void {
	if (!root) {
		return;
	}

	root.dataset.theme = theme.motif;
	root.dataset.mode = resolvedMode;
	root.dataset.themeMode = theme.mode;
	root.classList.toggle("dark", resolvedMode === "dark");
	root.style.colorScheme = resolvedMode;
}

export const THEME_INIT_SCRIPT = `(() => {
	const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
	const motifs = ${JSON.stringify(THEME_MOTIFS)};
	const modes = ${JSON.stringify(THEME_MODES)};
	const fallback = ${JSON.stringify(DEFAULT_THEME)};
	let preference = fallback;

	try {
		const stored = window.localStorage.getItem(storageKey);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (
				parsed &&
				typeof parsed === "object" &&
				motifs.includes(parsed.motif) &&
				modes.includes(parsed.mode)
			) {
				preference = { motif: parsed.motif, mode: parsed.mode };
			}
		}
	} catch {}

	const resolvedMode =
		preference.mode === "system"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: preference.mode;
	const root = document.documentElement;
	root.dataset.theme = preference.motif;
	root.dataset.mode = resolvedMode;
	root.dataset.themeMode = preference.mode;
	root.classList.toggle("dark", resolvedMode === "dark");
	root.style.colorScheme = resolvedMode;
})();`;

export function ThemeProvider({
	children,
	defaultMode = DEFAULT_THEME.mode,
	defaultMotif = DEFAULT_THEME.motif,
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<ThemePreference>({
		mode: defaultMode,
		motif: defaultMotif,
	});
	const [systemMode, setSystemMode] = useState<ResolvedThemeMode>("dark");
	const [isHydrated, setIsHydrated] = useState(false);
	const resolvedMode = theme.mode === "system" ? systemMode : theme.mode;

	useEffect(() => {
		const mediaQuery =
			typeof window !== "undefined" && typeof window.matchMedia === "function"
				? window.matchMedia("(prefers-color-scheme: dark)")
				: undefined;
		const storedTheme = readStoredTheme();
		const nextTheme =
			storedTheme ??
			({ mode: defaultMode, motif: defaultMotif } satisfies ThemePreference);
		const nextSystemMode = getSystemMode(mediaQuery);

		setThemeState(nextTheme);
		setSystemMode(nextSystemMode);
		applyThemeToDocument(
			nextTheme,
			nextTheme.mode === "system" ? nextSystemMode : nextTheme.mode,
		);
		setIsHydrated(true);

		const handleSystemModeChange = () => {
			setSystemMode(getSystemMode(mediaQuery));
		};
		const handleStorageChange = (event: StorageEvent) => {
			if (event.key !== THEME_STORAGE_KEY) {
				return;
			}

			const nextStoredTheme = parseStoredTheme(event.newValue);
			setThemeState(
				nextStoredTheme ?? { mode: defaultMode, motif: defaultMotif },
			);
		};

		if (mediaQuery) {
			mediaQuery.addEventListener("change", handleSystemModeChange);
		}
		window.addEventListener("storage", handleStorageChange);

		return () => {
			if (mediaQuery) {
				mediaQuery.removeEventListener("change", handleSystemModeChange);
			}
			window.removeEventListener("storage", handleStorageChange);
		};
	}, [defaultMode, defaultMotif]);

	useEffect(() => {
		if (!isHydrated) {
			return;
		}

		applyThemeToDocument(theme, resolvedMode);
		writeStoredTheme(theme);
	}, [isHydrated, resolvedMode, theme]);

	const setMode = useCallback((mode: ThemeMode) => {
		setThemeState((current) => ({ ...current, mode }));
	}, []);

	const setMotif = useCallback((motif: ThemeMotif) => {
		setThemeState((current) => ({ ...current, motif }));
	}, []);

	const setTheme = useCallback((nextTheme: ThemePreference) => {
		setThemeState({ ...nextTheme });
	}, []);

	const resetTheme = useCallback(() => {
		setThemeState({ mode: defaultMode, motif: defaultMotif });
	}, [defaultMode, defaultMotif]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			mode: theme.mode,
			motif: theme.motif,
			resolvedMode,
			isHydrated,
			setMode,
			setMotif,
			setTheme,
			resetTheme,
		}),
		[
			isHydrated,
			resetTheme,
			resolvedMode,
			setMode,
			setMotif,
			setTheme,
			theme.mode,
			theme.motif,
		],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used inside a ThemeProvider");
	}
	return context;
}

export function useOptionalTheme(): ThemeContextValue | null {
	return useContext(ThemeContext);
}
