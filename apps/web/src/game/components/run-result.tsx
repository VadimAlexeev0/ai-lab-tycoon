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
				className="border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 p-3"
			>
				<div className="flex items-start gap-2">
					<Flag
						className="mt-0.5 size-4 shrink-0 text-[var(--game-negative)]"
						aria-hidden="true"
					/>
					<div>
						<p className="font-mono font-semibold text-[10px] text-[var(--game-negative)] uppercase tracking-[0.14em]">
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
				<div className="mt-3 border-border/70 border-t pt-3">
					<p className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
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
								<span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
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
						className="mt-3"
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
				className="border border-primary/50 bg-primary/10 p-3"
			>
				<div className="flex items-start gap-2">
					<Trophy
						className="mt-0.5 size-4 shrink-0 text-primary"
						aria-hidden="true"
					/>
					<div>
						<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.14em]">
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
						className="mt-3"
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

function factLabel(kind: string): string {
	return kind
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
