import { Button } from "@ai-lab-tycoon/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ai-lab-tycoon/ui/components/dialog";
import { Separator } from "@ai-lab-tycoon/ui/components/separator";
import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";

const DEBUG_CONTROLS_ENABLED = import.meta.env.DEV;

export type DebugDrawerProps = {
	debugForced: boolean;
	quarter: number;
	rivalProgress: number;
	onForceQuarterlyReview: () => void;
	onForceIndustryPulse: () => void;
	onForceChronicle: () => void;
	onForceLineage: () => void;
	onForceNotebook: () => void;
	onForceAgiProgram: () => void;
	agiOverride: number;
	onAgiOverrideChange: (override: number) => void;
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
	onForceChronicle,
	onForceLineage,
	onForceNotebook,
	onForceAgiProgram,
	agiOverride,
	onAgiOverrideChange,
	onQuarterChange,
	onRivalProgressChange,
}: DebugDrawerProps) {
	const [storedDebug, setStoredDebug] = useState(false);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!DEBUG_CONTROLS_ENABLED) return;
		try {
			setStoredDebug(window.localStorage.getItem("ailt-debug") === "1");
		} catch {
			setStoredDebug(false);
		}
	}, []);

	const visible = DEBUG_CONTROLS_ENABLED && (debugForced || storedDebug);
	useEffect(() => {
		if (!visible) setOpen(false);
	}, [visible]);

	if (!visible) return null;

	return (
		<div className="fixed bottom-3 left-3 z-[70] flex max-w-[calc(100vw-1.5rem)] flex-col items-start gap-2">
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogTrigger
					aria-controls="debug-drawer"
					aria-expanded={open}
					aria-label={open ? "Close debug controls" : "Open debug controls"}
					render={
						<Button
							className="glass-pane bg-amber/10 px-3 py-2 text-amber shadow-[0_4px_20px_rgba(0,0,0,0.25)] ring-1 ring-amber/60 hover:bg-amber/10"
							size="icon"
							title="Open debug controls"
							variant="outline"
						/>
					}
				>
					<Settings2 className="size-4" aria-hidden="true" />
				</DialogTrigger>
				<DialogContent
					className="!top-auto !right-auto !bottom-3 !left-3 !translate-x-0 !translate-y-0 z-[70] w-[min(22rem,calc(100vw-1.5rem))] max-w-none bg-card/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-amber/60 backdrop-blur-sm sm:max-w-none"
					id="debug-drawer"
					showCloseButton={false}
				>
					<DialogHeader className="gap-0">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-semibold text-amber text-xs">
									Preview controls
								</p>
								<DialogTitle className="mt-1 font-semibold text-foreground text-sm">
									Debug drawer
								</DialogTitle>
							</div>
							<DialogClose
								aria-label="Close debug drawer"
								className="flex min-h-8 min-w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
								type="button"
							>
								<X className="size-3.5" aria-hidden="true" />
							</DialogClose>
						</div>
					</DialogHeader>
					<Separator className="mt-2 bg-amber/30" />

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
							<Button
								className="h-auto min-h-11 whitespace-normal text-left"
								onClick={onForceChronicle}
								size="sm"
								type="button"
								variant="outline"
							>
								Force Chronicle death certificate
							</Button>
							<Button
								className="h-auto min-h-11 whitespace-normal text-left"
								onClick={onForceLineage}
								size="sm"
								type="button"
								variant="outline"
							>
								Force Model Lineage Gallery
							</Button>
							<Button
								className="h-auto min-h-11 whitespace-normal text-left"
								onClick={onForceNotebook}
								size="sm"
								type="button"
								variant="outline"
							>
								Force Notebook / show all
							</Button>
							<Button
								className="h-auto min-h-11 whitespace-normal text-left"
								onClick={onForceAgiProgram}
								size="sm"
								type="button"
								variant="outline"
							>
								Force AGI Program Vault
							</Button>
						</div>

						<label className="block space-y-1.5" htmlFor="debug-quarter">
							<span className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
								<span>Quarter number</span>
								<strong className="text-foreground">{quarter} / 6</strong>
							</span>
							<input
								aria-valuemax={6}
								aria-valuemin={1}
								aria-valuenow={quarter}
								className="w-full accent-amber"
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
							<span className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
								<span>Rival progress</span>
								<strong className="text-foreground">{rivalProgress}%</strong>
							</span>
							<input
								aria-valuemax={100}
								aria-valuemin={0}
								aria-valuenow={rivalProgress}
								className="w-full accent-amber"
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

						<label className="block space-y-1.5" htmlFor="debug-agi-override">
							<span className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
								<span>AGI socket override</span>
								<strong className="text-foreground">{agiOverride} / 6</strong>
							</span>
							<input
								aria-valuemax={6}
								aria-valuemin={0}
								aria-valuenow={agiOverride}
								className="w-full accent-amber"
								id="debug-agi-override"
								max={6}
								min={0}
								onChange={(event) =>
									onAgiOverrideChange(Number(event.target.value))
								}
								type="range"
								value={agiOverride}
							/>
						</label>

						<Separator className="bg-amber/30" />
						<p className="pt-2 text-muted-foreground text-xs leading-5">
							Preview values stay outside the engine save. Use the URL controls
							to make a review or news batch reproducible.
						</p>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
