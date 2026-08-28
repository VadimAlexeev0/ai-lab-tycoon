import {
	type GameState,
	selectTerminalObjective,
	selectTerminalProjection,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Flag, RotateCcw, Trophy } from "lucide-react";

import ArtFrame from "@/game/components/art-frame";

export type RunResultProps = {
	state: GameState;
	disabled?: boolean;
	milestoneDismissed?: boolean;
	onContinueSandbox?: () => void;
	onRestartRun?: () => void;
};

const OPS_ADVISOR = {
	alt: "Advisor: Ops",
	src: "/art/advisor-ops.png",
} as const;

/** Terminal loss evidence and the one-time frontier milestone handoff. */
export default function RunResult({
	disabled = false,
	milestoneDismissed = false,
	onContinueSandbox,
	onRestartRun,
	state,
}: RunResultProps) {
	const terminal = selectTerminalProjection(state);
	const objective = selectTerminalObjective(state);
	const milestone = state.reports.items.find(
		(report) =>
			report.fact.kind === "milestone_reached" &&
			report.fact.milestone === "first_multimodal_launch",
	);

	if (objective !== null) {
		return (
			<section
				aria-label="Run result"
				className="glass-pane bg-[var(--game-negative)]/10 p-3 ring-1 ring-[var(--game-negative)]/60"
			>
				<ResultArtBackdrop src="/art-v2/amber-fracture.png" />
				<div className="relative z-10 flex items-start gap-2">
					<img
						alt={OPS_ADVISOR.alt}
						className="size-10 shrink-0 rounded-full border border-cyan-300/60 object-cover shadow-[0_0_14px_rgba(34,211,238,0.2)] ring-1 ring-cyan-300/35"
						decoding="async"
						loading="lazy"
						src={OPS_ADVISOR.src}
					/>
					<Flag
						className="mt-0.5 size-4 shrink-0 text-[var(--game-negative)]"
						aria-hidden="true"
					/>
					<div>
						<p className="font-semibold text-[var(--game-negative)] text-xs">
							Sandbox ended
						</p>
						<h3 className="mt-1 font-semibold text-foreground text-sm">
							{objective.reason === "cash_depleted"
								? "Cash depleted"
								: "Trust collapsed"}
						</h3>
						<p className="mt-1 text-muted-foreground text-xs leading-5">
							{objective.guidance}
						</p>
					</div>
				</div>
				<div className="relative z-10 mt-3 border-border/70 border-t pt-3">
					<p className="font-semibold text-muted-foreground text-xs">
						Top contributing facts
					</p>
					<ol className="mt-2 space-y-2">
						{terminal.contributors.map((contributor, index) => (
							<li
								className="rounded-lg border border-[var(--game-hairline)] bg-background/25 px-2.5 py-2"
								key={`${contributor.kind}-${contributor.week}-${index}`}
							>
								<span className="min-w-0 break-words text-foreground text-xs">
									{index + 1}. {factLabel(contributor.kind)}
								</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									Impact {contributor.impact} · W{contributor.week}
								</span>
							</li>
						))}
					</ol>
				</div>
				{onRestartRun ? (
					<Button
						disabled={disabled}
						onClick={onRestartRun}
						className="relative z-10 mt-3"
						type="button"
					>
						<RotateCcw data-icon="inline-start" aria-hidden="true" />
						Restart
					</Button>
				) : null}
			</section>
		);
	}

	if (terminal.frontierReached && !milestoneDismissed) {
		return (
			<section
				aria-label="Frontier milestone"
				className="glass-pane bg-primary/10 p-3 ring-1 ring-primary/50"
			>
				<ResultArtBackdrop src="/art-v2/fog-monolith-alt.png" />
				<div className="relative z-10 flex items-start gap-2">
					<Trophy
						className="mt-0.5 size-4 shrink-0 text-primary"
						aria-hidden="true"
					/>
					<div>
						<p className="font-semibold text-primary text-xs">
							Frontier milestone
						</p>
						<h3 className="mt-1 font-semibold text-foreground text-sm">
							First multimodal launch
						</h3>
						<p className="mt-1 text-muted-foreground text-xs leading-5">
							{milestone
								? `Milestone recorded in week ${milestone.fact.week}. The frontier is reached; continue the sandbox to operate beyond the first launch.`
								: "The frontier is reached; continue the sandbox to operate beyond the first launch."}
						</p>
					</div>
				</div>
				{onContinueSandbox ? (
					<Button
						disabled={disabled}
						onClick={onContinueSandbox}
						className="relative z-10 mt-3"
						type="button"
						variant="outline"
					>
						Continue Sandbox
					</Button>
				) : null}
			</section>
		);
	}

	return null;
}

function ResultArtBackdrop({ src }: { src: string }) {
	return (
		<>
			<ArtFrame
				alt=""
				className="pointer-events-none absolute inset-0 h-full w-full rounded-none opacity-[0.15] ring-0"
				src={src}
				tint="bg-background/35"
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/90 via-background/75 to-background/55"
				aria-hidden="true"
			/>
		</>
	);
}

function factLabel(kind: string): string {
	return kind
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
