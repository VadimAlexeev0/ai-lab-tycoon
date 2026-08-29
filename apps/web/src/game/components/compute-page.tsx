import {
	buyCompute,
	type GameState,
	selectResourceBar,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { AlertTriangle, Check, Cpu, Server } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { useRunState } from "@/game/game-state-context";
import { type ThreeSceneContext, useThreeScene } from "./three-scene";

export const COMPUTE_PURCHASE_COST = 300;
export const COMPUTE_PURCHASE_UNITS = 12;
const EVALUATION_COMPUTE_PER_PROJECT = 2;
const YARD_MATERIALIZE_DURATION_MS = 900;

export type ComputeReservationKind =
	| "serving"
	| "training"
	| "evaluation"
	| "free";

export type ComputePageSignals = {
	allocated: number;
	capacity: number;
	evaluationDemand: number;
	headroom: number;
	servingDemand: number;
	servingStarved: boolean;
	shortage: boolean;
	totalDemand: number;
	trainingDemand: number;
	trainingStarvedWeeks: number;
};

export function getComputePageSignals(state: GameState): ComputePageSignals {
	const resources = selectResourceBar(state);
	const capacity = Math.max(0, resources.compute.capacity);
	const allocated = Math.min(
		capacity,
		Math.max(0, resources.compute.allocated),
	);
	const evaluationDemand =
		state.projects.items.filter(
			(project) => project.kind === "evaluation" && project.status === "active",
		).length * EVALUATION_COMPUTE_PER_PROJECT;
	const totalDemand =
		resources.compute.trainingDemand +
		resources.compute.servingDemand +
		evaluationDemand;
	const trainingStarvedWeeks = new Set(
		state.reports.items.flatMap((report) =>
			report.fact.kind === "training_starved" ? [report.fact.week] : [],
		),
	).size;
	const hasShortageWarning = state.warnings.some(
		(warning) => warning.code === "compute_shortage",
	);
	const hasServingThrottle = state.reports.items.some(
		(report) => report.fact.kind === "serving_throttled",
	);
	const saturated =
		resources.compute.servingDemand > 0 &&
		resources.compute.servingDemand >= capacity;

	return {
		allocated,
		capacity,
		evaluationDemand,
		headroom: Math.max(0, capacity - allocated),
		servingDemand: resources.compute.servingDemand,
		servingStarved: saturated || hasShortageWarning || hasServingThrottle,
		shortage: totalDemand > capacity || hasShortageWarning,
		totalDemand,
		trainingDemand: resources.compute.trainingDemand,
		trainingStarvedWeeks,
	};
}

/** Map the current reservation pressure onto capacity-sized yard units. */
export function getComputeReservationBlocks(
	signals: Pick<
		ComputePageSignals,
		| "allocated"
		| "capacity"
		| "evaluationDemand"
		| "servingDemand"
		| "trainingDemand"
	>,
): ComputeReservationKind[] {
	const capacity = Math.max(0, signals.capacity);
	let remaining = Math.min(capacity, Math.max(0, signals.allocated));
	const blocks: ComputeReservationKind[] = [];

	for (const [kind, demand] of [
		["serving", signals.servingDemand],
		["training", signals.trainingDemand],
		["evaluation", signals.evaluationDemand],
	] as const) {
		const reserved = Math.min(remaining, Math.max(0, demand));
		for (let index = 0; index < reserved; index += 1) {
			blocks.push(kind);
		}
		remaining -= reserved;
	}

	while (blocks.length < capacity) {
		blocks.push("free");
	}
	return blocks;
}

export function supportsComputeYard(): boolean {
	if (typeof window === "undefined" || prefersReducedMotion()) return false;
	try {
		const canvas = document.createElement("canvas");
		return canvas.getContext("webgl2") !== null;
	} catch {
		return false;
	}
}

export default function ComputePage({ state }: { state: GameState }) {
	const { actionBusy, executeEngineCommand } = useRunState();
	const signals = getComputePageSignals(state);
	const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
	const [webglAvailable] = useState(supportsComputeYard);
	const [sceneUnavailable, setSceneUnavailable] = useState(false);
	const previousCapacityRef = useRef(signals.capacity);
	const materializingFrom =
		signals.capacity > previousCapacityRef.current
			? previousCapacityRef.current
			: signals.capacity;

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = () => {
			setReducedMotion(mediaQuery.matches);
			setSceneUnavailable(false);
		};
		mediaQuery.addEventListener("change", onChange);
		return () => mediaQuery.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		previousCapacityRef.current = signals.capacity;
	}, [signals.capacity]);

	const handleSceneUnavailable = useCallback(() => {
		setSceneUnavailable(true);
	}, []);
	const purchaseDisabled =
		actionBusy || state.company.cash < COMPUTE_PURCHASE_COST;
	const purchaseTitle = actionBusy
		? "Another command is in progress."
		: state.company.cash < COMPUTE_PURCHASE_COST
			? `Purchase compute requires $${COMPUTE_PURCHASE_COST}; current cash is $${state.company.cash}.`
			: `Purchase ${COMPUTE_PURCHASE_UNITS} compute units for $${COMPUTE_PURCHASE_COST}.`;
	const showFallback = reducedMotion || !webglAvailable || sceneUnavailable;
	const fallbackReason = reducedMotion
		? "Reduced motion is enabled, so the compute yard is shown as a calm semantic grid."
		: !webglAvailable || sceneUnavailable
			? "WebGL2 is unavailable, so the compute yard is shown as a semantic grid."
			: undefined;

	return (
		<div className="space-y-6">
			<CapacityHero signals={signals} />

			<section
				aria-labelledby="compute-yard-heading"
				className="glass-pane glass-edge overflow-hidden"
			>
				<div className="space-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<p className="font-semibold text-primary text-xs">
								Compute / yard visualization
							</p>
							<h2
								className="mt-1 font-display font-semibold text-foreground text-xl"
								id="compute-yard-heading"
							>
								Capacity yard
							</h2>
						</div>
						<span className="text-muted-foreground text-xs">
							{signals.allocated} allocated · {signals.headroom} free
						</span>
					</div>
					<p className="max-w-3xl text-muted-foreground text-xs leading-5">
						Every block is one capacity unit. Reservation colors make the
						trade-off between live serving, training, evaluation, and available
						headroom visible at a glance.
					</p>
				</div>

				{showFallback ? (
					<ComputeYardFallback reason={fallbackReason} signals={signals} />
				) : (
					<ComputeYardScene
						key={`compute-yard-${signals.capacity}`}
						materializingFrom={materializingFrom}
						onUnavailable={handleSceneUnavailable}
						signals={signals}
					/>
				)}

				<div className="px-4 pb-4 sm:px-5 sm:pb-5">
					<ComputeYardLegend />
					<p className="sr-only">{computeYardSummary(signals)}</p>
				</div>
			</section>

			<ComputeActions
				actionBusy={actionBusy}
				onPurchase={() => {
					void executeEngineCommand(buyCompute);
				}}
				purchaseDisabled={purchaseDisabled}
				purchaseTitle={purchaseTitle}
				state={state}
			/>

			<PressureReadout signals={signals} />
		</div>
	);
}

function CapacityHero({ signals }: { signals: ComputePageSignals }) {
	const demandSegments = [
		{ kind: "training", label: "Training", value: signals.trainingDemand },
		{ kind: "serving", label: "Serving", value: signals.servingDemand },
		{
			kind: "evaluation",
			label: "Evaluation",
			value: signals.evaluationDemand,
		},
	] as const;
	const demandScale = Math.max(1, signals.totalDemand);

	return (
		<section
			aria-labelledby="compute-capacity-heading"
			className="glass-pane glass-edge space-y-5 p-4 sm:p-5"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Compute / capacity telemetry
					</p>
					<h2
						className="mt-1 font-display font-semibold text-foreground text-xl"
						id="compute-capacity-heading"
					>
						Capacity at a glance
					</h2>
				</div>
				<span
					className={cn(
						"inline-flex items-center gap-1.5 border px-2.5 py-1 font-semibold text-xs uppercase tracking-[0.12em]",
						signals.servingDemand > 0 &&
							signals.servingDemand >= signals.capacity
							? "border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 text-[var(--game-negative)]"
							: "border-[var(--game-positive)]/40 bg-[var(--game-positive)]/10 text-[var(--game-positive)]",
					)}
					role="status"
				>
					{signals.servingDemand > 0 &&
					signals.servingDemand >= signals.capacity ? (
						<AlertTriangle aria-hidden="true" className="size-3.5" />
					) : (
						<Check aria-hidden="true" className="size-3.5" />
					)}
					{signals.servingDemand > 0 &&
					signals.servingDemand >= signals.capacity
						? "Growth paused"
						: "Within headroom"}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<CapacityMetric label="Capacity" value={`${signals.capacity}`} />
				<CapacityMetric label="Allocated" value={`${signals.allocated}`} />
				<CapacityMetric
					label="Headroom"
					value={`${signals.headroom}`}
					suffix="units"
				/>
				<CapacityMetric
					label="Weekly demand"
					value={`${signals.totalDemand}`}
					suffix="units"
				/>
			</div>

			<div className="space-y-2">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<p className="font-semibold text-foreground text-xs">
						Weekly demand split
					</p>
					<p className="text-muted-foreground text-xs">
						{signals.totalDemand} requested / {signals.capacity} capacity
					</p>
				</div>
				<div
					aria-label={`Weekly demand split: training ${signals.trainingDemand}, serving ${signals.servingDemand}, evaluation ${signals.evaluationDemand}`}
					className="compute-demand-bar"
					role="img"
				>
					{demandSegments.map((segment) => (
						<span
							className={`compute-demand-bar__segment compute-demand-bar__segment--${segment.kind}`}
							key={segment.kind}
							style={{ width: `${(segment.value / demandScale) * 100}%` }}
							title={`${segment.label}: ${segment.value}`}
						/>
					))}
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-xs">
					{demandSegments.map((segment) => (
						<span
							className="inline-flex items-center gap-1.5"
							key={segment.kind}
						>
							<span
								aria-hidden="true"
								className={`compute-demand-bar__legend-swatch compute-demand-bar__legend-swatch--${segment.kind}`}
							/>
							{segment.label} {segment.value}
						</span>
					))}
				</div>
			</div>
		</section>
	);
}

function CapacityMetric({
	label,
	suffix,
	value,
}: {
	label: string;
	suffix?: string;
	value: string;
}) {
	return (
		<div className="glass-pane min-h-20 px-3 py-2.5">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 flex items-baseline gap-1.5 font-display font-semibold text-2xl text-foreground">
				{value}
				{suffix ? (
					<span className="font-normal font-sans text-muted-foreground text-xs">
						{suffix}
					</span>
				) : null}
			</p>
		</div>
	);
}

type ComputeYardSceneProps = {
	materializingFrom: number;
	onUnavailable: () => void;
	signals: ComputePageSignals;
};

function ComputeYardScene({
	materializingFrom,
	onUnavailable,
	signals,
}: ComputeYardSceneProps) {
	const objectsRef = useRef<ComputeYardObjects | null>(null);
	const signalsRef = useRef(signals);
	const materializingFromRef = useRef(materializingFrom);
	signalsRef.current = signals;
	materializingFromRef.current = materializingFrom;

	const { canvasRef, hostRef, unavailable } = useThreeScene({
		drawFrame: (context, now, deltaSeconds) => {
			const objects = objectsRef.current;
			if (objects === null) return;
			drawComputeYardFrame(
				context,
				objects,
				signalsRef.current,
				materializingFromRef.current,
				now,
				deltaSeconds,
			);
		},
		setup: (context) => {
			const objects = createComputeYardObjects(
				context,
				signalsRef.current,
				materializingFromRef.current,
			);
			objectsRef.current = objects;
			return () => {
				disposeComputeYardObjects(objects);
				objectsRef.current = null;
			};
		},
	});

	useEffect(() => {
		if (unavailable) onUnavailable();
	}, [onUnavailable, unavailable]);

	return (
		<div className="compute-yard-scene" ref={hostRef}>
			<canvas
				aria-hidden="true"
				className="compute-yard-scene__canvas"
				ref={canvasRef}
				tabIndex={-1}
			/>
			<div aria-hidden="true" className="compute-yard-scene__overlay">
				<span className="font-semibold text-primary text-xs uppercase tracking-[0.16em]">
					Live yard
				</span>
				<span className="text-muted-foreground text-xs">
					{signals.capacity} blocks · {signals.totalDemand} demand
				</span>
			</div>
			<p className="compute-yard-scene__caption" aria-hidden="true">
				Reservation map · static labels remain available below
			</p>
		</div>
	);
}

type ComputeYardFallbackProps = {
	reason: string | undefined;
	signals: ComputePageSignals;
};

function ComputeYardFallback({ reason, signals }: ComputeYardFallbackProps) {
	const blocks = getComputeReservationBlocks(signals);
	return (
		<div className="compute-yard-fallback" data-compute-fallback="true">
			{reason ? (
				<p className="compute-yard-fallback__notice" role="status">
					{reason}
				</p>
			) : null}
			<ul
				aria-label="Compute yard fallback"
				className="compute-yard-fallback__units"
			>
				{blocks.map((kind, index) => (
					<li
						aria-label={`Compute unit ${index + 1}: ${reservationLabel(kind)}`}
						className={cn(
							"compute-yard__block",
							`compute-yard__block--${kind}`,
						)}
						data-reservation={kind}
						key={`${kind}-${index}`}
					>
						<span aria-hidden="true" className="compute-yard__unit-label">
							{index + 1}
						</span>
					</li>
				))}
			</ul>
			{blocks.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					No capacity units online.
				</p>
			) : null}
		</div>
	);
}

function ComputeYardLegend() {
	const items = [
		{ kind: "serving", label: "Serving" },
		{ kind: "training", label: "Training" },
		{ kind: "evaluation", label: "Evaluation" },
		{ kind: "free", label: "Free" },
	] as const;
	return (
		<fieldset aria-label="Compute yard legend" className="compute-yard-legend">
			{items.map((item) => (
				<span className="compute-yard-legend__item" key={item.kind}>
					<span
						aria-hidden="true"
						className={`compute-yard-legend__swatch compute-yard-legend__swatch--${item.kind}`}
					/>
					{item.label}
				</span>
			))}
		</fieldset>
	);
}

function ComputeActions({
	actionBusy,
	onPurchase,
	purchaseDisabled,
	purchaseTitle,
	state,
}: {
	actionBusy: boolean;
	onPurchase: () => void;
	purchaseDisabled: boolean;
	purchaseTitle: string;
	state: GameState;
}) {
	const projects = state.projects.items.filter(
		(
			project,
		): project is Extract<
			GameState["projects"]["items"][number],
			{ kind: "infrastructure" }
		> =>
			project.kind === "infrastructure" &&
			project.target === "compute" &&
			project.status === "active",
	);

	return (
		<section aria-labelledby="compute-actions-heading" className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Compute / procurement
					</p>
					<h2
						className="mt-1 font-display font-semibold text-foreground text-xl"
						id="compute-actions-heading"
					>
						Provision the yard
					</h2>
				</div>
				<Server className="size-5 text-primary" aria-hidden="true" />
			</div>

			<div className="glass-pane flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<p className="font-semibold text-foreground text-sm">
						Purchase compute
					</p>
					<p className="mt-1 max-w-xl text-muted-foreground text-xs leading-5">
						Buy {COMPUTE_PURCHASE_UNITS} permanent units for $
						{COMPUTE_PURCHASE_COST}. Capacity purchases land immediately; active
						infrastructure projects add capacity when their teams finish.
					</p>
				</div>
				<Button
					aria-label={`Purchase compute for $${COMPUTE_PURCHASE_COST}`}
					disabled={purchaseDisabled || actionBusy}
					onClick={onPurchase}
					size="sm"
					title={purchaseTitle}
					type="button"
					variant="outline"
				>
					<Cpu aria-hidden="true" data-icon="inline-start" />
					Purchase compute
				</Button>
			</div>

			<div className="space-y-3 border-border/70 border-t pt-3">
				<div className="flex items-center justify-between gap-3">
					<p className="font-semibold text-foreground text-sm">
						Active infrastructure
					</p>
					<span className="text-muted-foreground text-xs">
						{projects.length} compute project{projects.length === 1 ? "" : "s"}
					</span>
				</div>
				{projects.length > 0 ? (
					<ul className="space-y-2">
						{projects.map((project) => {
							const progress = Math.min(
								100,
								Math.max(
									0,
									Math.round((project.progress / project.duration) * 100),
								),
							);
							return (
								<li
									className="border border-border/70 bg-background/30 px-3 py-2.5"
									key={project.id}
								>
									<div className="flex items-center justify-between gap-3 text-xs">
										<span className="truncate font-medium text-foreground">
											{project.id}
										</span>
										<span className="numeric-value text-muted-foreground">
											{progress}%
										</span>
									</div>
									<div
										aria-label={`${project.id} infrastructure progress ${progress}%`}
										aria-valuemax={100}
										aria-valuemin={0}
										aria-valuenow={progress}
										className="mt-2 h-1.5 overflow-hidden bg-muted"
										role="progressbar"
									>
										<div
											className="h-full bg-primary transition-[width]"
											style={{ width: `${progress}%` }}
										/>
									</div>
									<p className="mt-1.5 text-muted-foreground text-xs">
										{project.progress} / {project.duration} weeks · compute
										capacity
									</p>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-muted-foreground text-xs leading-5">
						No active infrastructure project is expanding the yard. Assign an
						available infrastructure project from Teams when one appears.
					</p>
				)}
			</div>
		</section>
	);
}

function PressureReadout({ signals }: { signals: ComputePageSignals }) {
	const servingMessage = signals.servingStarved
		? signals.servingDemand >= signals.capacity
			? `Serving demand ${signals.servingDemand} of ${signals.capacity} — growth is paused.`
			: "Recent serving throttling or compute pressure is recorded in the report stream."
		: `Serving has ${Math.max(0, signals.capacity - signals.servingDemand)} units of direct headroom.`;
	const guidance =
		signals.servingDemand > 0 && signals.servingDemand >= signals.capacity
			? "Add capacity or pause growth"
			: signals.shortage
				? "Protect serving reservations before starting another compute-heavy run."
				: "Capacity is balanced — keep one purchase in reserve before scaling.";

	return (
		<section aria-labelledby="compute-pressure-heading" className="space-y-3">
			<div>
				<p className="font-semibold text-primary text-xs">Compute / pressure</p>
				<h2
					className="mt-1 font-display font-semibold text-foreground text-xl"
					id="compute-pressure-heading"
				>
					Pressure readout
				</h2>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				<div
					className={cn(
						"glass-pane p-4",
						signals.servingStarved
							? "border-[var(--game-negative)]/50 bg-[var(--game-negative)]/5"
							: undefined,
					)}
					role={signals.servingStarved ? "alert" : undefined}
				>
					<p className="text-muted-foreground text-xs">Serving starvation</p>
					<p className="mt-1 font-semibold text-foreground text-sm">
						{signals.servingStarved ? "Pressure detected" : "Clear"}
					</p>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						{servingMessage}
					</p>
				</div>
				<div className="glass-pane p-4">
					<p className="text-muted-foreground text-xs">Training starvation</p>
					<p className="mt-1 font-semibold text-foreground text-sm">
						{signals.trainingStarvedWeeks} week
						{signals.trainingStarvedWeeks === 1 ? "" : "s"} starved
					</p>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						Counted from retained training-starved report facts, not inferred
						from color alone.
					</p>
				</div>
			</div>
			<div className="flex flex-col gap-2 border-primary/30 border-l-2 bg-primary/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
				<p className="font-semibold text-foreground text-xs">Runway guidance</p>
				<p className="text-muted-foreground text-xs leading-5">{guidance}</p>
			</div>
		</section>
	);
}

type ComputeYardObjects = {
	capacity: number;
	colors: {
		evaluation: THREE.Color;
		free: THREE.Color;
		serving: THREE.Color;
		training: THREE.Color;
	};
	colorScratch: THREE.Color;
	geometry: THREE.BoxGeometry;
	material: THREE.MeshBasicMaterial;
	matrix: THREE.Matrix4;
	mesh: THREE.InstancedMesh;
	materializingFrom: number;
	materializingStartedAt: number;
	positions: readonly YardPosition[];
};

type YardPosition = {
	phase: number;
	x: number;
	z: number;
};

function createComputeYardObjects(
	context: ThreeSceneContext,
	signals: ComputePageSignals,
	materializingFrom: number,
): ComputeYardObjects {
	const { THREE, root, theme } = context;
	const capacity = Math.max(0, signals.capacity);
	const geometry = new THREE.BoxGeometry(0.34, 0.2, 0.34);
	const material = new THREE.MeshBasicMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
		vertexColors: true,
	});
	const mesh = new THREE.InstancedMesh(geometry, material, capacity);
	const columns =
		capacity === 0
			? 1
			: Math.min(12, Math.max(1, Math.ceil(Math.sqrt(capacity))));
	const spacing = 0.46;
	const positions: YardPosition[] = [];
	const width = (Math.min(columns, capacity) - 1) * spacing;
	const rows = Math.max(1, Math.ceil(capacity / columns));
	const depth = (rows - 1) * spacing;
	const matrix = new THREE.Matrix4();
	const colors = {
		evaluation: new THREE.Color(),
		free: new THREE.Color(),
		serving: new THREE.Color(),
		training: new THREE.Color("#a78bfa"),
	};
	const blocks = getComputeReservationBlocks(signals);

	colors.evaluation.copy(theme.amber);
	colors.free.copy(theme.cold);
	colors.serving.copy(theme.primary);
	root.rotation.x = -0.18;

	for (let index = 0; index < capacity; index += 1) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const position = {
			phase: (index * 1.618) % (Math.PI * 2),
			x: column * spacing - width / 2,
			z: row * spacing - depth / 2,
		};
		positions.push(position);
		matrix.makeScale(1, 1, 1);
		matrix.setPosition(position.x, 0, position.z);
		mesh.setMatrixAt(index, matrix);
		mesh.setColorAt(index, colors[blocks[index] ?? "free"]);
	}
	mesh.instanceMatrix.needsUpdate = true;
	if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
	root.add(mesh);

	return {
		capacity,
		colorScratch: new THREE.Color(),
		colors,
		geometry,
		material,
		matrix,
		materializingFrom,
		materializingStartedAt: performance.now(),
		mesh,
		positions,
	};
}

function drawComputeYardFrame(
	context: ThreeSceneContext,
	objects: ComputeYardObjects,
	signals: ComputePageSignals,
	materializingFrom: number,
	now: number,
	deltaSeconds: number,
): void {
	const { root, theme } = context;
	const blocks = getComputeReservationBlocks(signals);
	const materializeProgress = (index: number) => {
		if (index < materializingFrom) return 1;
		return clamp(
			(now - objects.materializingStartedAt) / YARD_MATERIALIZE_DURATION_MS,
			0,
			1,
		);
	};

	if (deltaSeconds > 0) {
		root.rotation.y += deltaSeconds * 0.045;
	}

	objects.colors.evaluation.copy(theme.amber);
	objects.colors.free.copy(theme.cold);
	objects.colors.serving.copy(theme.primary);
	for (let index = 0; index < objects.capacity; index += 1) {
		const kind = blocks[index] ?? "free";
		const position = objects.positions[index];
		if (position === undefined) continue;
		const progress = materializeProgress(index);
		const wave = Math.sin(now * 0.002 + position.phase);
		const allocated = kind !== "free";
		const pulse = allocated ? 1 + wave * 0.055 : 0.75 + wave * 0.025;
		const appear = allocated ? progress : Math.max(0.2, progress);
		const scale = pulse * appear;
		const y = kind === "free" ? wave * 0.055 : wave * 0.018;
		objects.matrix.makeScale(scale, scale, scale);
		objects.matrix.setPosition(position.x, y, position.z);
		objects.mesh.setMatrixAt(index, objects.matrix);

		const color = objects.colorScratch.copy(objects.colors[kind]);
		if (allocated) {
			const intensity =
				kind === "serving" ? 1.04 + wave * 0.08 : 0.9 + wave * 0.06;
			color.multiplyScalar(intensity);
		}
		objects.mesh.setColorAt(index, color);
	}
	objects.mesh.instanceMatrix.needsUpdate = true;
	if (objects.mesh.instanceColor !== null)
		objects.mesh.instanceColor.needsUpdate = true;
}

function disposeComputeYardObjects(objects: ComputeYardObjects): void {
	objects.geometry.dispose();
	objects.material.dispose();
}

function computeYardSummary(signals: ComputePageSignals): string {
	return `Compute yard: ${signals.allocated} of ${signals.capacity} units allocated, ${signals.headroom} units free. Training demand ${signals.trainingDemand}, serving demand ${signals.servingDemand}, evaluation demand ${signals.evaluationDemand}.`;
}

function reservationLabel(kind: ComputeReservationKind): string {
	return kind === "free"
		? "Free capacity"
		: `${kind[0].toUpperCase()}${kind.slice(1)} reservation`;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
