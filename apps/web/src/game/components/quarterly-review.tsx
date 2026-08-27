import type { Fact, GameState } from "@ai-lab-tycoon/engine";
import { toast } from "sonner";

import PlaceholderBadge from "@/game/components/placeholder-badge";
import {
	type BoardExpectation,
	type StrategicQuestion,
	sampleBoardExpectations,
	sampleStrategicQuestion,
} from "@/game/sample-data";

const numberFormatter = new Intl.NumberFormat("en-US");
const MAX_HISTORY_POINTS = 6;

type Trend = {
	points: number[];
	illustrative: boolean;
};

type ReviewStat = {
	id: string;
	label: string;
	value: string;
	detail: string;
	trend: Trend;
	accent: string;
};

export type QuarterlyReviewProps = {
	state: GameState;
	quarter?: number;
};

/**
 * A report-shaped preview of a quarter. Only facts already present in the
 * engine state feed the real trends; all missing history stays visibly flat
 * and illustrative rather than being persisted as invented state.
 */
export default function QuarterlyReview({
	state,
	quarter = quarterForWeek(state.meta.week),
}: QuarterlyReviewProps) {
	const stats = buildReviewStats(state);
	const expectations = sampleBoardExpectations(state.rng.seed);
	const question = sampleStrategicQuestion(state.rng.seed);

	return (
		<article
			aria-labelledby="quarterly-review-surface-heading"
			className="relative overflow-hidden border border-[var(--game-amber)]/55 border-dashed bg-card/70 p-4 sm:p-5 lg:p-6"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--game-amber)]/80 via-[var(--game-amber)]/20 to-transparent"
			/>
			<header className="relative flex flex-col gap-4 border-[var(--game-amber)]/30 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
				<div className="max-w-3xl space-y-2">
					<PlaceholderBadge />
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.2em]">
						Quarter {quarter} / archive draft
					</p>
					<h2
						className="font-mono font-semibold text-2xl text-foreground uppercase tracking-tight sm:text-3xl"
						id="quarterly-review-surface-heading"
					>
						The quarter in review
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm leading-6">
						A calm read of the lab's posture before the next thirteen-week bet.
						Mechanical facts are real where the V1 state exposes them; future
						review copy is clearly marked as a preview.
					</p>
				</div>
				<div className="shrink-0 border border-[var(--game-amber)]/35 bg-[var(--game-amber)]/5 px-3 py-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
					<p>Current checkpoint</p>
					<p className="mt-1 font-semibold text-foreground">
						Week {state.meta.week} · Era {state.meta.era}
					</p>
				</div>
			</header>

			<div className="relative mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
				<section aria-labelledby="quarterly-stats-heading" className="min-w-0">
					<div className="flex items-end justify-between gap-3">
						<div>
							<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.18em]">
								Mechanical summary
							</p>
							<h3
								className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
								id="quarterly-stats-heading"
							>
								Run health at a glance
							</h3>
						</div>
						<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
							{stats.length} signals
						</span>
					</div>
					<dl className="mt-3 divide-y divide-border/60 border border-border/70 bg-background/25">
						{stats.map((stat) => (
							<ReviewStatRow key={stat.id} stat={stat} />
						))}
					</dl>
				</section>

				<section
					aria-labelledby="board-expectations-heading"
					className="min-w-0"
				>
					<div>
						<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.18em]">
							Board expectations
						</p>
						<h3
							className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
							id="board-expectations-heading"
						>
							What the room wants next
						</h3>
					</div>
					<div className="mt-3 space-y-2">
						{expectations.map((expectation) => (
							<ExpectationMeter
								expectation={expectation}
								key={expectation.id}
							/>
						))}
					</div>
					<p className="mt-3 border-[var(--game-amber)]/30 border-t pt-2 text-muted-foreground text-xs leading-5">
						Board language is an authored preview generated from this run's
						seed. It has no funding or decision effect yet.
					</p>
				</section>
			</div>

			<StrategicQuestionCard question={question} />
		</article>
	);
}

function ReviewStatRow({ stat }: { stat: ReviewStat }) {
	return (
		<div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
			<div className="min-w-0 sm:w-[42%]">
				<dt className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.13em]">
					{stat.label}
				</dt>
				<dd className="mt-1 font-mono font-semibold text-base text-foreground">
					{stat.value}
				</dd>
				<p className="mt-1 text-muted-foreground text-xs leading-5">
					{stat.detail}
				</p>
			</div>
			<div className="flex min-w-0 flex-1 items-center gap-3 sm:justify-end">
				<div className="min-w-0 flex-1 sm:max-w-48">
					<Sparkline
						accent={stat.accent}
						illustrative={stat.trend.illustrative}
						label={`${stat.label} trend`}
						points={stat.trend.points}
					/>
				</div>
				<span className="shrink-0 font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">
					{stat.trend.illustrative ? "Illustrative" : "Engine history"}
				</span>
			</div>
		</div>
	);
}

function Sparkline({
	accent,
	illustrative,
	label,
	points,
}: {
	accent: string;
	illustrative: boolean;
	label: string;
	points: readonly number[];
}) {
	const safePoints = points.length > 1 ? points : [0, 0];
	const minimum = Math.min(...safePoints);
	const maximum = Math.max(...safePoints);
	const range = maximum - minimum || 1;
	const coordinates = safePoints
		.map((point, index) => {
			const x = (index / (safePoints.length - 1)) * 120;
			const y = 24 - ((point - minimum) / range) * 19;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");

	return (
		<svg
			aria-label={`${label}${illustrative ? " (illustrative)" : ""}`}
			className="h-8 w-full min-w-24 overflow-visible"
			role="img"
			viewBox="0 0 120 28"
		>
			<path
				d="M0 25H120"
				fill="none"
				className="stroke-border"
				strokeDasharray="2 3"
				strokeWidth="1"
			/>
			<polyline
				fill="none"
				className={accent}
				points={coordinates}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
			/>
		</svg>
	);
}

function ExpectationMeter({ expectation }: { expectation: BoardExpectation }) {
	const statusLabel =
		expectation.status === "ahead"
			? "Ahead"
			: expectation.status === "on-track"
				? "On track"
				: "Watch";
	return (
		<div className="border border-border/70 bg-background/35 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="font-medium text-foreground text-sm">
						{expectation.label}
					</p>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						{expectation.detail}
					</p>
				</div>
				<span className="shrink-0 font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.08em]">
					{statusLabel}
				</span>
			</div>
			<div
				aria-label={`${expectation.label}: ${expectation.progress}%`}
				aria-valuemax={100}
				aria-valuemin={0}
				aria-valuenow={expectation.progress}
				className="mt-3 h-1.5 bg-muted"
				role="progressbar"
			>
				<div
					className="h-full bg-[var(--game-amber)] transition-[width] duration-300"
					style={{ width: `${expectation.progress}%` }}
				/>
			</div>
			<p className="mt-1 text-right font-mono text-muted-foreground text-xs">
				{expectation.progress}% confidence
			</p>
		</div>
	);
}

function StrategicQuestionCard({ question }: { question: StrategicQuestion }) {
	return (
		<section
			aria-labelledby="strategic-question-heading"
			className="relative mt-5 border border-[var(--game-amber)]/45 bg-[var(--game-amber)]/5 p-4 sm:p-5"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.18em]">
						Strategic question / {question.id.replaceAll("-", " ")}
					</p>
					<h3
						className="mt-2 max-w-3xl font-mono font-semibold text-base text-foreground leading-6"
						id="strategic-question-heading"
					>
						{question.prompt}
					</h3>
					<p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
						{question.context}
					</p>
				</div>
				<span className="shrink-0 border border-[var(--game-amber)]/40 px-2 py-1 font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.1em]">
					Decision preview
				</span>
			</div>
			<div className="mt-4 grid gap-2 md:grid-cols-2">
				{question.choices.map((choice) => (
					<button
						aria-disabled="true"
						className="group flex min-h-24 flex-col items-start justify-between gap-3 border border-[var(--game-amber)]/35 bg-background/45 p-3 text-left opacity-80 transition-colors hover:border-[var(--game-amber)]/70 hover:bg-[var(--game-amber)]/10"
						key={choice.id}
						onClick={() => toast("Engine support pending")}
						title="Engine support pending"
						type="button"
					>
						<span className="font-medium text-foreground text-sm">
							{choice.label}
						</span>
						<span className="text-muted-foreground text-xs leading-5">
							{choice.hint}
						</span>
						<span className="font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.1em] opacity-0 transition-opacity group-hover:opacity-100">
							Engine support pending
						</span>
					</button>
				))}
			</div>
			<p className="mt-3 text-muted-foreground text-xs leading-5">
				Choices are intentionally unavailable until the engine can record their
				immediate and strategic consequences.
			</p>
		</section>
	);
}

function buildReviewStats(state: GameState): ReviewStat[] {
	const cashFacts = factsForResource(state, "cash");
	const latestCashWeek = latestFactWeek(cashFacts);
	const burn = sum(
		cashFacts
			.filter((fact) => fact.week === latestCashWeek && fact.amount < 0)
			.map((fact) => Math.abs(fact.amount)),
	);
	const revenue = sum(
		state.reports.items
			.map((report) => report.fact)
			.filter(
				(fact): fact is Extract<Fact, { kind: "revenue" }> =>
					fact.kind === "revenue" && fact.week === latestCashWeek,
			)
			.map((fact) => fact.amount),
	);
	const hasCashHistory = cashFacts.length > 0;
	const completedNodes = state.research.nodes.filter(
		(node) => node.status === "completed",
	).length;
	const totalUsers = state.products.items.reduce(
		(total, product) => total + (product.users ?? 0),
		0,
	);
	const operatingProducts = state.products.items.filter(
		(product) => product.status === "operating",
	).length;
	const researchFacts = state.reports.items
		.map((report) => report.fact)
		.filter(
			(fact): fact is Extract<Fact, { kind: "research_completed" }> =>
				fact.kind === "research_completed",
		);

	return [
		{
			id: "cash",
			label: "Cash / burn estimate",
			value: `$${formatNumber(state.company.cash)}`,
			detail: hasCashHistory
				? `-$${formatNumber(burn)} burn · +$${formatNumber(revenue)} revenue / wk`
				: "Weekly cash facts not yet recorded · illustrative baseline",
			trend: resourceTrend(state, "cash"),
			accent: "text-[var(--game-positive)]",
		},
		{
			id: "compute",
			label: "Compute allocation",
			value: `${formatNumber(state.compute.allocated)} / ${formatNumber(state.compute.capacity)}`,
			detail: `${formatNumber(state.compute.capacity - state.compute.allocated)} units available for the next bet`,
			trend: illustrativeTrend(state.compute.allocated),
			accent: "text-primary",
		},
		{
			id: "research",
			label: "Research completed",
			value: `${formatNumber(completedNodes)} nodes`,
			detail: `${formatNumber(state.research.nodes.length)} nodes in the current tree`,
			trend: researchTrend(state, researchFacts),
			accent: "text-[var(--game-amber)]",
		},
		{
			id: "users",
			label: "Product users",
			value: formatNumber(totalUsers),
			detail: `${formatNumber(operatingProducts)} operating product${operatingProducts === 1 ? "" : "s"} · current retained users`,
			trend: illustrativeTrend(totalUsers),
			accent: "text-primary",
		},
		{
			id: "trust",
			label: "Trust",
			value: `${formatNumber(state.company.trust)} / 100`,
			detail: "Stakeholder confidence · current engine value",
			trend: resourceTrend(state, "trust"),
			accent: "text-[var(--game-positive)]",
		},
		{
			id: "hype",
			label: "Hype",
			value: `${formatNumber(state.company.hype)} / 100`,
			detail: "Market attention · current engine value",
			trend: resourceTrend(state, "hype"),
			accent: "text-[var(--game-negative)]",
		},
	];
}

function resourceTrend(
	state: GameState,
	resource: "cash" | "trust" | "hype",
): Trend {
	const facts = factsForResource(state, resource);
	const current = state.company[resource];
	if (facts.length === 0) return illustrativeTrend(current);

	const changesByWeek = new Map<number, number>();
	for (const fact of facts) {
		changesByWeek.set(
			fact.week,
			(changesByWeek.get(fact.week) ?? 0) + fact.amount,
		);
	}
	const historicalTotal = facts.reduce((total, fact) => total + fact.amount, 0);
	let value = current - historicalTotal;
	const firstWeek = Math.min(...changesByWeek.keys());
	const lastWeek = Math.max(state.meta.week, firstWeek);
	const points: number[] = [];
	for (let week = firstWeek; week <= lastWeek; week += 1) {
		value += changesByWeek.get(week) ?? 0;
		points.push(value);
	}
	return {
		points: points.slice(-MAX_HISTORY_POINTS),
		illustrative: false,
	};
}

function researchTrend(
	state: GameState,
	facts: readonly Extract<Fact, { kind: "research_completed" }>[],
): Trend {
	const current = state.research.nodes.filter(
		(node) => node.status === "completed",
	).length;
	if (facts.length === 0) return illustrativeTrend(current);
	const byWeek = new Map<number, number>();
	for (const fact of facts) {
		byWeek.set(fact.week, (byWeek.get(fact.week) ?? 0) + 1);
	}
	let value = current - facts.length;
	const firstWeek = Math.min(...byWeek.keys());
	const lastWeek = Math.max(state.meta.week, firstWeek);
	const points: number[] = [];
	for (let week = firstWeek; week <= lastWeek; week += 1) {
		value += byWeek.get(week) ?? 0;
		points.push(value);
	}
	return { points: points.slice(-MAX_HISTORY_POINTS), illustrative: false };
}

function illustrativeTrend(value: number): Trend {
	return {
		points: Array.from({ length: MAX_HISTORY_POINTS }, () => value),
		illustrative: true,
	};
}

function factsForResource(
	state: GameState,
	resource: "cash" | "trust" | "hype",
): Extract<Fact, { kind: "resource_changed" }>[] {
	return state.reports.items
		.map((report) => report.fact)
		.filter(
			(fact): fact is Extract<Fact, { kind: "resource_changed" }> =>
				fact.kind === "resource_changed" && fact.resource === resource,
		);
}

function latestFactWeek(facts: readonly { week: number }[]): number {
	return facts.reduce((latest, fact) => Math.max(latest, fact.week), 0);
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

function quarterForWeek(week: number): number {
	return Math.min(6, Math.max(1, Math.ceil(week / 13)));
}
