import {
	type GameState,
	type Model,
	type ModelFoundation,
	selectVisibleModels,
} from "@ai-lab-tycoon/engine";
import { GitBranch, Layers3 } from "lucide-react";

export type ModelFate =
	| "LAUNCHED"
	| "SHELFED"
	| "RETIRED"
	| "FLAGSHIP"
	| "READY"
	| "IN FLIGHT";

export type LineageGalleryModel = {
	id: string;
	name: string;
	foundation: ModelFoundation;
	status: Model["status"];
	family: string;
	parentModelId: string | null;
	tier: Model["tier"];
	fate: ModelFate;
};

export type LineageConnector = {
	childId: string;
	childIndex: number;
	parentId: string;
	parentIndex: number;
};

export type LineageFamily = {
	id: string;
	label: string;
	models: LineageGalleryModel[];
	connectors: LineageConnector[];
};

export type LineageGalleryProps = {
	state: GameState;
};

const MODEL_CARD_BACKDROPS = [
	"/art/modelchip-cyan.png",
	"/art/modelchip-amber.png",
	"/art/modelchip-ice.png",
] as const;

/** Build a public family wall without copying private model scores. */
export function buildLineageFamilies(state: GameState): LineageFamily[] {
	const visibleModels = selectVisibleModels(state);
	const sourceModels = new Map(
		state.models.items.map((model) => [model.id, model]),
	);
	const grouped = new Map<string, LineageGalleryModel[]>();

	for (const visible of visibleModels) {
		const source = sourceModels.get(visible.id);
		if (source === undefined) continue;
		const family = visible.family ?? "unclassified";
		const familyModels = grouped.get(family) ?? [];
		familyModels.push({
			id: visible.id,
			name: visible.name,
			foundation: source.foundation,
			status: source.status,
			family,
			parentModelId: source.parentModelId ?? null,
			tier: source.tier,
			fate: modelFate(source, state),
		});
		grouped.set(family, familyModels);
	}

	return [...grouped.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([id, models]) => {
			const indexById = new Map(
				models.map((model, index) => [model.id, index]),
			);
			const connectors = models.flatMap((model, childIndex) => {
				if (model.parentModelId === null) return [];
				const parentIndex = indexById.get(model.parentModelId);
				return parentIndex === undefined
					? []
					: [
							{
								childId: model.id,
								childIndex,
								parentId: model.parentModelId,
								parentIndex,
							},
						];
			});
			return {
				id,
				label: humanize(id),
				models,
				connectors,
			};
		});
}

/** Map the engine's lifecycle status to a stamped, public-facing fate. */
export function modelFate(model: Model, state: GameState): ModelFate {
	const rawStatus = String(model.status);
	if (rawStatus === "retired") return "RETIRED";
	if (
		state.models.activeModelId === model.id &&
		(model.status === "ready" || model.status === "launched")
	) {
		return "FLAGSHIP";
	}
	switch (model.status) {
		case "launched":
			return "LAUNCHED";
		case "shelved":
			return "SHELFED";
		case "ready":
			return "READY";
		case "designing":
		case "training":
			return "IN FLIGHT";
	}
}

export default function LineageGallery({ state }: LineageGalleryProps) {
	const families = buildLineageFamilies(state);

	return (
		<section aria-labelledby="lineage-gallery-heading" className="space-y-5">
			<header className="flex flex-col gap-3 border-border/70 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="max-w-3xl">
					<div className="flex items-center gap-2 font-mono font-semibold text-[var(--game-cyan)] text-xs uppercase tracking-[0.18em]">
						<GitBranch className="size-4" aria-hidden="true" />
						<span>Family wall / public register</span>
					</div>
					<h2
						className="mt-1 font-mono font-semibold text-2xl text-foreground uppercase tracking-tight sm:text-3xl"
						id="lineage-gallery-heading"
					>
						Model lineage gallery
					</h2>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						A wall of the models this run has actually designed. Connectors show
						continued or distilled descent; private score fields never enter the
						gallery projection.
					</p>
				</div>
				<div className="shrink-0 border border-[var(--game-cyan)]/35 bg-[var(--game-cyan)]/5 px-3 py-2 font-mono text-xs uppercase tracking-[0.1em]">
					<p className="text-[var(--game-cyan)]">Public register</p>
					<p className="mt-1 font-semibold text-foreground">
						{state.models.items.length} model
						{state.models.items.length === 1 ? "" : "s"}
					</p>
				</div>
			</header>

			{families.length === 0 ? (
				<EmptyLineageState />
			) : (
				<>
					<div className="grid gap-4 xl:grid-cols-2">
						{families.map((family) => (
							<FamilyWall family={family} key={family.id} />
						))}
					</div>
					<p className="border border-border/60 border-dashed px-3 py-3 text-muted-foreground text-xs leading-5">
						Fate vocabulary: LAUNCHED, SHELFED, RETIRED, and FLAGSHIP. RETIRED
						remains reserved for a future engine lifecycle state; current cards
						use READY or IN FLIGHT when that state is not yet present.
					</p>
				</>
			)}
		</section>
	);
}

function EmptyLineageState() {
	return (
		<section
			aria-label="Empty model lineage"
			className="border border-[var(--game-cyan)]/30 border-dashed bg-[var(--game-cyan)]/5 px-5 py-12 text-center"
		>
			<Layers3
				className="mx-auto size-7 text-[var(--game-cyan)] opacity-80"
				aria-hidden="true"
			/>
			<h3 className="mt-4 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.16em]">
				(no models yet)
			</h3>
			<p className="mx-auto mt-2 max-w-md text-muted-foreground text-xs leading-5">
				The family wall is waiting for the first design to leave the model
				workbench.
			</p>
		</section>
	);
}

function FamilyWall({ family }: { family: LineageFamily }) {
	const rowHeight = 116;
	const wallHeight = Math.max(160, family.models.length * rowHeight);

	return (
		<section
			aria-labelledby={`lineage-family-${family.id}`}
			className="relative overflow-hidden border border-border/70 bg-background/25 p-3 sm:p-4"
			style={{ minHeight: `${wallHeight}px` }}
		>
			<div className="relative z-10 flex items-center justify-between gap-3 border-border/60 border-b pb-2">
				<div>
					<p className="font-mono font-semibold text-[var(--game-cyan)] text-xs uppercase tracking-[0.16em]">
						Foundation family
					</p>
					<h3
						className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.12em]"
						id={`lineage-family-${family.id}`}
					>
						{family.label}
					</h3>
				</div>
				<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
					{family.models.length} branch{family.models.length === 1 ? "" : "es"}
				</span>
			</div>
			<svg
				aria-label="Continued and distilled descent connectors"
				className="pointer-events-none absolute inset-x-0 top-14 z-0 h-[calc(100%-3.5rem)] w-full"
				preserveAspectRatio="none"
				role="img"
				viewBox={`0 0 100 ${wallHeight - 56}`}
			>
				{family.connectors.map((connector) => {
					const parentY = connector.parentIndex * rowHeight + 90;
					const childY = connector.childIndex * rowHeight + 8;
					return (
						<path
							d={`M 50 ${parentY} C 12 ${parentY}, 88 ${childY}, 50 ${childY}`}
							fill="none"
							key={`${connector.parentId}-${connector.childId}`}
							stroke="var(--game-cyan)"
							strokeDasharray="3 4"
							strokeLinecap="round"
							strokeOpacity="0.65"
							strokeWidth="1.5"
						>
							<title>
								{family.models[connector.childIndex]?.foundation === "distilled"
									? "Distilled descent"
									: "Continued descent"}
							</title>
						</path>
					);
				})}
			</svg>
			<ol className="relative z-10 mt-3 space-y-3">
				{family.models.map((model, index) => (
					<li key={model.id}>
						<LineageModelCard
							index={index}
							model={model}
							parentName={
								family.models.find(
									(candidate) => candidate.id === model.parentModelId,
								)?.name
							}
						/>
					</li>
				))}
			</ol>
		</section>
	);
}

function LineageModelCard({
	index,
	model,
	parentName,
}: {
	index: number;
	model: LineageGalleryModel;
	parentName: string | undefined;
}) {
	const backdrop =
		MODEL_CARD_BACKDROPS[index % MODEL_CARD_BACKDROPS.length] ??
		MODEL_CARD_BACKDROPS[0];
	const fateStyle =
		model.fate === "FLAGSHIP"
			? "border-[var(--game-positive)]/60 text-[var(--game-positive)]"
			: model.fate === "SHELFED" || model.fate === "RETIRED"
				? "border-muted-foreground/50 text-muted-foreground"
				: "border-[var(--game-cyan)]/55 text-[var(--game-cyan)]";

	return (
		<article className="relative min-h-24 overflow-hidden border border-border/70 bg-card/80 p-3">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-center bg-cover opacity-20"
				style={{ backgroundImage: `url('${backdrop}')` }}
			/>
			<div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/90 to-transparent" />
			<div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-2">
						<GitBranch
							className="size-3.5 shrink-0 text-[var(--game-cyan)]"
							aria-hidden="true"
						/>
						<h4 className="truncate font-medium text-foreground text-sm">
							{model.name}
						</h4>
					</div>
					<p className="mt-1 font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
						{model.id} · {model.family} · {model.tier ?? "tier pending"}
					</p>
				</div>
				<span
					className={`shrink-0 rotate-[-1deg] border bg-background/55 px-2 py-1 font-mono font-semibold text-xs uppercase tracking-[0.1em] ${fateStyle}`}
				>
					{model.fate}
				</span>
			</div>
			<div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-border/50 border-t pt-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">
				<span>{humanize(model.foundation)} foundation</span>
				{parentName ? <span>← {parentName}</span> : <span>root branch</span>}
			</div>
		</article>
	);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
