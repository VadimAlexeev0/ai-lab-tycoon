import {
	type GameState,
	selectPendingDecisions,
	selectTeams,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, FlaskConical, Play } from "lucide-react";

/** The least expensive legal-looking fresh/lean model configuration. */
export const MIN_MODEL_DESIGN_COST = 80;

export type PriorityAction =
	| {
			kind: "resolve_decision";
			decisionId: string;
	  }
	| {
			kind: "assign_project";
			teamId: string;
			teamName: string;
	  }
	| {
			kind: "design_model";
			minimumCost: number;
	  }
	| {
			kind: "advance_week";
			week: number;
	  };

export function getPriorityAction(state: GameState): PriorityAction {
	const blockingDecision = selectPendingDecisions(state).find(
		(decision) => decision.blocking,
	);
	if (blockingDecision !== undefined) {
		return {
			kind: "resolve_decision",
			decisionId: blockingDecision.id,
		};
	}

	const idleTeam = selectTeams(state).find((team) => team.status === "idle");
	if (idleTeam !== undefined) {
		return {
			kind: "assign_project",
			teamId: idleTeam.id,
			teamName: idleTeam.name,
		};
	}

	const activeModelWork = state.models.items.some(
		(model) => model.status === "designing" || model.status === "training",
	);
	if (!activeModelWork && state.company.cash >= MIN_MODEL_DESIGN_COST) {
		return {
			kind: "design_model",
			minimumCost: MIN_MODEL_DESIGN_COST,
		};
	}

	return {
		kind: "advance_week",
		week: state.meta.week,
	};
}

export default function PriorityStrip({
	disabled = false,
	onAdvance,
	onResolveDecision,
	state,
}: {
	disabled?: boolean;
	onAdvance: () => void;
	onResolveDecision: (decisionId: string) => void;
	state: GameState;
}) {
	const action = getPriorityAction(state);

	return (
		<section
			aria-label="Priority action"
			className="surface-card mt-3 flex min-w-0 items-center gap-2 bg-primary/5 px-2.5 py-2 ring-1 ring-primary/35"
		>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="shrink-0 font-semibold text-primary text-xs">
					Priority
				</span>
				<p className="min-w-0 truncate text-muted-foreground text-xs">
					{priorityMessage(action, state)}
				</p>
			</div>
			<PriorityControl
				action={action}
				disabled={disabled || state.terminal.status === "lost"}
				onAdvance={onAdvance}
				onResolveDecision={onResolveDecision}
			/>
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
		"inline-flex h-7 shrink-0 items-center gap-1 border border-primary bg-primary px-2 font-semibold text-primary-foreground text-xs transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

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
				<Link className={cn(className, "no-underline")} to="/game/teams">
					<ArrowRight className="size-3.5" aria-hidden="true" />
					Assign
				</Link>
			);
		case "design_model":
			return (
				<Link className={cn(className, "no-underline")} to="/game/models">
					<FlaskConical className="size-3.5" aria-hidden="true" />
					Design
				</Link>
			);
		case "advance_week":
			return (
				<Button
					className="h-7 px-2 font-semibold text-xs"
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

function priorityMessage(action: PriorityAction, state: GameState): string {
	switch (action.kind) {
		case "resolve_decision":
			return "A blocking decision is holding the week.";
		case "assign_project":
			return `${action.teamName} is idle and ready for work.`;
		case "design_model":
			return `No model work is active; minimum design cost is $${action.minimumCost}.`;
		case "advance_week":
			return `No higher-priority action detected for week ${state.meta.week}.`;
	}
}
