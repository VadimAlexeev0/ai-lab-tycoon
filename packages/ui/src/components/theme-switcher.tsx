"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "../lib/utils";
import {
	MOTIF_METADATA,
	THEME_MODES,
	THEME_MOTIFS,
	type ThemeMode,
	useTheme,
} from "./theme-provider";

const MODE_OPTIONS = [
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "dark", label: "Dark", Icon: Moon },
	{ value: "system", label: "System", Icon: Monitor },
] as const satisfies ReadonlyArray<{
	value: ThemeMode;
	label: string;
	Icon: typeof Sun;
}>;

export function ThemeSwitcher() {
	const { mode, motif, setMode, setMotif } = useTheme();

	return (
		<div
			className="flex items-center gap-2 rounded-md border border-border/80 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur-sm"
			data-theme-switcher="true"
		>
			<fieldset className="flex items-center gap-0.5 rounded border border-border/70 bg-background/70 p-0.5">
				<legend className="sr-only">Color mode</legend>
				{MODE_OPTIONS.map(({ value, label, Icon }) => {
					const isActive = mode === value;

					return (
						<button
							key={value}
							aria-label={`Use ${label.toLowerCase()} mode`}
							aria-pressed={isActive}
							className={cn(
								"inline-flex min-h-8 min-w-8 items-center justify-center rounded px-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isActive && "bg-primary/15 text-primary shadow-sm",
							)}
							data-theme-mode={value}
							onClick={() => setMode(value)}
							title={`${label} color mode`}
							type="button"
						>
							<Icon
								aria-hidden="true"
								className="size-3.5"
								strokeWidth={1.75}
							/>
							<span className="sr-only">{label}</span>
						</button>
					);
				})}
			</fieldset>

			<fieldset className="flex items-center gap-0.5">
				<legend className="sr-only">Theme motif</legend>
				{THEME_MOTIFS.map((themeMotif) => {
					const details = MOTIF_METADATA[themeMotif];
					const isActive = motif === themeMotif;

					return (
						<button
							key={themeMotif}
							aria-label={`Use ${details.label.toLowerCase()} theme`}
							aria-pressed={isActive}
							className={cn(
								"inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-transparent p-1 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isActive && "border-primary ring-1 ring-primary/60",
							)}
							data-theme-motif={themeMotif}
							onClick={() => setMotif(themeMotif)}
							title={`${details.label}: ${details.description}`}
							type="button"
						>
							<span
								aria-hidden="true"
								className="size-5 rounded-full border border-white/40 shadow-inner"
								style={{
									background: `linear-gradient(135deg, ${details.background} 0 50%, ${details.primary} 50% 100%)`,
								}}
							/>
							<span className="sr-only">{details.label}</span>
						</button>
					);
				})}
			</fieldset>
		</div>
	);
}

export { THEME_MODES };
