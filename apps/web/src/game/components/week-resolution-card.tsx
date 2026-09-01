import type { Fact, GameState } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import type { ReactNode } from "react";

import {
	humanizeId,
	resolveEntityLabel,
	resolveFactLabels,
	summarizeResearchEffects,
	summarizeResearchParadigmSelection,
} from "@/game/derived/labels";
import type { ResourceDeltas, WeekDigest } from "@/game/derived/week-digest";

export type WeekResolutionCardProps = {
	advanceControl?: ReactNode;
	className?: string;
	deltas?: ResourceDeltas;
	digest: WeekDigest;
	marketPulse?: ReactNode;
	state: GameState;
};

export type ResolutionResource = "cash" | "trust" | "hype" | "insight";

export type FactResourceDeltas = Record<ResolutionResource, number>;

export type ResourceAttribution = {
	amount: number;
	label: string;
};

const RESOURCE_LABELS: Record<ResolutionResource, string> = {
	cash: "Cash",
	trust: "Trust",
	hype: "Hype",
	insight: "Insight",
};

/** Show the causal record for the latest engine revision in player language. */
export default function WeekResolutionCard({
	advanceControl,
	className,
	deltas,
	digest,
	marketPulse,
	state,
}: WeekResolutionCardProps) {
	const facts = digest.facts;
	const factDeltas = resourceDeltasFromFacts(facts);
	const resolvedDeltas = mergeResourceDeltas(factDeltas, deltas, facts);
	const events = createResolutionEvents(state, facts);

	return (
		<section
			aria-labelledby="week-resolution-heading"
			className={cn("glass-pane glass-edge overflow-hidden", className)}
		>
			<header className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<p className="meta-label text-primary">Weekly resolution</p>
					<h2
						id="week-resolution-heading"
						className="mt-1 font-display font-semibold text-foreground text-lg"
					>
						Week {digest.week} resolution
					</h2>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						What changed, why it changed, and what deserves your attention next.
					</p>
				</div>
				{marketPulse ? (
					<div className="hidden min-w-0 flex-1 sm:block">{marketPulse}</div>
				) : null}
			</header>

			<div className="border-[var(--game-hairline)] border-t px-4 py-4">
				<div className="grid grid-cols-2 divide-border border-border/70 border-b sm:grid-cols-4 sm:divide-x">
					{(["cash", "trust", "hype", "insight"] as const).map((resource) => (
						<ResourceDelta
							attributions={deriveResourceAttributions(state, facts, resource)}
							delta={resolvedDeltas[resource]}
							key={resource}
							label={RESOURCE_LABELS[resource]}
						/>
					))}
				</div>

				{events.length > 0 ? (
					<div className="mt-4 space-y-2">
						<p className="meta-label text-muted-foreground">
							Recorded outcomes
						</p>
						<ul aria-label="Week resolution outcomes" className="space-y-1.5">
							{events.map((event) => (
								<li
									className="flex items-start gap-2 text-foreground text-xs leading-5"
									key={event.id}
								>
									<span
										aria-hidden="true"
										className={cn(
											"mt-2 size-1.5 shrink-0 rounded-full",
											event.tone === "positive"
												? "bg-[var(--game-positive)]"
												: event.tone === "negative"
													? "bg-[var(--game-negative)]"
													: "bg-primary",
										)}
									/>
									<span>{event.label}</span>
								</li>
							))}
						</ul>
					</div>
				) : (
					<p className="mt-4 text-muted-foreground text-xs leading-5">
						No new outcomes were recorded this week.
					</p>
				)}
			</div>

			{advanceControl ? (
				<div className="border-[var(--game-hairline)] border-t px-4 py-3">
					{advanceControl}
				</div>
			) : null}
		</section>
	);
}

function ResourceDelta({
	attributions,
	delta,
	label,
}: {
	attributions: ResourceAttribution[];
	delta: number;
	label: string;
}) {
	const tone = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
	return (
		<div
			className="min-h-24 border-border/70 px-2 py-3 first:border-b sm:min-h-28 sm:px-3 sm:first:border-b-0"
			data-resource-delta={label.toLowerCase()}
		>
			<p className="meta-label text-muted-foreground">{label}</p>
			<p
				className={cn(
					"numeric-value mt-1 font-semibold text-base",
					tone === "positive"
						? "text-[var(--game-positive)]"
						: tone === "negative"
							? "text-[var(--game-negative)]"
							: "text-muted-foreground",
				)}
			>
				{formatSigned(delta)}
			</p>
			<p className="mt-2 text-[11px] text-muted-foreground leading-4">
				{describeDelta(label, delta, attributions)}
			</p>
		</div>
	);
}

/** Sum resource facts, adding revenue only when its cash fact was not retained. */
export function resourceDeltasFromFacts(
	facts: readonly Fact[],
): FactResourceDeltas {
	const deltas: FactResourceDeltas = {
		cash: 0,
		trust: 0,
		hype: 0,
		insight: 0,
	};
	for (const fact of facts) {
		if (fact.kind !== "resource_changed") continue;
		deltas[fact.resource === "compute" ? "cash" : fact.resource] +=
			fact.resource === "compute" ? 0 : fact.amount;
	}

	for (let index = 0; index < facts.length; index += 1) {
		const fact = facts[index];
		if (fact?.kind !== "revenue") continue;
		const next = facts[index + 1];
		const hasPairedCashFact =
			next?.kind === "resource_changed" &&
			next.resource === "cash" &&
			next.amount === fact.amount;
		if (!hasPairedCashFact) deltas.cash += fact.amount;
	}
	return deltas;
}

/** Explain a resource movement using the ordered facts that caused it. */
export function deriveResourceAttributions(
	state: GameState,
	facts: readonly Fact[],
	resource: ResolutionResource,
): ResourceAttribution[] {
	const attributions: ResourceAttribution[] = [];
	let latestIncidentIndex = -1;
	let negativeCashCount = 0;
	const usedRevenueIndexes = new Set<number>();

	for (let index = 0; index < facts.length; index += 1) {
		const fact = facts[index];
		if (fact?.kind === "incident_occurred") {
			latestIncidentIndex = index;
			continue;
		}
		if (
			fact?.kind !== "resource_changed" ||
			fact.resource !== resource ||
			fact.amount === 0
		) {
			continue;
		}

		let label: string;
		if (resource === "cash") {
			const revenueMatch = findRevenueForCashFact(facts, index, fact.amount);
			if (revenueMatch !== undefined) {
				usedRevenueIndexes.add(revenueMatch.index);
				label = `${
					resolveFactLabels(state, revenueMatch.fact).productId ??
					humanizeId(revenueMatch.fact.productId)
				} revenue`;
			} else if (fact.amount < 0 && latestIncidentIndex >= 0) {
				label = "incident response";
				negativeCashCount += 1;
			} else if (fact.amount < 0 && negativeCashCount === 0) {
				label = "upkeep";
				negativeCashCount += 1;
			} else if (fact.amount < 0) {
				label = "model work";
				negativeCashCount += 1;
			} else {
				label = "other cash flow";
			}
		} else if (resource === "insight") {
			label = fact.amount < 0 ? "research investment" : "research work";
		} else if (latestIncidentIndex >= 0) {
			label = "incident response";
		} else {
			label = resource === "trust" ? "operating discipline" : "market momentum";
		}
		attributions.push({ amount: fact.amount, label });
	}

	for (let index = 0; index < facts.length; index += 1) {
		const fact = facts[index];
		if (
			fact?.kind !== "revenue" ||
			usedRevenueIndexes.has(index) ||
			findRevenueForCashFact(facts, index + 1, fact.amount) !== undefined
		) {
			continue;
		}
		attributions.push({
			amount: fact.amount,
			label: `${
				resolveFactLabels(state, fact).productId ?? humanizeId(fact.productId)
			} revenue`,
		});
	}

	return combineAttributions(attributions);
}

function mergeResourceDeltas(
	factDeltas: FactResourceDeltas,
	fallback: ResourceDeltas | undefined,
	facts: readonly Fact[],
): FactResourceDeltas {
	const hasFactFor = (resource: ResolutionResource) =>
		facts.some(
			(fact) =>
				(fact.kind === "resource_changed" && fact.resource === resource) ||
				(resource === "cash" && fact.kind === "revenue"),
		);
	return {
		cash: hasFactFor("cash") ? factDeltas.cash : (fallback?.cash ?? 0),
		trust: hasFactFor("trust") ? factDeltas.trust : (fallback?.trust ?? 0),
		hype: hasFactFor("hype") ? factDeltas.hype : (fallback?.hype ?? 0),
		insight: hasFactFor("insight")
			? factDeltas.insight
			: (fallback?.insight ?? 0),
	};
}

function findRevenueForCashFact(
	facts: readonly Fact[],
	cashIndex: number,
	amount: number,
): { fact: Extract<Fact, { kind: "revenue" }>; index: number } | undefined {
	if (amount <= 0) return undefined;
	const previous = facts[cashIndex - 1];
	if (previous?.kind === "revenue" && previous.amount === amount) {
		return { fact: previous, index: cashIndex - 1 };
	}
	return undefined;
}

function combineAttributions(
	attributions: readonly ResourceAttribution[],
): ResourceAttribution[] {
	const combined = new Map<string, number>();
	for (const attribution of attributions) {
		combined.set(
			attribution.label,
			(combined.get(attribution.label) ?? 0) + attribution.amount,
		);
	}
	return [...combined].flatMap(([label, amount]) =>
		amount === 0 ? [] : [{ amount, label }],
	);
}

function describeDelta(
	label: string,
	delta: number,
	attributions: readonly ResourceAttribution[],
): string {
	if (delta === 0) return `${label} held steady.`;
	const movement =
		delta < 0
			? `${label} fell by ${formatNumber(Math.abs(delta))}`
			: `${label} rose by ${formatNumber(delta)}`;
	if (attributions.length === 0) return `${movement}.`;
	return `${movement}: ${attributions
		.map((attribution) => formatAttribution(attribution, delta))
		.join(", ")}.`;
}

function formatAttribution(
	attribution: ResourceAttribution,
	netDelta: number,
): string {
	const amount = formatNumber(Math.abs(attribution.amount));
	const sign =
		(attribution.amount > 0 && netDelta < 0) ||
		(attribution.amount < 0 && netDelta > 0)
			? attribution.amount > 0
				? "+"
				: "−"
			: "";
	return `${sign}${amount} ${attribution.label}`;
}

function formatSigned(value: number): string {
	return value > 0
		? `+${formatNumber(value)}`
		: value < 0
			? `−${formatNumber(Math.abs(value))}`
			: "0";
}

function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

type ResolutionEvent = {
	id: string;
	label: string;
	tone: "positive" | "negative" | "neutral";
};

function createResolutionEvents(
	state: GameState,
	facts: readonly Fact[],
): ResolutionEvent[] {
	const events: ResolutionEvent[] = [];
	for (const [index, fact] of facts.entries()) {
		const event = resolutionEvent(state, fact, index);
		if (event !== null) events.push(event);
	}
	const visible = events.slice(0, 8);
	if (events.length > visible.length) {
		visible.push({
			id: "more-events",
			label: `${events.length - visible.length} more outcomes recorded`,
			tone: "neutral",
		});
	}
	return visible;
}

function resolutionEvent(
	state: GameState,
	fact: Fact,
	index: number,
): ResolutionEvent | null {
	const labels = resolveFactLabels(state, fact);
	switch (fact.kind) {
		case "resource_changed":
			return null;
		case "project_progressed":
			return {
				id: `project-progress-${fact.projectId}-${index}`,
				label: `${labels.projectId ?? humanizeId(fact.projectId)} progressed by ${fact.amount}.`,
				tone: "neutral",
			};
		case "project_completed":
			return {
				id: `project-complete-${fact.projectId}-${index}`,
				label: `${labels.projectId ?? humanizeId(fact.projectId)} completed.`,
				tone: "positive",
			};
		case "research_completed": {
			const effectSummary = summarizeResearchEffects(fact.effects);
			return {
				id: `research-${fact.nodeId}-${index}`,
				label: `${labels.nodeId ?? humanizeId(fact.nodeId)} research completed${effectSummary ? ` — ${effectSummary}.` : "."}`,
				tone: "positive",
			};
		}
		case "research_spark_discovered":
			return {
				id: `research-spark-${fact.sparkId}-${index}`,
				label: `Research Spark ${humanizeId(fact.sparkId)} discovered — ${humanizeId(fact.nodeId)} costs ${fact.discount} fewer Insight.`,
				tone: "positive",
			};
		case "paradigm_selected":
			return {
				id: `paradigm-${fact.paradigmId}-${index}`,
				label: summarizeResearchParadigmSelection(state, fact),
				tone: "positive",
			};
		case "model_trained":
			return {
				id: `model-trained-${fact.modelId}-${index}`,
				label: `${labels.modelId ?? humanizeId(fact.modelId)} finished training.`,
				tone: "positive",
			};
		case "evaluation_completed":
			return {
				id: `evaluation-${fact.modelId}-${index}`,
				label: `${labels.modelId ?? humanizeId(fact.modelId)} completed ${humanizeId(fact.evaluation)} evaluation (${fact.coverage}% coverage).`,
				tone: "positive",
			};
		case "product_launched":
			return {
				id: `product-launch-${fact.productId}-${index}`,
				label: `${labels.productId ?? humanizeId(fact.productId)} launched.`,
				tone: "positive",
			};
		case "product_resumed":
			return {
				id: `product-resume-${fact.productId}-${index}`,
				label: `${labels.productId ?? humanizeId(fact.productId)} resumed on ${humanizeId(fact.channel)}.`,
				tone: "positive",
			};
		case "revenue":
			return {
				id: `revenue-${fact.productId}-${index}`,
				label: `${labels.productId ?? humanizeId(fact.productId)} generated ${formatNumber(fact.amount)} revenue.`,
				tone: "positive",
			};
		case "serving_throttled":
			return {
				id: `serving-throttled-${fact.productId}-${index}`,
				label: `${resolveEntityLabel(state, "product", fact.productId)} serving throttled: ${formatNumber(fact.unmetDemand)} demand unmet.`,
				tone: "negative",
			};
		case "training_starved":
			return {
				id: `training-starved-${index}`,
				label: `Training paused by compute pressure: capacity ${formatNumber(fact.capacity)}, serving demand ${formatNumber(fact.servingDemand)}, evaluation demand ${formatNumber(fact.evaluationDemand)}, training demand ${formatNumber(fact.trainingDemand)}.`,
				tone: "negative",
			};
		case "rival_progressed":
			return {
				id: `rival-progress-${fact.rivalId}-${index}`,
				label: `${labels.rivalId ?? humanizeId(fact.rivalId)} progressed by ${fact.amount}.`,
				tone: "negative",
			};
		case "rival_milestone":
			return {
				id: `rival-milestone-${fact.rivalId}-${index}`,
				label: `${labels.rivalId ?? humanizeId(fact.rivalId)} reached ${humanizeId(fact.milestone)}.`,
				tone: "negative",
			};
		case "funding_resolved":
			return {
				id: `funding-${fact.round}-${index}`,
				label: `${humanizeId(fact.round)} funding ${fact.outcome}.`,
				tone: fact.outcome === "accepted" ? "positive" : "negative",
			};
		case "incident_occurred":
			return {
				id: `incident-${fact.incident}-${index}`,
				label: `${humanizeId(fact.incident)} affected ${relatedEntityLabel(state, fact.affectedEntity)}.`,
				tone: "negative",
			};
		case "incident_resolved":
			return {
				id: `incident-resolved-${fact.incidentId}-${index}`,
				label: `${humanizeId(fact.incident)} contained with ${humanizeId(fact.response)}.`,
				tone: "positive",
			};
		case "milestone_reached":
			return {
				id: `milestone-${fact.milestone}-${index}`,
				label: `Milestone reached: ${humanizeId(fact.milestone)}.`,
				tone: "positive",
			};
		case "terminal":
			return {
				id: `terminal-${index}`,
				label: `Run ended: ${humanizeId(fact.reason)}.`,
				tone: "negative",
			};
	}
}

function relatedEntityLabel(state: GameState, value: string): string {
	if (value === "company") return "your lab";
	for (const kind of [
		"product",
		"project",
		"model",
		"rival",
		"node",
	] as const) {
		const exists =
			kind === "product"
				? state.products.items.some((item) => item.id === value)
				: kind === "project"
					? state.projects.items.some((item) => item.id === value)
					: kind === "model"
						? state.models.items.some((item) => item.id === value)
						: kind === "rival"
							? state.rivals.items.some((item) => item.id === value)
							: state.research.nodes.some((item) => item.id === value);
		if (exists) return resolveEntityLabel(state, kind, value);
	}
	return humanizeId(value);
}

const numberFormatter = new Intl.NumberFormat("en-US");
