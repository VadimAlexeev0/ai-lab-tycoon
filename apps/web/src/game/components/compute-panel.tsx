import { type GameState, selectResourceBar } from "@ai-lab-tycoon/engine";
import { AlertTriangle, Cpu } from "lucide-react";

export type ComputePanelProps = {
	state: GameState;
};

type TrainingProject = Extract<
	GameState["projects"]["items"][number],
	{ kind: "training" }
>;

/** Make training-versus-serving contention explicit before it becomes a surprise. */
export default function ComputePanel({ state }: ComputePanelProps) {
	const resources = selectResourceBar(state);
	const { capacity, allocated, servingDemand, trainingDemand } =
		resources.compute;
	const trainingServingDemand = trainingDemand + servingDemand;
	const evaluationProjects = state.projects.items.filter(
		(project) => project.kind === "evaluation" && project.status === "active",
	);
	const evaluationDemand = evaluationProjects.length * 2;
	const totalDemand = trainingDemand + servingDemand + evaluationDemand;
	const shortage = totalDemand > capacity;
	const activeTraining = state.projects.items.filter(
		(project): project is TrainingProject =>
			project.kind === "training" && project.status === "active",
	);
	const operatingProducts = state.products.items.filter(
		(product) => product.status === "operating",
	);
	const modelNames = new Map(
		state.models.items.map((model) => [model.id, model.name]),
	);

	return (
		<section aria-label="Compute pressure" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Compute / pressure
					</p>
					<h3 className="mt-1 font-semibold text-foreground text-sm">
						Reserve capacity before scaling
					</h3>
				</div>
				<Cpu className="size-4 text-primary" aria-hidden="true" />
			</div>

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Metric label="Capacity" value={`${capacity}`} />
				<Metric label="Allocated" value={`${allocated}`} />
				<Metric label="Training" value={`${trainingDemand}`} />
				<Metric label="Serving" value={`${servingDemand}`} />
			</div>

			{servingDemand > 0 && servingDemand >= capacity ? (
				<p
					className="border-[var(--game-negative)]/40 border-y py-2 text-[var(--game-negative)] text-xs"
					role="status"
				>
					Serving demand {servingDemand} of {capacity} — growth paused
				</p>
			) : null}

			<div className="flex flex-col gap-2 border-border/70 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-muted-foreground text-xs">
					Training + serving demand: {trainingServingDemand}
				</p>
				<a
					className="inline-flex w-fit items-center border-primary/40 border-b pb-0.5 font-medium text-primary text-xs hover:border-primary hover:text-foreground"
					href="/game/compute"
				>
					Manage on Compute grid
				</a>
			</div>

			<div
				className={
					shortage
						? "border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 px-3 py-2"
						: "border border-[var(--game-positive)]/30 bg-[var(--game-positive)]/5 px-3 py-2"
				}
				role={shortage ? "alert" : undefined}
			>
				<div className="flex items-center gap-2">
					{shortage ? (
						<AlertTriangle
							className="size-3.5 text-[var(--game-negative)]"
							aria-hidden="true"
						/>
					) : null}
					<p className="font-semibold text-foreground text-xs">
						{shortage
							? "Shortage / active demand exceeds capacity"
							: "Capacity balanced"}
					</p>
				</div>
				<p className="mt-1 text-muted-foreground text-xs leading-5">
					{shortage
						? `Demand ${totalDemand} vs capacity ${capacity}. Training progress can stop while serving consumes its reservation.`
						: `Demand ${totalDemand} vs capacity ${capacity}. ${capacity - totalDemand} units remain unreserved.`}
				</p>
			</div>

			{shortage ? (
				<div className="space-y-1 border-border/70 border-t pt-2">
					<p className="text-muted-foreground text-xs">Affected work</p>
					<ul className="space-y-1 text-foreground text-xs leading-5">
						{activeTraining.map((project) => (
							<li key={project.id}>
								Training run {project.id} ·{" "}
								{modelNames.get(project.modelId) ?? project.modelId}
							</li>
						))}
						{operatingProducts.map((product) => (
							<li key={product.id}>
								Product {product.id} · {product.channel} serving
							</li>
						))}
					</ul>
					{activeTraining.length === 0 && operatingProducts.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							No named run or product is currently reserving demand.
						</p>
					) : null}
				</div>
			) : null}
		</section>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="glass-pane px-2.5 py-2">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 font-semibold text-foreground text-sm">{value}</p>
		</div>
	);
}
