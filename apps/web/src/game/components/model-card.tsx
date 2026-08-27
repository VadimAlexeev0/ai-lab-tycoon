import {
	type GameState,
	type Model,
	selectVisibleModels,
	type VisibleEstimateBand,
	type VisibleModelEstimate,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Activity, BadgeCheck, FlaskConical } from "lucide-react";

const SCORE_DIMENSIONS = [
	"capability",
	"coding",
	"reliability",
	"safety",
	"efficiency",
	"multimodal",
] as const;
type EvaluationKind = "capability" | "safety_reliability";

export type ModelCardProps = {
	state: GameState;
	disabled?: boolean;
	onEvaluate: (modelId: string, evaluation: EvaluationKind) => void;
};

/** Render only public model estimates; hidden true scores never enter the card. */
export default function ModelCard({
	disabled = false,
	onEvaluate,
	state,
}: ModelCardProps) {
	const visibleModels = selectVisibleModels(state);
	if (visibleModels.length === 0) {
		return (
			<section className="border border-border/70 bg-background/35 px-3 py-4">
				<div className="flex items-center gap-2">
					<FlaskConical className="size-4 text-primary" aria-hidden="true" />
					<h3 className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
						No model designs yet
					</h3>
				</div>
				<p className="mt-2 text-muted-foreground text-xs leading-5">
					Complete the required research and use the designer below to start a
					training run.
				</p>
			</section>
		);
	}

	return (
		<section aria-label="Model cards" className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
					Public model register
				</h3>
				<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
					Estimates only
				</span>
			</div>
			<div className="grid gap-3 xl:grid-cols-2">
				{visibleModels.map((visibleModel) => {
					const source = state.models.items.find(
						(model) => model.id === visibleModel.id,
					);
					if (source === undefined) return null;
					return (
						<ModelRegisterCard
							disabled={disabled}
							key={visibleModel.id}
							model={source}
							onEvaluate={onEvaluate}
							visible={visibleModel}
						/>
					);
				})}
			</div>
		</section>
	);
}

function ModelRegisterCard({
	disabled,
	model,
	onEvaluate,
	visible,
}: {
	disabled: boolean;
	model: Model;
	onEvaluate: (modelId: string, evaluation: EvaluationKind) => void;
	visible: VisibleModelEstimate;
}) {
	const evaluations =
		model.estimates === undefined
			? []
			: (Object.keys({
					capability: true,
					safety_reliability: true,
				}) as EvaluationKind[]);
	const activeEvaluation = model.projectId;
	const project = model.projectId;
	return (
		<article className="border border-border bg-background/35 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						{model.status === "ready" || model.status === "launched" ? (
							<BadgeCheck
								className="size-3.5 text-[var(--game-positive)]"
								aria-hidden="true"
							/>
						) : (
							<Activity
								className="size-3.5 text-[var(--game-amber)]"
								aria-hidden="true"
							/>
						)}
						<h4 className="truncate font-medium text-foreground text-sm">
							{visible.name}
						</h4>
					</div>
					<p className="mt-1 font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
						{model.id} · {model.family ?? "unclassified"} ·{" "}
						{model.tier ?? "n/a"}
					</p>
				</div>
				<StatusLabel status={model.status} />
			</div>

			{project ? (
				<p className="mt-3 border border-primary/25 bg-primary/5 px-2 py-1.5 font-mono text-primary text-xs uppercase tracking-[0.1em]">
					Project active · {project}
				</p>
			) : null}

			{visible.estimates ? (
				<div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
					{SCORE_DIMENSIONS.map((dimension) => {
						const band = visible.estimates?.[dimension];
						if (band === undefined) return null;
						return (
							<div
								className="border border-border/70 px-2 py-1.5"
								key={dimension}
							>
								<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">
									{dimension}
								</p>
								<p className="mt-1 font-mono font-semibold text-foreground text-xs">
									{estimateLabel(band)}
								</p>
							</div>
						);
					})}
				</div>
			) : (
				<p className="mt-3 text-muted-foreground text-xs leading-5">
					Training is in progress. Scores become visible only when the project
					completes.
				</p>
			)}

			{model.status === "ready" || model.status === "launched" ? (
				<div className="mt-3 space-y-2 border-border/70 border-t pt-3">
					<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
						Narrow the uncertainty band
					</p>
					<div className="flex flex-wrap gap-2">
						{evaluations.map((evaluation) => (
							<Button
								disabled={disabled || activeEvaluation !== null}
								key={evaluation}
								onClick={() => onEvaluate(model.id, evaluation)}
								size="sm"
								type="button"
								variant="outline"
							>
								{evaluation === "capability"
									? "Evaluate capability"
									: "Evaluate safety / reliability"}
							</Button>
						))}
					</div>
					{activeEvaluation ? (
						<p className="text-[var(--game-amber)] text-xs leading-4">
							An evaluation project is using the team's slot. Its completion
							will narrow the displayed bands.
						</p>
					) : null}
				</div>
			) : null}
		</article>
	);
}

function estimateLabel(band: VisibleEstimateBand): string {
	const uncertainty = Math.max(
		band.estimate - band.lower,
		band.upper - band.estimate,
	);
	return `${band.estimate} ± ${uncertainty}`;
}

function StatusLabel({ status }: { status: Model["status"] }) {
	const label =
		status === "designing"
			? "Designing"
			: status[0]?.toUpperCase() + status.slice(1);
	return (
		<span className="shrink-0 border border-border/70 px-2 py-1 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.1em]">
			{label}
		</span>
	);
}
