import { type GameState, selectResourceBar } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Cpu, Server } from "lucide-react";

export type ComputeGridSignals = {
	allocated: number;
	capacity: number;
	evaluationDemand: number;
	servingDemand: number;
	shortage: boolean;
	totalDemand: number;
	trainingDemand: number;
};

export type ComputeSlotState = "allocated" | "available";

export function getComputeGridSignals(state: GameState): ComputeGridSignals {
	const resources = selectResourceBar(state);
	const evaluationDemand =
		state.projects.items.filter(
			(project) => project.kind === "evaluation" && project.status === "active",
		).length * 2;
	const { allocated, capacity, servingDemand, trainingDemand } =
		resources.compute;
	const totalDemand = trainingDemand + servingDemand + evaluationDemand;

	return {
		allocated,
		capacity,
		evaluationDemand,
		servingDemand,
		shortage:
			totalDemand > capacity ||
			state.warnings.some((warning) => warning.code === "compute_shortage"),
		totalDemand,
		trainingDemand,
	};
}

export function getComputeSlotStates(
	signals: Pick<ComputeGridSignals, "allocated" | "capacity">,
): ComputeSlotState[] {
	const capacity = Math.max(0, signals.capacity);
	const allocated = Math.min(capacity, Math.max(0, signals.allocated));
	return Array.from({ length: capacity }, (_, index) =>
		index < allocated ? "allocated" : "available",
	);
}

export default function ComputeGrid({ state }: { state: GameState }) {
	const signals = getComputeGridSignals(state);
	const slots = getComputeSlotStates(signals);
	const trainingSlotStart = Math.max(
		0,
		signals.allocated - signals.trainingDemand,
	);

	return (
		<section aria-labelledby="compute-grid-heading" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Compute / allocation grid
					</p>
					<h3
						id="compute-grid-heading"
						className="mt-1 font-semibold text-foreground text-sm"
					>
						Live server slots
					</h3>
				</div>
				<Cpu className="size-4 text-primary" aria-hidden="true" />
			</div>

			<div className="glass-pane p-3">
				<div className="flex items-center justify-between gap-3 text-xs">
					<span className="inline-flex items-center gap-1.5 text-muted-foreground">
						<Server className="size-3.5 text-primary" aria-hidden="true" />
						Allocation
					</span>
					<strong className="text-foreground">
						{signals.allocated} / {signals.capacity} slots
					</strong>
				</div>
				<div
					aria-label={`Compute allocation: ${signals.allocated} of ${signals.capacity} slots allocated`}
					aria-valuemax={signals.capacity}
					aria-valuemin={0}
					aria-valuenow={signals.allocated}
					className="mt-3 grid gap-1"
					data-shortage={signals.shortage ? "true" : "false"}
					data-training-demand={signals.trainingDemand}
					role="progressbar"
					style={{
						gridTemplateColumns: "repeat(auto-fill, minmax(1rem, 1fr))",
					}}
				>
					{slots.map((slot, index) => {
						const trainingReserved =
							slot === "allocated" && index >= trainingSlotStart;
						return (
							<span
								aria-hidden="true"
								className={cn(
									"compute-slot relative aspect-square min-h-3 border transition-[transform,opacity] duration-300",
									slot === "allocated"
										? trainingReserved
											? "border-primary bg-primary"
											: "border-primary/70 bg-primary/55"
										: "border-border/70 bg-muted/40",
									signals.shortage
										? "compute-slot-shortage border-[var(--game-amber)] bg-[var(--game-amber)]/45"
										: undefined,
								)}
								data-slot-state={slot}
								data-training-reserved={trainingReserved ? "true" : "false"}
								key={index}
								style={{
									opacity: slot === "allocated" ? 1 : 0.5,
									transform: slot === "allocated" ? "scale(1)" : "scale(0.72)",
									transitionDelay: `${Math.min(index, 24) * 18}ms`,
								}}
							/>
						);
					})}
				</div>
				<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<span>Training {signals.trainingDemand}</span>
					<span>Serving {signals.servingDemand}</span>
					<span>Evaluation {signals.evaluationDemand}</span>
				</div>
				<p
					className={cn(
						"mt-2 text-xs leading-5",
						signals.shortage
							? "text-[var(--game-amber)]"
							: "text-muted-foreground",
					)}
				>
					{signals.shortage
						? `Demand ${signals.totalDemand} exceeds capacity ${signals.capacity}; slots are unstable.`
						: `${signals.capacity - signals.totalDemand} units remain available after current demand.`}
				</p>
			</div>
		</section>
	);
}
