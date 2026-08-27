import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";

export type DebugDrawerProps = {
	debugForced: boolean;
	quarter: number;
	rivalProgress: number;
	onForceQuarterlyReview: () => void;
	onForceIndustryPulse: () => void;
	onQuarterChange: (quarter: number) => void;
	onRivalProgressChange: (progress: number) => void;
};

/** Debug-only controls for previewing the not-yet-engine-backed surfaces. */
export default function DebugDrawer({
	debugForced,
	quarter,
	rivalProgress,
	onForceQuarterlyReview,
	onForceIndustryPulse,
	onQuarterChange,
	onRivalProgressChange,
}: DebugDrawerProps) {
	const [storedDebug, setStoredDebug] = useState(false);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		try {
			setStoredDebug(window.localStorage.getItem("ailt-debug") === "1");
		} catch {
			setStoredDebug(false);
		}
	}, []);

	const visible = debugForced || storedDebug;
	useEffect(() => {
		if (!visible) setOpen(false);
	}, [visible]);

	if (!visible) return null;

	return (
		<div className="fixed bottom-3 left-3 z-[70] flex max-w-[calc(100vw-1.5rem)] flex-col items-start gap-2">
			{open ? (
				<section
					aria-labelledby="debug-drawer-heading"
					className="w-[min(22rem,calc(100vw-1.5rem))] border border-[var(--game-amber)]/60 bg-card/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm"
					id="debug-drawer"
					role="dialog"
				>
					<div className="flex items-start justify-between gap-3 border-[var(--game-amber)]/30 border-b pb-2">
						<div>
							<p className="font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.18em]">
								Preview controls
							</p>
							<h2
								className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
								id="debug-drawer-heading"
							>
								Debug drawer
							</h2>
						</div>
						<button
							aria-label="Close debug drawer"
							className="flex min-h-8 min-w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={() => setOpen(false)}
							type="button"
						>
							<X className="size-3.5" aria-hidden="true" />
						</button>
					</div>

					<div className="mt-3 space-y-3">
						<div className="grid gap-2 sm:grid-cols-2">
							<Button
								className="h-auto min-h-11 whitespace-normal text-left"
								onClick={onForceQuarterlyReview}
								size="sm"
								type="button"
								variant="outline"
							>
								Force Quarterly Review
							</Button>
							<Button
								className="h-auto min-h-11 whitespace-normal text-left"
								onClick={onForceIndustryPulse}
								size="sm"
								type="button"
								variant="outline"
							>
								Force News Pulse
							</Button>
						</div>

						<label className="block space-y-1.5" htmlFor="debug-quarter">
							<span className="flex items-center justify-between gap-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
								<span>Quarter number</span>
								<strong className="text-foreground">{quarter} / 6</strong>
							</span>
							<input
								aria-valuemax={6}
								aria-valuemin={1}
								aria-valuenow={quarter}
								className="w-full accent-[var(--game-amber)]"
								id="debug-quarter"
								max={6}
								min={1}
								onChange={(event) =>
									onQuarterChange(Number(event.target.value))
								}
								type="range"
								value={quarter}
							/>
						</label>

						<label className="block space-y-1.5" htmlFor="debug-rival-progress">
							<span className="flex items-center justify-between gap-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
								<span>Rival progress</span>
								<strong className="text-foreground">{rivalProgress}%</strong>
							</span>
							<input
								aria-valuemax={100}
								aria-valuemin={0}
								aria-valuenow={rivalProgress}
								className="w-full accent-[var(--game-amber)]"
								id="debug-rival-progress"
								max={100}
								min={0}
								onChange={(event) =>
									onRivalProgressChange(Number(event.target.value))
								}
								type="range"
								value={rivalProgress}
							/>
						</label>
						<p className="border-[var(--game-amber)]/30 border-t pt-2 text-muted-foreground text-xs leading-5">
							Preview values stay outside the engine save. Use the URL controls
							to make a review or news batch reproducible.
						</p>
					</div>
				</section>
			) : null}
			<Button
				aria-controls="debug-drawer"
				aria-expanded={open}
				aria-label={open ? "Close debug controls" : "Open debug controls"}
				className="border-[var(--game-amber)]/60 bg-card/95 text-[var(--game-amber)] shadow-[0_4px_20px_rgba(0,0,0,0.25)] hover:bg-[var(--game-amber)]/10"
				onClick={() => setOpen((current) => !current)}
				size="icon"
				title="Open debug controls"
				type="button"
				variant="outline"
			>
				<Settings2 className="size-4" aria-hidden="true" />
			</Button>
		</div>
	);
}
