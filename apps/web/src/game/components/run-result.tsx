import {
	type GameState,
	selectTerminalObjective,
	selectTerminalProjection,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Flag, RotateCcw, Trophy } from "lucide-react";

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
				className="relative isolate overflow-hidden border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 p-3"
			>
				<ResultArtBackdrop />
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
						<p className="font-mono font-semibold text-[var(--game-negative)] text-xs uppercase tracking-[0.14em]">
							Sandbox ended
						</p>
						<h3 className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]">
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
					<p className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
						Top contributing facts
					</p>
					<ol className="mt-2 space-y-2">
						{terminal.contributors.map((contributor, index) => (
							<li
								className="flex items-start justify-between gap-3 border border-border/70 bg-background/35 px-2.5 py-2"
								key={`${contributor.kind}-${contributor.week}-${index}`}
							>
								<span className="min-w-0 break-words text-foreground text-xs">
									{index + 1}. {factLabel(contributor.kind)}
								</span>
								<span className="shrink-0 font-mono text-muted-foreground text-xs uppercase">
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
				className="relative isolate overflow-hidden border border-primary/50 bg-primary/10 p-3"
			>
				<ResultArtBackdrop />
				<div className="relative z-10 flex items-start gap-2">
					<Trophy
						className="mt-0.5 size-4 shrink-0 text-primary"
						aria-hidden="true"
					/>
					<div>
						<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.14em]">
							Frontier milestone
						</p>
						<h3 className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]">
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

function ResultArtBackdrop() {
	return (
		<>
			<img
				alt=""
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.15]"
				decoding="async"
				loading="lazy"
				src="/art/key-art-command-center.png"
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
