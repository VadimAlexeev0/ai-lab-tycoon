import { type GameState, selectNextObjective } from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, FlaskConical, Play } from "lucide-react";

import {
	getPriorityAction,
	type PriorityAction,
	priorityMessage,
} from "@/game/components/priority-strip";

export type OverviewHeroProps = {
	disabled: boolean;
	onAdvance: () => void;
	onResolveDecision: (decisionId: string) => void;
	state: GameState;
};

/** Project the deterministic next action into the dashboard's primary control. */
export default function OverviewHero({
	disabled,
	onAdvance,
	onResolveDecision,
	state,
}: OverviewHeroProps) {
	const action = getPriorityAction(state);
	const objective = selectNextObjective(state);
	const message =
		objective.kind === "restart"
			? objective.guidance
			: priorityMessage(action, state);

	return (
		<section
			aria-labelledby="overview-hero-heading"
			className="glass-pane glass-edge glow-accent p-4 sm:p-5"
		>
			<div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0 flex-1">
					<p className="meta-label text-primary">Next action</p>
					<h2
						id="overview-hero-heading"
						className="mt-2 font-semibold text-foreground text-sm"
					>
						Keep the lab moving
					</h2>
					<p className="mt-3 max-w-2xl font-display font-medium text-foreground text-lg leading-7 sm:text-xl">
						{message}
					</p>
					<p className="mt-3 text-muted-foreground text-xs">
						Week {state.meta.week} · Era {state.meta.era} · Week{" "}
						{getWeekInQuarter(state.meta.week)} of quarter{" "}
						{getQuarterForWeek(state.meta.week)}
					</p>
				</div>
				<PriorityControl
					action={action}
					disabled={disabled || state.terminal.status === "lost"}
					onAdvance={onAdvance}
					onResolveDecision={onResolveDecision}
				/>
			</div>
		</section>
	);
}

function PriorityControl({
	action,
	disabled,
	onAdvance,
	onResolveDecision,
}: {
	action: PriorityAction;
	disabled: boolean;
	onAdvance: () => void;
	onResolveDecision: (decisionId: string) => void;
}) {
	const className =
		"inline-flex min-h-11 shrink-0 items-center justify-center gap-1 border border-primary bg-primary px-3 font-semibold text-primary-foreground text-xs transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

	switch (action.kind) {
		case "resolve_decision":
			return (
				<button
					className={className}
					disabled={disabled}
					onClick={() => onResolveDecision(action.decisionId)}
					type="button"
				>
					<CircleAlert className="size-3.5" aria-hidden="true" />
					Resolve
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</button>
			);
		case "assign_project":
			return (
				<Link
					aria-disabled={disabled || undefined}
					className={cn(
						className,
						"no-underline",
						disabled && "pointer-events-none opacity-50",
					)}
					onClick={(event) => {
						if (disabled) event.preventDefault();
					}}
					to="/game/teams"
				>
					<ArrowRight className="size-3.5" aria-hidden="true" />
					Assign
				</Link>
			);
		case "design_model":
			return (
				<Link
					aria-disabled={disabled || undefined}
					className={cn(
						className,
						"no-underline",
						disabled && "pointer-events-none opacity-50",
					)}
					onClick={(event) => {
						if (disabled) event.preventDefault();
					}}
					to="/game/models"
				>
					<FlaskConical className="size-3.5" aria-hidden="true" />
					Design
				</Link>
			);
		case "advance_week":
			return (
				<Button
					className="min-h-11 px-3 font-semibold text-xs"
					disabled={disabled}
					onClick={onAdvance}
					size="sm"
					type="button"
				>
					<Play data-icon="inline-start" aria-hidden="true" />
					Advance
				</Button>
			);
	}
}

export function getQuarterForWeek(week: number): number {
	return Math.max(1, Math.ceil(Math.max(1, week) / 13));
}

export function getWeekInQuarter(week: number): number {
	const normalizedWeek = Math.max(1, Math.trunc(week));
	return ((normalizedWeek - 1) % 13) + 1;
}
