import {
	type Fact,
	type GameState,
	selectRecentReports,
} from "@ai-lab-tycoon/engine";
import { BookOpen, LockKeyhole } from "lucide-react";

export const NOTEBOOK_TILE_COUNT = 12 as const;

type NotebookFactKind =
	| "incident_occurred"
	| "evaluation_completed"
	| "product_launched"
	| "research_completed"
	| "model_trained"
	| "revenue"
	| "funding_resolved"
	| "rival_progressed"
	| "rival_milestone";

type NotebookSlot =
	| {
			id: string;
			label: string;
			kind: "first";
			factKind?: NotebookFactKind;
	  }
	| {
			id: string;
			label: string;
			kind: "era";
			era: GameState["research"]["currentEra"];
	  };

export type NotebookTile = {
	id: string;
	label: string;
	kind: NotebookSlot["kind"];
	discovered: boolean;
	week?: number;
	annotation?: string;
	evidence?: string;
};

export type LabNotebookProps = {
	state: GameState;
	forceShowAll?: boolean;
};

const NOTEBOOK_SLOTS = [
	{
		id: "first-report",
		label: "First page",
		kind: "first",
		factKind: undefined,
	},
	{
		id: "first-incident",
		label: "First incident cause",
		kind: "first",
		factKind: "incident_occurred",
	},
	{
		id: "first-evaluation",
		label: "First evaluation",
		kind: "first",
		factKind: "evaluation_completed",
	},
	{
		id: "first-launch",
		label: "First launch",
		kind: "first",
		factKind: "product_launched",
	},
	{
		id: "first-research",
		label: "First research completion",
		kind: "first",
		factKind: "research_completed",
	},
	{
		id: "first-model-trained",
		label: "First trained model",
		kind: "first",
		factKind: "model_trained",
	},
	{
		id: "first-revenue",
		label: "First revenue",
		kind: "first",
		factKind: "revenue",
	},
	{
		id: "first-funding",
		label: "First funding outcome",
		kind: "first",
		factKind: "funding_resolved",
	},
	{
		id: "first-rival-signal",
		label: "First rival signal",
		kind: "first",
		factKind: "rival_progressed",
	},
	{ id: "era-text", label: "Text era leaf", kind: "era", era: "text" },
	{
		id: "era-assistant",
		label: "Assistant era leaf",
		kind: "era",
		era: "assistant",
	},
	{
		id: "era-multimodal",
		label: "Multimodal era leaf",
		kind: "era",
		era: "multimodal",
	},
] as const satisfies readonly NotebookSlot[];

/** Derive every tile from first occurrences in the engine report history. */
export function buildNotebookTiles(state: GameState): NotebookTile[] {
	const facts = selectRecentReports(state)
		.map((report) => report.fact)
		.sort((left, right) => left.week - right.week);

	return NOTEBOOK_SLOTS.map((slot) => {
		if (slot.kind === "era") {
			const evidence = facts.find(
				(fact): fact is Extract<Fact, { kind: "research_completed" }> =>
					fact.kind === "research_completed" &&
					state.research.nodes.find((node) => node.id === fact.nodeId)?.era ===
						slot.era,
			);
			if (evidence === undefined) return undiscoveredTile(slot);
			const nodeLabel = evidence.nodeId;
			return {
				id: slot.id,
				label: slot.label,
				kind: slot.kind,
				discovered: true,
				week: evidence.week,
				evidence: nodeLabel,
				annotation: `Week ${evidence.week} · Completed ${nodeLabel} in the ${humanize(slot.era)} era.`,
			};
		}

		const evidence =
			slot.factKind === undefined
				? facts[0]
				: facts.find((fact) => fact.kind === slot.factKind);
		if (evidence === undefined) return undiscoveredTile(slot);
		return {
			id: slot.id,
			label: slot.label,
			kind: slot.kind,
			discovered: true,
			week: evidence.week,
			evidence: evidence.kind,
			annotation: `Week ${evidence.week} · ${notebookFactAnnotation(evidence)}`,
		};
	});
}

export function countDiscoveredNotebookTiles(state: GameState): number {
	return buildNotebookTiles(state).filter((tile) => tile.discovered).length;
}

export default function LabNotebook({
	forceShowAll = false,
	state,
}: LabNotebookProps) {
	const tiles = buildNotebookTiles(state);
	const discoveredCount = tiles.filter((tile) => tile.discovered).length;

	return (
		<section aria-labelledby="lab-notebook-heading" className="space-y-5">
			<header className="flex flex-col gap-3 border-border/70 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="max-w-3xl">
					<div className="flex items-center gap-2 font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.18em]">
						<BookOpen className="size-4" aria-hidden="true" />
						<span>Field notes / discovery register</span>
					</div>
					<h2
						className="mt-1 font-mono font-semibold text-2xl text-foreground uppercase tracking-tight sm:text-3xl"
						id="lab-notebook-heading"
					>
						Lab notebook
					</h2>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						Twelve firsts from the report history, kept as a small discovery
						cabinet. Open tiles quote real engine facts; frosted tiles wait for
						their first occurrence.
					</p>
				</div>
				<div className="shrink-0 border border-[var(--game-amber)]/45 bg-[var(--game-amber)]/8 px-3 py-2 font-mono text-xs uppercase tracking-[0.12em]">
					<p className="text-[var(--game-amber)]">Notebook progress</p>
					<p className="mt-1 font-semibold text-foreground">
						{discoveredCount}/{NOTEBOOK_TILE_COUNT} discovered
					</p>
				</div>
			</header>

			{forceShowAll ? (
				<p className="border border-[var(--game-amber)]/35 border-dashed bg-[var(--game-amber)]/5 px-3 py-2 text-[var(--game-amber)] text-xs leading-5">
					Debug preview: all cabinets are visible, but the progress counter
					still counts only facts present in the report history.
				</p>
			) : null}

			<section
				aria-label="Lab notebook discovery grid"
				className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
			>
				{tiles.map((tile) => (
					<NotebookTileCard
						forceShowAll={forceShowAll}
						key={tile.id}
						tile={tile}
					/>
				))}
			</section>
		</section>
	);
}

function NotebookTileCard({
	forceShowAll,
	tile,
}: {
	forceShowAll: boolean;
	tile: NotebookTile;
}) {
	const previewOnly = forceShowAll && !tile.discovered;
	const isOpen = tile.discovered || forceShowAll;
	if (isOpen) {
		return (
			<article
				aria-label={`${tile.label}${previewOnly ? " preview" : " discovered"}`}
				className="relative flex min-h-44 flex-col overflow-hidden border border-[var(--game-amber)]/45 bg-[var(--game-amber)]/8 p-3 shadow-[2px_3px_0_rgba(245,176,76,0.1)]"
				data-discovered={tile.discovered}
			>
				<div className="flex items-start justify-between gap-2">
					<span className="font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.1em]">
						{tile.kind === "era" ? "Era leaf" : "First entry"}
					</span>
					{previewOnly ? (
						<span className="border border-[var(--game-amber)]/45 px-1.5 py-0.5 font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.08em]">
							Preview
						</span>
					) : null}
				</div>
				<h3 className="mt-3 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
					{tile.label}
				</h3>
				<p className="mt-3 flex-1 font-serif text-sm italic leading-6 opacity-90">
					{tile.annotation ??
						"Preview slot · the engine has not recorded this event yet."}
				</p>
				<p className="mt-3 border-[var(--game-amber)]/25 border-t pt-2 font-mono text-xs uppercase tracking-[0.08em] opacity-65">
					{tile.discovered
						? `Recorded week ${tile.week}`
						: "No engine event recorded"}
				</p>
			</article>
		);
	}

	return (
		<article
			aria-label={`${tile.label} undiscovered`}
			className="relative flex min-h-44 flex-col items-center justify-center overflow-hidden border border-[var(--game-cyan)]/25 bg-[var(--game-cyan)]/5 p-3 text-center grayscale"
			data-discovered="false"
		>
			<img
				alt=""
				aria-hidden="true"
				className="pointer-events-none absolute size-28 object-contain opacity-15 mix-blend-screen"
				src="/art/icon-wax-seal.png"
			/>
			<LockKeyhole
				className="relative size-4 text-[var(--game-cyan)]"
				aria-hidden="true"
			/>
			<span className="relative mt-2 font-mono text-3xl text-[var(--game-cyan)] opacity-70">
				?
			</span>
			<h3 className="relative mt-2 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
				{tile.label}
			</h3>
			<p className="relative mt-2 text-muted-foreground text-xs leading-5">
				Awaiting first recorded event
			</p>
		</article>
	);
}

function undiscoveredTile(slot: NotebookSlot): NotebookTile {
	return {
		id: slot.id,
		label: slot.label,
		kind: slot.kind,
		discovered: false,
	};
}

function notebookFactAnnotation(fact: Fact): string {
	switch (fact.kind) {
		case "incident_occurred":
			return `${humanize(fact.incident)} was the first incident cause recorded against ${fact.affectedEntity}.`;
		case "evaluation_completed":
			return `${humanize(fact.evaluation)} evaluation completed for ${fact.modelId} at ${fact.coverage}% coverage.`;
		case "product_launched":
			return `${fact.productId} entered the ${humanize(fact.channel)} channel.`;
		case "research_completed":
			return `Research node ${fact.nodeId} completed.`;
		case "model_trained":
			return `Training completed for ${fact.modelId}.`;
		case "revenue":
			return `${fact.productId} recorded ${fact.amount} in ${humanize(fact.channel)} revenue.`;
		case "funding_resolved":
			return `${humanize(fact.round)} funding was ${fact.outcome}.`;
		case "rival_progressed":
			return `${fact.rivalId} moved by ${fact.amount} progress points.`;
		case "rival_milestone":
			return `${fact.rivalId} reached ${fact.milestone}.`;
		default:
			return `The first ${humanize(fact.kind)} fact was recorded by the engine.`;
	}
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
