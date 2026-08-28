import {
	advanceWeek,
	type GameState,
	selectNextObjective,
	selectPendingDecisions,
	selectVisibleState,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { type ActiveRunRecord, persistActiveRun } from "@/utils/orpc";

export type AdvanceWeekButtonProps = {
	className?: string;
	state: GameState;
	revision?: number;
	onAdvanced: (result: {
		state: GameState;
		record: ActiveRunRecord;
	}) => void | Promise<void>;
};

export default function AdvanceWeekButton({
	className,
	state,
	revision,
	onAdvanced,
}: AdvanceWeekButtonProps) {
	const [isAdvancing, setIsAdvancing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const visibleState = useMemo(() => selectVisibleState(state), [state]);
	const pendingDecisions = useMemo(
		() => selectPendingDecisions(state),
		[state],
	);
	const blockingDecision = pendingDecisions.find(
		(decision) => decision.blocking,
	);
	const nextObjective = useMemo(() => selectNextObjective(state), [state]);
	const isTerminal = visibleState.terminal.status === "lost";
	const isBlocked = blockingDecision !== undefined;
	const isDisabled = isAdvancing || isBlocked || isTerminal;

	async function handleAdvance() {
		if (isBlocked) {
			if (blockingDecision !== undefined) {
				focusDecisionCard(blockingDecision.id);
			}
			return;
		}
		if (isTerminal) return;

		setError(null);
		setIsAdvancing(true);
		try {
			const result = advanceWeek(state);
			const record = await persistActiveRun(result.state, revision);
			await onAdvanced({ state: result.state, record });
		} catch (cause: unknown) {
			setError(
				cause instanceof Error && cause.message.length > 0
					? cause.message
					: "The week could not be advanced.",
			);
		} finally {
			setIsAdvancing(false);
		}
	}

	const objectiveMessage =
		nextObjective.kind === "resolve_decision"
			? "Resolve the required decision before advancing."
			: isTerminal
				? "This run has ended. Start a new run to continue."
				: `Advance from week ${state.meta.week} to week ${state.meta.week + 1}.`;

	return (
		<section
			aria-labelledby="time-controls-heading"
			className={cn(
				"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			<h2 id="time-controls-heading" className="sr-only">
				Time controls
			</h2>
			<div className="min-w-0">
				<p className="font-semibold text-primary text-xs">Time control</p>
				<p
					className="mt-1 flex items-center gap-2 text-muted-foreground text-sm"
					id="advance-week-help"
				>
					{isBlocked ? (
						<AlertTriangle
							className="size-3.5 shrink-0 text-[var(--game-amber)]"
							aria-hidden="true"
						/>
					) : null}
					<span>{objectiveMessage}</span>
				</p>
				{error ? (
					<p role="alert" className="mt-1 text-[var(--game-negative)] text-xs">
						{error}
					</p>
				) : null}
			</div>

			<Button
				aria-describedby="advance-week-help"
				disabled={isDisabled}
				onClick={handleAdvance}
				type="button"
			>
				{isAdvancing ? (
					<Loader2
						data-icon="inline-start"
						className="animate-spin"
						aria-hidden="true"
					/>
				) : (
					<ArrowRight data-icon="inline-start" aria-hidden="true" />
				)}
				{isAdvancing ? "Advancing…" : "Advance week"}
			</Button>
		</section>
	);
}

function focusDecisionCard(decisionId: string): void {
	const target = document.getElementById(`decision-card-${decisionId}`);
	if (target === null) return;
	target.focus({ preventScroll: false });
	target.scrollIntoView({ behavior: "smooth", block: "center" });
}
