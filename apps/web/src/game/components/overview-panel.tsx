import {
	type GameState,
	selectNextObjective,
	selectVisibleState,
} from "@ai-lab-tycoon/engine";

export default function OverviewPanel({ state }: { state: GameState }) {
	const visible = selectVisibleState(state);
	const objective = selectNextObjective(state);
	return (
		<section aria-labelledby="overview-panel-heading" className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Command overview
					</p>
					<h2
						id="overview-panel-heading"
						className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
					>
						Run health and next objective
					</h2>
				</div>
				<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
					Week {state.meta.week} · Era {state.meta.era}
				</span>
			</div>
			<p className="max-w-2xl text-muted-foreground text-sm leading-6">
				{objective.kind === "assign_project"
					? `Assign work to ${objective.teamId} to keep the frontier moving.`
					: objective.kind === "resolve_decision"
						? `Resolve decision ${objective.decisionId} before the next week.`
						: objective.kind === "advance_week"
							? `Advance from week ${objective.week} when the lab is ready.`
							: objective.guidance}
			</p>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Metric label="Cash" value={`$${visible.resourceBar.cash}`} />
				<Metric label="Insight" value={`${visible.resourceBar.insight}`} />
				<Metric label="Trust" value={`${visible.resourceBar.trust}`} />
				<Metric label="Hype" value={`${visible.resourceBar.hype}`} />
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 border-border/70 border-t pt-3 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
				<span>Era {state.meta.era}</span>
				<span>Teams {visible.teams.length}</span>
				<span>Models {visible.models.length}</span>
				<span>Reports {visible.recentReports.length}</span>
			</div>
		</section>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="border border-border/70 bg-background/35 px-2.5 py-2">
			<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
				{label}
			</p>
			<p className="mt-1 font-mono font-semibold text-foreground text-sm">
				{value}
			</p>
		</div>
	);
}
