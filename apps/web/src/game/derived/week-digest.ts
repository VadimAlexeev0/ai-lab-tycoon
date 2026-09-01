import {
	type Fact,
	type GameState,
	type ResourceBarSummary,
	selectResourceBar,
} from "@ai-lab-tycoon/engine";

import {
	type FactEntityField,
	resolveFactLabels,
	summarizeResearchParadigmSelection,
	summarizeResearchPublicationResolution,
} from "./labels";

export type LaunchFact = Extract<Fact, { kind: "product_launched" }>;
export type ProductResumeFact = Extract<Fact, { kind: "product_resumed" }>;
export type TrainingCompletionFact = Extract<Fact, { kind: "model_trained" }>;
export type EvaluationFact = Extract<Fact, { kind: "evaluation_completed" }>;
export type IncidentFact = Extract<
	Fact,
	{ kind: "incident_occurred" | "incident_resolved" }
>;
export type FundingEventFact = Extract<Fact, { kind: "funding_resolved" }>;
export type ProjectCompletionFact = Extract<
	Fact,
	{ kind: "project_completed" }
>;
export type ResearchSparkDiscoveryFact = Extract<
	Fact,
	{ kind: "research_spark_discovered" }
>;
export type ParadigmSelectionFact = Extract<
	Fact,
	{ kind: "paradigm_selected" }
>;
export type ResearchPublicationResolutionFact = Extract<
	Fact,
	{ kind: "research_publication_resolved" }
>;
export type ServingThrottleFact = Extract<Fact, { kind: "serving_throttled" }>;
export type TrainingStarvationFact = Extract<
	Fact,
	{ kind: "training_starved" }
>;

/**
 * The public, report-backed events that happened in a single engine week.
 *
 * Events deliberately retain the engine fact shape. This keeps the UI from
 * inventing a second event model and means new report consumers can use the
 * same identifiers as the engine and route actions.
 */
export type WeekDigest = {
	week: number;
	facts: Fact[];
	launches: LaunchFact[];
	resumes: ProductResumeFact[];
	trainingCompletions: TrainingCompletionFact[];
	evaluations: EvaluationFact[];
	incidents: IncidentFact[];
	fundingEvents: FundingEventFact[];
	projectCompletions: ProjectCompletionFact[];
	sparkDiscoveries: ResearchSparkDiscoveryFact[];
	paradigmSelections: ParadigmSelectionFact[];
	publicationResolutions: ResearchPublicationResolutionFact[];
	servingThrottles: ServingThrottleFact[];
	trainingStarvations: TrainingStarvationFact[];
};

export type ResourceDeltas = {
	cash: number;
	compute: {
		capacity: number;
		allocated: number;
		trainingDemand: number;
		servingDemand: number;
	};
	insight: number;
	trust: number;
	hype: number;
};

/**
 * Build the event portion of a digest from retained reports for the current
 * state week. The previous state is used only to make the week boundary
 * explicit; event history remains owned by the engine's report log.
 */
export function deriveWeekDigest(
	previous: GameState | null,
	current: GameState,
): WeekDigest {
	const week = current.meta.week;
	const previousWeek = previous?.meta.week;
	const hasCurrentWeekReports = current.reports.items.some(
		(report) => report.fact.week === week,
	);
	const usePreviousWeekReports =
		previousWeek !== undefined &&
		(week === previousWeek + 1 || week < previousWeek);
	const reportWeek =
		!hasCurrentWeekReports && usePreviousWeekReports ? previousWeek : week;
	const facts = current.reports.items
		.filter((report) => report.fact.week === reportWeek)
		.map((report) => report.fact);

	return {
		week,
		facts,
		launches: factsOfKind(facts, "product_launched"),
		resumes: factsOfKind(facts, "product_resumed"),
		trainingCompletions: factsOfKind(facts, "model_trained"),
		evaluations: factsOfKind(facts, "evaluation_completed"),
		incidents: facts.filter(
			(fact): fact is IncidentFact =>
				fact.kind === "incident_occurred" || fact.kind === "incident_resolved",
		),
		fundingEvents: factsOfKind(facts, "funding_resolved"),
		projectCompletions: factsOfKind(facts, "project_completed"),
		sparkDiscoveries: factsOfKind(facts, "research_spark_discovered"),
		paradigmSelections: factsOfKind(facts, "paradigm_selected"),
		publicationResolutions: factsOfKind(facts, "research_publication_resolved"),
		servingThrottles: factsOfKind(facts, "serving_throttled"),
		trainingStarvations: factsOfKind(facts, "training_starved"),
	};
}

/** Compare the public resource projections without reading engine internals. */
export function diffResourceBar(
	previous: GameState,
	current: GameState,
): ResourceDeltas {
	return subtractResourceBars(
		selectResourceBar(current),
		selectResourceBar(previous),
	);
}

export function emptyResourceDeltas(): ResourceDeltas {
	return {
		cash: 0,
		compute: {
			capacity: 0,
			allocated: 0,
			trainingDemand: 0,
			servingDemand: 0,
		},
		insight: 0,
		trust: 0,
		hype: 0,
	};
}

/** Create a compact, human-readable line for live announcements and cards. */
export function summarizeWeekDigest(
	digest: WeekDigest,
	deltas: ResourceDeltas = emptyResourceDeltas(),
	state?: GameState,
): string {
	const eventLabels = [
		...digest.launches.map(
			(fact) => `${factLabel(state, fact, "productId")} launched`,
		),
		...digest.resumes.map(
			(fact) => `${factLabel(state, fact, "productId")} resumed`,
		),
		...digest.incidents.map((fact) =>
			fact.kind === "incident_resolved"
				? `${humanize(fact.incident)} contained`
				: `${humanize(fact.incident)} incident reported`,
		),
		...digest.trainingCompletions.map(
			(fact) => `${factLabel(state, fact, "modelId")} trained`,
		),
		...digest.evaluations.map(
			(fact) => `${factLabel(state, fact, "modelId")} evaluated`,
		),
		...digest.fundingEvents.map(
			(fact) =>
				`${fact.round === "series_a" ? "Series A" : "Seed"} funding ${fact.outcome}`,
		),
		...digest.projectCompletions.map(
			(fact) => `${factLabel(state, fact, "projectId")} completed`,
		),
		...digest.sparkDiscoveries.map(
			(fact) =>
				`${humanize(fact.sparkId)} discovered · ${humanize(fact.nodeId)} −${fact.discount} Insight`,
		),
		...digest.paradigmSelections.map((fact) =>
			summarizeResearchParadigmSelection(state, fact),
		),
		...digest.publicationResolutions.map((fact) =>
			summarizeResearchPublicationResolution(state, fact),
		),
	];
	const visibleEvents = eventLabels.slice(0, 3);
	if (eventLabels.length > visibleEvents.length) {
		visibleEvents.push(
			`+${eventLabels.length - visibleEvents.length} more events`,
		);
	}

	const resourceLabels = [
		deltas.cash === 0 ? null : formatSignedCurrency(deltas.cash),
		deltas.insight === 0
			? null
			: formatSignedResource(deltas.insight, "insight"),
		deltas.trust === 0 ? null : formatSignedResource(deltas.trust, "trust"),
		deltas.hype === 0 ? null : formatSignedResource(deltas.hype, "hype"),
	].filter((label): label is string => label !== null);
	const parts = [...visibleEvents, ...resourceLabels];
	return parts.length === 0
		? `Week ${digest.week}: No new activity recorded.`
		: `Week ${digest.week}: ${parts.join(" · ")}`;
}

function factLabel(
	state: GameState | undefined,
	fact: Fact,
	field: FactEntityField,
): string {
	if (state !== undefined) {
		const resolved = resolveFactLabels(state, fact)[field];
		if (resolved !== undefined) return resolved;
	}
	const value = (fact as Partial<Record<FactEntityField, string>>)[field];
	return typeof value === "string" ? humanize(value) : "Unknown";
}

function factsOfKind<K extends Fact["kind"]>(
	facts: readonly Fact[],
	kind: K,
): Extract<Fact, { kind: K }>[] {
	return facts.filter(
		(fact): fact is Extract<Fact, { kind: K }> => fact.kind === kind,
	);
}

function subtractResourceBars(
	current: ResourceBarSummary,
	previous: ResourceBarSummary,
): ResourceDeltas {
	return {
		cash: current.cash - previous.cash,
		compute: {
			capacity: current.compute.capacity - previous.compute.capacity,
			allocated: current.compute.allocated - previous.compute.allocated,
			trainingDemand:
				current.compute.trainingDemand - previous.compute.trainingDemand,
			servingDemand:
				current.compute.servingDemand - previous.compute.servingDemand,
		},
		insight: current.insight - previous.insight,
		trust: current.trust - previous.trust,
		hype: current.hype - previous.hype,
	};
}

const numberFormatter = new Intl.NumberFormat("en-US");

function formatSignedCurrency(value: number): string {
	return `${value > 0 ? "+" : "−"}$${numberFormatter.format(Math.abs(value))}`;
}

function formatSignedResource(value: number, name: string): string {
	return `${value > 0 ? "+" : "−"}${numberFormatter.format(Math.abs(value))} ${name}`;
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
