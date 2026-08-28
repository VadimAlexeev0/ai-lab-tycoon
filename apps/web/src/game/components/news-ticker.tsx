import {
	type GameState,
	selectRivals,
	type VisibleRival,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Pause, Play, Radio, X } from "lucide-react";
import { useEffect, useState } from "react";

import PlaceholderBadge from "@/game/components/placeholder-badge";
import {
	type SampleHeadline,
	type SamplePressSource,
	sampleHeadlines,
} from "@/game/sample-data";

export const TICKER_STORAGE_KEY = "ailt-ticker" as const;
const TICKER_CHANGE_EVENT = "ailt-ticker-change";
const TICKER_HEADLINE_COUNT = 8;
const PULSE_HEADLINE_COUNT = 12;

const MASTHEADS: Record<SamplePressSource, { alt: string; src: string }> = {
	"gradient-wire": {
		alt: "The Gradient Wire masthead",
		src: "/art/press-gradient-wire.png",
	},
	"benchmarks-daily": {
		alt: "Benchmarks Daily masthead",
		src: "/art/press-benchmarks-daily.png",
	},
	"context-window": {
		alt: "Context Window masthead",
		src: "/art/press-context-window.png",
	},
};

const RIVAL_ART: Record<VisibleRival["archetype"], string> = {
	research_lab: "/art/rival-hacker.png",
	platform: "/art/rival-mogul.png",
	efficiency: "/art/rival-enterprise.png",
};

export type NewsTickerProps = {
	state: GameState | null;
	forceVisible?: boolean;
	rivalProgressPct?: number;
};

/** Fixed, opt-in world aliveness strip for every route below /game. */
export default function NewsTicker({
	state,
	forceVisible = false,
	rivalProgressPct,
}: NewsTickerProps) {
	const [alwaysOn, setAlwaysOn] = useState(false);
	const [paused, setPaused] = useState(false);
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		const syncPreference = () => setAlwaysOn(readTickerPreference());
		syncPreference();
		window.addEventListener("storage", syncPreference);
		window.addEventListener(TICKER_CHANGE_EVENT, syncPreference);
		return () => {
			window.removeEventListener("storage", syncPreference);
			window.removeEventListener(TICKER_CHANGE_EVENT, syncPreference);
		};
	}, []);

	if (state === null || (!forceVisible && !alwaysOn)) return null;

	if (hidden) {
		return (
			<div className="ailt-ticker-dock fixed inset-x-0 bottom-[4.25rem] z-30 flex justify-center px-3 lg:bottom-0 lg:justify-end lg:px-6 lg:pb-3">
				<Button
					aria-label="Show industry news ticker"
					onClick={() => setHidden(false)}
					size="sm"
					type="button"
					variant="outline"
				>
					<Radio data-icon="inline-start" aria-hidden="true" />
					Show pulse
				</Button>
			</div>
		);
	}

	const rivals = selectRivals(state);
	const progress =
		rivalProgressPct ??
		rivals.reduce((maximum, rival) => Math.max(maximum, rival.progress), 0);
	const headlines = sampleHeadlines(
		state.rng.seed,
		progress,
		TICKER_HEADLINE_COUNT,
		rivals,
	);
	const lead = headlines[0];

	return (
		<div className="ailt-ticker-dock fixed inset-x-0 bottom-0 z-30 border-[var(--game-amber)]/40 border-t bg-card/95 shadow-[0_-6px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
			<div className="mx-auto flex min-h-12 max-w-[1600px] items-stretch">
				<Link
					aria-label={`Open Industry Pulse: ${lead?.headline ?? "No industry headlines yet."}`}
					className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-3 py-2 text-left hover:bg-[var(--game-amber)]/5 sm:px-5"
					to="/game/pulse"
				>
					<span className="flex shrink-0 items-center gap-1.5 font-semibold text-[var(--game-amber)] text-xs">
						<Radio className="size-3.5" aria-hidden="true" />
						<span className="hidden sm:inline">Industry pulse</span>
						<span className="sm:hidden">Pulse</span>
					</span>
					<div className="min-w-0 flex-1 overflow-hidden" aria-hidden="true">
						<div
							className="ailt-news-ticker-track flex min-w-max items-center gap-8 whitespace-nowrap text-muted-foreground text-xs"
							data-paused={paused}
						>
							{[...headlines, ...headlines].map((headline, index) => (
								<span
									className="inline-flex items-center gap-2"
									key={`${headline.id}-${index}`}
								>
									<span
										className={sentimentDotClass(headline.sentiment)}
										aria-hidden="true"
									/>
									{headline.headline}
								</span>
							))}
						</div>
					</div>
					<span className="sr-only">
						{lead?.headline ?? "No industry headlines yet."}
					</span>
				</Link>
				<div className="flex shrink-0 items-center gap-1 border-border/60 border-l px-2">
					<Button
						aria-label={paused ? "Resume news ticker" : "Pause news ticker"}
						aria-pressed={paused}
						className="min-h-11 min-w-11"
						onClick={() => setPaused((current) => !current)}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						{paused ? (
							<Play className="size-3.5" aria-hidden="true" />
						) : (
							<Pause className="size-3.5" aria-hidden="true" />
						)}
					</Button>
					<Button
						aria-label="Hide industry news ticker"
						className="min-h-11 min-w-11"
						onClick={() => setHidden(true)}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<X className="size-3.5" aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	);
}

export type IndustryPulseProps = {
	state: GameState;
	rivalProgressPct?: number;
};

/** Expanded press-desk view for the /game/pulse archive route. */
export function IndustryPulse({ state, rivalProgressPct }: IndustryPulseProps) {
	const rivals = selectRivals(state);
	const progress =
		rivalProgressPct ??
		rivals.reduce((maximum, rival) => Math.max(maximum, rival.progress), 0);
	const headlines = sampleHeadlines(
		state.rng.seed,
		progress,
		PULSE_HEADLINE_COUNT,
		rivals,
	);

	return (
		<article
			aria-labelledby="industry-pulse-heading"
			className="glass-pane glass-edge glass-edge-amber relative overflow-hidden bg-card/70 p-4 sm:p-5 lg:p-6"
		>
			<header className="relative flex flex-col gap-4 border-[var(--game-amber)]/30 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
				<div className="max-w-3xl space-y-2">
					<PlaceholderBadge />
					<p className="font-semibold text-primary text-xs">
						Archive / public signal desk
					</p>
					<h2
						className="font-display font-semibold text-3xl text-foreground sm:text-4xl"
						id="industry-pulse-heading"
					>
						Industry pulse
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm leading-6">
						A deterministic, fictional press wire shaped by the run seed and
						public rival clocks. Headlines are atmosphere, not engine facts.
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
					<TickerToggle />
					<span className="text-muted-foreground text-xs">
						Week {state.meta.week} · {headlines.length} dispatches
					</span>
				</div>
			</header>

			<div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{headlines.map((headline, index) => (
					<HeadlineCard
						currentWeek={state.meta.week}
						headline={headline}
						index={index}
						key={headline.id}
						rivals={rivals}
					/>
				))}
			</div>
			<p className="relative mt-5 border-[var(--game-amber)]/30 border-t pt-3 text-muted-foreground text-xs leading-5">
				Preview wire only · no headline, rival attribution, or sentiment is
				written to the active GameState or save.
			</p>
		</article>
	);
}

export type HeadlineCardProps = {
	headline: SampleHeadline;
	index: number;
	currentWeek: number;
	rivals: readonly VisibleRival[];
};

export function HeadlineCard({
	headline,
	index,
	currentWeek,
	rivals,
}: HeadlineCardProps) {
	const masthead = MASTHEADS[headline.source];
	const relatedRivals = headline.relatedRivalNames.map((name) => ({
		name,
		rival: rivals.find((candidate) => candidate.name === name),
	}));
	const timestampWeek = Math.max(1, currentWeek - headline.ageWeeks);

	return (
		<article
			className="group relative flex min-h-64 min-w-0 flex-col rounded-lg border border-[var(--game-hairline)] bg-background/35 p-3 transition-colors hover:bg-background/55"
			data-headline-id={headline.id}
			data-sentiment={headline.sentiment}
		>
			<div className="flex items-start justify-between gap-3">
				<img
					alt={masthead.alt}
					className="h-8 w-24 rounded-none border border-border/70 object-cover object-left opacity-85 grayscale-[0.15] transition-opacity group-hover:opacity-100"
					decoding="async"
					loading="lazy"
					src={masthead.src}
				/>
				<span className={sentimentClass(headline.sentiment)}>
					{headline.sentiment}
				</span>
			</div>
			<div className="mt-4 flex-1">
				<h3 className="font-semibold text-foreground text-sm leading-5">
					{headline.headline}
				</h3>
				<p className="mt-2 text-muted-foreground text-xs leading-5">
					{headline.summary}
				</p>
			</div>
			{relatedRivals.length > 0 ? (
				<div className="mt-4 border-border/60 border-t pt-3">
					<p className="text-muted-foreground text-xs">Related rival clock</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{relatedRivals.map(({ name, rival }) => (
							<span
								className="inline-flex max-w-full items-center gap-1.5 border border-primary/25 bg-primary/5 px-1.5 py-1 text-foreground text-xs"
								data-rival-id={rival?.id}
								key={name}
							>
								{rival === undefined ? (
									<span
										aria-hidden="true"
										className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary text-xs"
									>
										{initials(name)}
									</span>
								) : (
									<img
										alt=""
										className="size-5 shrink-0 rounded-full border border-primary/35 object-cover"
										decoding="async"
										src={RIVAL_ART[rival.archetype]}
									/>
								)}
								<span className="max-w-32 truncate">{name}</span>
							</span>
						))}
					</div>
				</div>
			) : null}
			{headline.relatedNodeIds.length > 0 ? (
				<div className="mt-4 border-border/60 border-t pt-3">
					<p className="text-muted-foreground text-xs">Related research</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{headline.relatedNodeIds.map((nodeId) => (
							<Link
								aria-label={`Open research node ${humanizeResearchNode(nodeId)}`}
								className="inline-flex max-w-full items-center border border-[var(--game-amber)]/35 bg-[var(--game-amber)]/5 px-1.5 py-1 text-foreground text-xs hover:border-[var(--game-amber)]/70"
								data-research-node-id={nodeId}
								key={nodeId}
								search={{ node: nodeId }}
								to="/game/research"
							>
								{humanizeResearchNode(nodeId)}
							</Link>
						))}
					</div>
				</div>
			) : null}
			<div className="mt-4 flex items-center justify-between gap-2 border-border/60 border-t pt-2 text-muted-foreground text-xs">
				<time>{relativeTimestamp(timestampWeek, currentWeek)}</time>
				<span>Dispatch {String(index + 1).padStart(2, "0")}</span>
			</div>
		</article>
	);
}

/** Toggle the persisted normal-play ticker preference from the pulse desk. */
export function TickerToggle() {
	const [enabled, setEnabled] = useState(false);

	useEffect(() => {
		setEnabled(readTickerPreference());
	}, []);

	function toggle() {
		const next = !enabled;
		setEnabled(next);
		try {
			window.localStorage.setItem(TICKER_STORAGE_KEY, next ? "1" : "0");
			window.dispatchEvent(new Event(TICKER_CHANGE_EVENT));
		} catch {
			// Storage is optional; the current tab still reflects the preference.
		}
	}

	return (
		<button
			aria-pressed={enabled}
			className="inline-flex min-h-9 items-center gap-2 border border-border/70 bg-background/40 px-2.5 py-1.5 text-muted-foreground text-xs hover:border-primary/50 hover:text-foreground"
			onClick={toggle}
			type="button"
		>
			<span
				aria-hidden="true"
				className={
					enabled
						? "size-2 rounded-full bg-[var(--game-positive)]"
						: "size-2 rounded-full bg-muted-foreground/50"
				}
			/>
			Always-on ticker: {enabled ? "On" : "Off"}
		</button>
	);
}

function readTickerPreference(): boolean {
	try {
		return window.localStorage.getItem(TICKER_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
}

function sentimentClass(sentiment: SampleHeadline["sentiment"]): string {
	if (sentiment === "positive") {
		return "border-[var(--game-positive)]/40 bg-[var(--game-positive)]/10 px-1.5 py-1 text-[var(--game-positive)] text-xs";
	}
	if (sentiment === "negative") {
		return "border-[var(--game-negative)]/40 bg-[var(--game-negative)]/10 px-1.5 py-1 text-[var(--game-negative)] text-xs";
	}
	return "border-border bg-muted/60 px-1.5 py-1 text-muted-foreground text-xs";
}

function sentimentDotClass(sentiment: SampleHeadline["sentiment"]): string {
	if (sentiment === "positive")
		return "size-1.5 rounded-full bg-[var(--game-positive)]";
	if (sentiment === "negative")
		return "size-1.5 rounded-full bg-[var(--game-negative)]";
	return "size-1.5 rounded-full bg-muted-foreground/70";
}

function relativeTimestamp(week: number, currentWeek: number): string {
	const age = Math.max(0, currentWeek - week);
	return age === 0 ? `Week ${week} · This week` : `Week ${week} · ${age}w ago`;
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter((part) => part.length > 0)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "?")
		.join("");
}

function humanizeResearchNode(nodeId: string): string {
	return nodeId
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
