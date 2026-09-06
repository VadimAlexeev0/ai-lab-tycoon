import { BALANCE, PRODUCT_PRESSURE_BALANCE } from "../data/balance.js";
import {
	DATA_PROVENANCES,
	getDataSourceDefinition,
} from "../data/data-sources.js";
import {
	type IncidentCondition,
	incidentDefinition,
} from "../data/incidents.js";
import {
	MODEL_FAMILY_IDS,
	type ModelFamilyId,
} from "../data/model-families.js";
import type { ResearchParadigmId } from "../data/research/paradigms.js";
import {
	assertResearchEffects,
	getResearchDefinition,
	isResearchParadigmId,
	type ResearchEffect,
} from "../data/research.js";
import { getRivalStrategyAction } from "../data/rivals.js";
import type { KnowledgeFreshnessStatus } from "../knowledge-cutoff.js";
import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertNonNegativeInteger,
	assertNullableString,
	assertObject,
	assertPositiveInteger,
	assertString,
} from "../validation.js";
import type { CrisisChoice, CrisisKind, IncidentType } from "./decisions.js";
import type { FundingGateFactors, FundingRound } from "./funding.js";
import type { ProductChannel } from "./products.js";
import type { TerminalContributor } from "./terminal.js";

export type ResourceName = "cash" | "compute" | "insight" | "trust" | "hype";

const FACT_KINDS = [
	"resource_changed",
	"project_progressed",
	"project_completed",
	"research_completed",
	"research_publication_resolved",
	"paradigm_selected",
	"research_spark_discovered",
	"model_trained",
	"knowledge_cutoff_recorded",
	"model_refresh_started",
	"model_refreshed",
	"evaluation_completed",
	"product_launched",
	"product_resumed",
	"product_pressure",
	"product_retired",
	"data_acquired",
	"data_stale_warning",
	"model_staleness",
	"synthetic_data_overuse",
	"revenue",
	"serving_throttled",
	"compute_conflict",
	"training_starved",
	"rival_progressed",
	"rival_milestone",
	"rival_published",
	"rival_launched",
	"funding_resolved",
	"incident_occurred",
	"incident_resolved",
	"risk_memory_updated",
	"crisis_opened",
	"crisis_resolved",
	"milestone_reached",
	"terminal",
] as const;
const RESOURCES = ["cash", "compute", "insight", "trust", "hype"] as const;
const PRODUCT_CHANNELS = [
	"chat",
	"developer_api",
	"enterprise",
] as const satisfies readonly ProductChannel[];
const FUNDING_ROUNDS = [
	"seed",
	"series_a",
] as const satisfies readonly FundingRound[];
const INCIDENT_TYPES = [
	"outage",
	"latency_degradation",
	"quality_safety_scandal",
	"compute_cost_overrun",
	"enterprise_sla_breach",
	"data_privacy_incident",
] as const satisfies readonly IncidentType[];
const REPORT_PRIORITIES = ["blocking", "important", "informational"] as const;

export type Fact =
	| {
			kind: "resource_changed";
			resource: ResourceName;
			amount: number;
			week: number;
	  }
	| {
			kind: "project_progressed";
			projectId: string;
			amount: number;
			week: number;
	  }
	| {
			kind: "project_completed";
			projectId: string;
			week: number;
	  }
	| {
			kind: "research_completed";
			nodeId: string;
			effects?: readonly ResearchEffect[];
			week: number;
	  }
	| {
			kind: "research_publication_resolved";
			nodeId: string;
			outcome: "publish" | "hoard";
			week: number;
	  }
	| {
			kind: "paradigm_selected";
			paradigmId: ResearchParadigmId;
			era: "text";
			week: number;
	  }
	| {
			kind: "research_spark_discovered";
			sparkId: string;
			nodeId: string;
			discount: number;
			trigger: "serving_throttled";
			week: number;
	  }
	| {
			kind: "model_trained";
			modelId: string;
			week: number;
	  }
	| {
			kind: "knowledge_cutoff_recorded";
			modelId: string;
			knowledgeCutoff: number;
			knowledgeFreshness: number;
			week: number;
	  }
	| {
			kind: "model_refresh_started";
			modelId: string;
			projectId: string;
			dataAmount: number;
			compute: number;
			week: number;
	  }
	| {
			kind: "model_refreshed";
			modelId: string;
			projectId: string;
			knowledgeCutoff: number;
			knowledgeFreshness: number;
			week: number;
	  }
	| {
			kind: "evaluation_completed";
			modelId: string;
			evaluation: "capability" | "safety_reliability";
			coverage: number;
			week: number;
	  }
	| {
			kind: "product_launched";
			productId: string;
			channel: ProductChannel;
			week: number;
	  }
	| {
			kind: "product_resumed";
			productId: string;
			channel: ProductChannel;
			week: number;
	  }
	| {
			kind: "product_pressure";
			productId: string;
			channel: ProductChannel;
			price: number;
			freshnessStatus: KnowledgeFreshnessStatus;
			quality: number;
			reliability: number;
			latency: number;
			satisfaction: number;
			churnRate: number;
			fulfilledDemand: number;
			servedShare: number;
			churnedUsers: number;
			newUsers: number;
			margin: number;
			week: number;
	  }
	| {
			kind: "product_retired";
			productId: string;
			modelId: string;
			channel: ProductChannel;
			lostUsers: number;
			releasedCompute: number;
			trustPenalty: number;
			hypePenalty: number;
			week: number;
	  }
	| {
			kind: "data_acquired";
			dataId: string;
			sourceId: string;
			provenance: (typeof DATA_PROVENANCES)[number];
			quantity: number;
			cost: number;
			availableFromWeek: number;
			rightsRisk: number;
			week: number;
	  }
	| {
			kind: "data_stale_warning";
			dataIds: readonly string[];
			threshold: number;
			week: number;
	  }
	| {
			kind: "model_staleness";
			modelId: string;
			productId: string;
			status: KnowledgeFreshnessStatus;
			ageWeeks: number;
			knowledgeCutoff: number;
			knowledgeFreshness: number;
			demandFactor: number;
			qualityFactor: number;
			week: number;
	  }
	| {
			kind: "synthetic_data_overuse";
			modelId: string;
			syntheticAmount: number;
			totalAmount: number;
			qualityPenalty: number;
			debtAdded: number;
			week: number;
	  }
	| {
			kind: "revenue";
			productId: string;
			channel: ProductChannel;
			amount: number;
			effectiveQuality: number;
			/** Integer percentage of current serving demand delivered (0..100). */
			servedShare?: number;
			week: number;
	  }
	| {
			kind: "serving_throttled";
			productId: string;
			week: number;
			unmetDemand: number;
	  }
	| {
			kind: "compute_conflict";
			week: number;
			capacity: number;
			servingDemand: number;
			trainingDemand: number;
			evaluationDemand: number;
			viral: boolean;
			choice: "serving_throttled" | "training_starved";
	  }
	| {
			kind: "training_starved";
			week: number;
			capacity: number;
			servingDemand: number;
			evaluationDemand: number;
			trainingDemand: number;
	  }
	| {
			kind: "rival_progressed";
			rivalId: string;
			amount: number;
			week: number;
	  }
	| {
			kind: "rival_milestone";
			rivalId: string;
			milestone: string;
			week: number;
	  }
	| {
			kind: "rival_published";
			rivalId: string;
			actionId: string;
			nodeId: string;
			commandId: string;
			threshold: number;
			progress: number;
			pressure: number;
			week: number;
	  }
	| {
			kind: "rival_launched";
			rivalId: string;
			actionId: string;
			familyId: ModelFamilyId;
			commandId: string;
			threshold: number;
			progress: number;
			pressure: number;
			week: number;
	  }
	| {
			kind: "funding_resolved";
			round: FundingRound;
			outcome: "accepted" | "declined";
			/** Gate measurements captured at the moment the offer was resolved. */
			factors?: FundingGateFactors;
			week: number;
	  }
	| {
			kind: "incident_occurred";
			incident: IncidentType;
			condition: IncidentCondition;
			affectedEntity: string;
			metric: string;
			measurement: number;
			threshold: number;
			severity: number;
			riskMemoryId?: string;
			recurrenceCount?: number;
			unresolvedRecurrenceCount?: number;
			unresolved?: boolean;
			riskSeverity?: number;
			week: number;
	  }
	| {
			kind: "incident_resolved";
			incidentId: string;
			incident: IncidentType;
			response: "repair" | "reduce_scope" | "disclose";
			riskMemoryId?: string;
			week: number;
	  }
	| {
			kind: "risk_memory_updated";
			riskMemoryId: string;
			name: string;
			incident: IncidentType;
			condition: IncidentCondition;
			severity: number;
			affectedProductId: string | null;
			affectedModelId: string | null;
			unresolved: boolean;
			recurrenceCount: number;
			unresolvedRecurrenceCount: number;
			lastOccurrenceWeek: number;
			week: number;
	  }
	| {
			kind: "crisis_opened";
			crisisId: string;
			riskMemoryId: string;
			crisis: CrisisKind;
			week: number;
	  }
	| {
			kind: "crisis_resolved";
			crisisId: string;
			riskMemoryId: string;
			choice: CrisisChoice;
			week: number;
	  }
	| {
			kind: "milestone_reached";
			milestone: "first_multimodal_launch";
			week: number;
	  }
	| {
			kind: "terminal";
			reason: "cash_depleted" | "trust_collapsed";
			contributors: readonly TerminalContributor[];
			week: number;
	  };

export type ReportPriority = "blocking" | "important" | "informational";

export type Report = {
	id: string;
	priority: ReportPriority;
	fact: Fact;
	acknowledged: boolean;
};

export type ReportsState = {
	items: Report[];
	/** Number of reports generated over the lifetime of the run. */
	totalCount: number;
};

// ponytail: The 200-report ceiling is temporary; upgrade to paged report
// archives when the UI needs complete history without inflating saved state.
export const REPORT_RETENTION_LIMIT = 200;

export function createReportsState(
	items: Report[] = [],
	totalCount = items.length,
): ReportsState {
	return {
		items: items.slice(-REPORT_RETENTION_LIMIT).map((report) => ({
			...report,
			fact: cloneFact(report.fact),
		})),
		totalCount: Math.max(totalCount, items.length),
	};
}

export function cloneFact(fact: Fact): Fact {
	switch (fact.kind) {
		case "terminal":
			return {
				...fact,
				contributors: fact.contributors.map((contributor) => ({
					...contributor,
				})),
			};
		case "funding_resolved":
			return fact.factors === undefined
				? { ...fact }
				: { ...fact, factors: { ...fact.factors } };
		case "research_completed":
			return fact.effects === undefined
				? { ...fact }
				: {
						...fact,
						effects: fact.effects.map((effect) => ({ ...effect })),
					};
		case "data_stale_warning":
			return { ...fact, dataIds: [...fact.dataIds] };
		default:
			return { ...fact };
	}
}

export function assertReportsState(
	value: unknown,
): asserts value is ReportsState {
	assertExactObject(value, ["items", "totalCount"], "reports");
	assertArray(value.items, "Reports items");
	assertNonNegativeInteger(value.totalCount, "Reports total count");
	if (value.items.length > REPORT_RETENTION_LIMIT) {
		throw new Error(
			`Reports items must contain at most ${REPORT_RETENTION_LIMIT} reports`,
		);
	}
	if (value.totalCount < value.items.length) {
		throw new Error("Reports total count cannot be less than retained reports");
	}

	const ids = new Set<string>();
	for (const item of value.items) {
		assertExactObject(
			item,
			["id", "priority", "fact", "acknowledged"],
			"report",
		);
		assertIdentifier(item.id, "Report id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate report id: ${item.id}`);
		}
		ids.add(item.id);
		assertEnum(item.priority, REPORT_PRIORITIES, "Report priority");
		assertBoolean(item.acknowledged, "Report acknowledged");
		assertFact(item.fact);
	}
}

function assertFundingGateFactors(
	value: unknown,
): asserts value is FundingGateFactors {
	assertExactObject(
		value,
		["hype", "trust", "modelScore", "operatingProducts", "cumulativeRevenue"],
		"Funding gate factors",
	);
	assertNonNegativeInteger(value.hype, "Funding factor hype");
	assertNonNegativeInteger(value.trust, "Funding factor trust");
	assertNonNegativeInteger(value.modelScore, "Funding factor model score");
	assertNonNegativeInteger(
		value.operatingProducts,
		"Funding factor operating products",
	);
	assertNonNegativeInteger(
		value.cumulativeRevenue,
		"Funding factor cumulative revenue",
	);
}

export function assertFact(value: unknown): asserts value is Fact {
	assertObject(value, "fact");
	assertEnum(value.kind, FACT_KINDS, "Fact kind");
	const kind = value.kind;

	switch (kind) {
		case "resource_changed":
			assertExactObject(
				value,
				["kind", "resource", "amount", "week"],
				"resource changed fact",
			);
			assertEnum(value.resource, RESOURCES, "Fact resource");
			assertInteger(value.amount, "Resource fact amount");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "project_progressed":
			assertExactObject(
				value,
				["kind", "projectId", "amount", "week"],
				"project progressed fact",
			);
			assertIdentifier(value.projectId, "Project progress fact id");
			assertInteger(value.amount, "Project progress fact amount");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "project_completed":
			assertExactObject(
				value,
				["kind", "projectId", "week"],
				"project completed fact",
			);
			assertIdentifier(value.projectId, "Completed project id");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "research_completed":
			assertExactObject(
				value,
				Object.hasOwn(value, "effects")
					? ["kind", "nodeId", "effects", "week"]
					: ["kind", "nodeId", "week"],
				"research completed fact",
			);
			assertIdentifier(value.nodeId, "Completed research node id");
			if (Object.hasOwn(value, "effects")) {
				assertResearchEffects(value.effects, "Research completion effects");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "research_publication_resolved": {
			assertExactObject(
				value,
				["kind", "nodeId", "outcome", "week"],
				"research publication resolved fact",
			);
			assertIdentifier(value.nodeId, "Published research node id");
			const definition = getResearchDefinition(value.nodeId);
			if (definition === undefined) {
				throw new Error(
					`Publication fact references an unknown research node: ${value.nodeId}`,
				);
			}
			if (definition.publishable !== true) {
				throw new Error(
					`Publication fact references a non-publishable research node: ${value.nodeId}`,
				);
			}
			assertEnum(
				value.outcome,
				["publish", "hoard"],
				"Research publication outcome",
			);
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "paradigm_selected":
			assertExactObject(
				value,
				["kind", "paradigmId", "era", "week"],
				"paradigm selected fact",
			);
			if (!isResearchParadigmId(value.paradigmId)) {
				throw new Error(
					`Selected research paradigm id is unsupported: ${String(value.paradigmId)}`,
				);
			}
			assertEnum(value.era, ["text"], "Selected paradigm era");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "research_spark_discovered":
			assertExactObject(
				value,
				["kind", "sparkId", "nodeId", "discount", "trigger", "week"],
				"research Spark discovered fact",
			);
			assertIdentifier(value.sparkId, "Discovered research Spark id");
			assertIdentifier(value.nodeId, "Discovered research Spark node id");
			assertPositiveInteger(value.discount, "Research Spark discount");
			assertEnum(
				value.trigger,
				["serving_throttled"],
				"Research Spark trigger",
			);
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "model_trained":
			assertExactObject(
				value,
				["kind", "modelId", "week"],
				"model trained fact",
			);
			assertIdentifier(value.modelId, "Trained model id");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "knowledge_cutoff_recorded":
			assertExactObject(
				value,
				["kind", "modelId", "knowledgeCutoff", "knowledgeFreshness", "week"],
				"knowledge cutoff recorded fact",
			);
			assertIdentifier(value.modelId, "Knowledge cutoff model id");
			assertPositiveInteger(
				value.knowledgeCutoff,
				"Knowledge cutoff fact cutoff",
			);
			assertNonNegativeInteger(
				value.knowledgeFreshness,
				"Knowledge cutoff fact freshness",
			);
			if (value.knowledgeFreshness > 100) {
				throw new Error("Knowledge cutoff fact freshness must be at most 100");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "model_refresh_started":
			assertExactObject(
				value,
				["kind", "modelId", "projectId", "dataAmount", "compute", "week"],
				"model refresh started fact",
			);
			assertIdentifier(value.modelId, "Refresh started model id");
			assertIdentifier(value.projectId, "Refresh started project id");
			assertPositiveInteger(value.dataAmount, "Refresh data amount");
			assertPositiveInteger(value.compute, "Refresh compute amount");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "model_refreshed":
			assertExactObject(
				value,
				[
					"kind",
					"modelId",
					"projectId",
					"knowledgeCutoff",
					"knowledgeFreshness",
					"week",
				],
				"model refreshed fact",
			);
			assertIdentifier(value.modelId, "Refreshed model id");
			assertIdentifier(value.projectId, "Refreshed project id");
			assertPositiveInteger(
				value.knowledgeCutoff,
				"Refreshed knowledge cutoff",
			);
			assertNonNegativeInteger(
				value.knowledgeFreshness,
				"Refreshed knowledge freshness",
			);
			if (value.knowledgeFreshness > 100) {
				throw new Error("Refreshed knowledge freshness must be at most 100");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "evaluation_completed":
			assertExactObject(
				value,
				["kind", "modelId", "evaluation", "coverage", "week"],
				"evaluation completed fact",
			);
			assertIdentifier(value.modelId, "Evaluated model id");
			assertEnum(
				value.evaluation,
				["capability", "safety_reliability"],
				"Evaluation fact kind",
			);
			assertInteger(value.coverage, "Evaluation fact coverage");
			if (value.coverage < 0 || value.coverage > 100) {
				throw new Error("Evaluation fact coverage must be between 0 and 100");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "product_launched":
			assertExactObject(
				value,
				["kind", "productId", "channel", "week"],
				"product launched fact",
			);
			assertIdentifier(value.productId, "Launched product id");
			assertEnum(value.channel, PRODUCT_CHANNELS, "Launched product channel");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "product_resumed":
			assertExactObject(
				value,
				["kind", "productId", "channel", "week"],
				"product resumed fact",
			);
			assertIdentifier(value.productId, "Resumed product id");
			assertEnum(value.channel, PRODUCT_CHANNELS, "Resumed product channel");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "product_pressure": {
			assertExactObject(
				value,
				[
					"kind",
					"productId",
					"channel",
					"price",
					"freshnessStatus",
					"quality",
					"reliability",
					"latency",
					"satisfaction",
					"churnRate",
					"fulfilledDemand",
					"servedShare",
					"churnedUsers",
					"newUsers",
					"margin",
					"week",
				],
				"product pressure fact",
			);
			assertIdentifier(value.productId, "Product pressure product id");
			assertEnum(value.channel, PRODUCT_CHANNELS, "Product pressure channel");
			assertPositiveInteger(value.price, "Product pressure price");
			const pricing = PRODUCT_PRESSURE_BALANCE.channels[value.channel];
			if (
				value.price < pricing.minimumPrice ||
				value.price > pricing.maximumPrice
			) {
				throw new Error("Product pressure price is outside channel bounds");
			}
			assertEnum(
				value.freshnessStatus,
				["fresh", "aging", "stale"],
				"Product pressure freshness status",
			);
			for (const metric of [
				"quality",
				"reliability",
				"latency",
				"satisfaction",
				"churnRate",
				"servedShare",
			] as const) {
				assertNonNegativeInteger(value[metric], `Product pressure ${metric}`);
				if (value[metric] > 100) {
					throw new Error(
						`Product pressure ${metric} must be between 0 and 100`,
					);
				}
			}
			for (const metric of [
				"fulfilledDemand",
				"churnedUsers",
				"newUsers",
			] as const) {
				assertNonNegativeInteger(value[metric], `Product pressure ${metric}`);
			}
			assertInteger(value.margin, "Product pressure margin");
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "product_retired":
			assertExactObject(
				value,
				[
					"kind",
					"productId",
					"modelId",
					"channel",
					"lostUsers",
					"releasedCompute",
					"trustPenalty",
					"hypePenalty",
					"week",
				],
				"product retired fact",
			);
			assertIdentifier(value.productId, "Retired product id");
			assertIdentifier(value.modelId, "Retired product model id");
			assertEnum(value.channel, PRODUCT_CHANNELS, "Retired product channel");
			for (const metric of [
				"lostUsers",
				"releasedCompute",
				"trustPenalty",
				"hypePenalty",
			] as const) {
				assertNonNegativeInteger(value[metric], `Product retirement ${metric}`);
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "data_acquired": {
			assertExactObject(
				value,
				[
					"kind",
					"dataId",
					"sourceId",
					"provenance",
					"quantity",
					"cost",
					"availableFromWeek",
					"rightsRisk",
					"week",
				],
				"data acquired fact",
			);
			assertIdentifier(value.dataId, "Acquired data id");
			assertIdentifier(value.sourceId, "Acquired data source id");
			assertEnum(
				value.provenance,
				DATA_PROVENANCES,
				"Acquired data provenance",
			);
			const source = getDataSourceDefinition(value.sourceId);
			if (source === undefined) {
				throw new Error(
					`Acquired data fact references unknown source: ${value.sourceId}`,
				);
			}
			if (value.provenance !== source.provenance) {
				throw new Error(
					"Acquired data fact provenance does not match its source",
				);
			}
			assertPositiveInteger(value.quantity, "Acquired data quantity");
			assertNonNegativeInteger(value.cost, "Acquired data cost");
			assertPositiveInteger(
				value.availableFromWeek,
				"Acquired data available-from week",
			);
			assertNonNegativeInteger(value.rightsRisk, "Acquired data rights risk");
			if (value.rightsRisk > 100) {
				throw new Error("Acquired data rights risk must be between 0 and 100");
			}
			assertPositiveInteger(value.week, "Fact week");
			if (
				value.quantity !== source.quantity ||
				value.cost !== source.acquisitionCost
			) {
				throw new Error(
					"Acquired data fact does not match its source economics",
				);
			}
			if (value.rightsRisk !== source.rightsRisk) {
				throw new Error(
					"Acquired data fact rights risk does not match its source",
				);
			}
			if (value.availableFromWeek !== value.week + source.acquisitionTime) {
				throw new Error(
					"Acquired data fact availability does not match source acquisition time",
				);
			}
			return;
		}
		case "data_stale_warning": {
			assertExactObject(
				value,
				["kind", "dataIds", "threshold", "week"],
				"data stale warning fact",
			);
			assertArray(value.dataIds, "Stale data ids");
			const staleIds = new Set<string>();
			for (const dataId of value.dataIds) {
				assertIdentifier(dataId, "Stale data id");
				if (staleIds.has(dataId)) {
					throw new Error(`Stale data warning repeats id: ${dataId}`);
				}
				staleIds.add(dataId);
			}
			assertNonNegativeInteger(value.threshold, "Stale data threshold");
			if (value.threshold > 100) {
				throw new Error("Stale data threshold must be between 0 and 100");
			}
			if (value.dataIds.length === 0) {
				throw new Error("Stale data warning must identify at least one record");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "model_staleness":
			assertExactObject(
				value,
				[
					"kind",
					"modelId",
					"productId",
					"status",
					"ageWeeks",
					"knowledgeCutoff",
					"knowledgeFreshness",
					"demandFactor",
					"qualityFactor",
					"week",
				],
				"model staleness fact",
			);
			assertIdentifier(value.modelId, "Staleness model id");
			assertIdentifier(value.productId, "Staleness product id");
			assertEnum(value.status, ["fresh", "aging", "stale"], "Staleness status");
			assertNonNegativeInteger(value.ageWeeks, "Staleness age");
			assertPositiveInteger(value.knowledgeCutoff, "Staleness cutoff");
			assertNonNegativeInteger(value.knowledgeFreshness, "Staleness freshness");
			assertNonNegativeInteger(value.demandFactor, "Staleness demand factor");
			assertNonNegativeInteger(value.qualityFactor, "Staleness quality factor");
			if (
				value.knowledgeFreshness > 100 ||
				value.demandFactor > 100 ||
				value.qualityFactor > 100
			) {
				throw new Error("Staleness values must be between 0 and 100");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "synthetic_data_overuse":
			assertExactObject(
				value,
				[
					"kind",
					"modelId",
					"syntheticAmount",
					"totalAmount",
					"qualityPenalty",
					"debtAdded",
					"week",
				],
				"synthetic data overuse fact",
			);
			assertIdentifier(value.modelId, "Synthetic overuse model id");
			assertPositiveInteger(value.syntheticAmount, "Synthetic data amount");
			assertPositiveInteger(value.totalAmount, "Synthetic data total amount");
			if (value.syntheticAmount > value.totalAmount) {
				throw new Error("Synthetic data amount cannot exceed total amount");
			}
			assertNonNegativeInteger(
				value.qualityPenalty,
				"Synthetic quality penalty",
			);
			assertNonNegativeInteger(value.debtAdded, "Synthetic data debt");
			if (value.qualityPenalty > 100 || value.debtAdded > 100) {
				throw new Error("Synthetic data effects must be between 0 and 100");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "revenue":
			assertExactObject(
				value,
				Object.hasOwn(value, "servedShare")
					? [
							"kind",
							"productId",
							"channel",
							"amount",
							"effectiveQuality",
							"servedShare",
							"week",
						]
					: [
							"kind",
							"productId",
							"channel",
							"amount",
							"effectiveQuality",
							"week",
						],
				"revenue fact",
			);
			assertIdentifier(value.productId, "Revenue product id");
			assertEnum(value.channel, PRODUCT_CHANNELS, "Revenue channel");
			assertNonNegativeInteger(value.amount, "Revenue amount");
			assertInteger(value.effectiveQuality, "Revenue effective quality");
			if (value.effectiveQuality < 0 || value.effectiveQuality > 100) {
				throw new Error("Revenue effective quality must be between 0 and 100");
			}
			if (Object.hasOwn(value, "servedShare")) {
				assertNonNegativeInteger(value.servedShare, "Revenue served share");
				if (value.servedShare > 100) {
					throw new Error("Revenue served share must be between 0 and 100");
				}
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "serving_throttled":
			assertExactObject(
				value,
				["kind", "productId", "week", "unmetDemand"],
				"serving throttled fact",
			);
			assertIdentifier(value.productId, "Serving throttle product id");
			assertPositiveInteger(value.week, "Fact week");
			assertNonNegativeInteger(value.unmetDemand, "Serving unmet demand");
			return;
		case "compute_conflict":
			assertExactObject(
				value,
				[
					"kind",
					"week",
					"capacity",
					"servingDemand",
					"trainingDemand",
					"evaluationDemand",
					"viral",
					"choice",
				],
				"compute conflict fact",
			);
			assertPositiveInteger(value.week, "Fact week");
			for (const metric of [
				"capacity",
				"servingDemand",
				"trainingDemand",
				"evaluationDemand",
			] as const) {
				assertNonNegativeInteger(value[metric], `Compute conflict ${metric}`);
			}
			assertBoolean(value.viral, "Compute conflict viral marker");
			assertEnum(
				value.choice,
				["serving_throttled", "training_starved"],
				"Compute conflict consequence",
			);
			return;
		case "training_starved":
			assertExactObject(
				value,
				[
					"kind",
					"week",
					"capacity",
					"servingDemand",
					"evaluationDemand",
					"trainingDemand",
				],
				"training starved fact",
			);
			assertPositiveInteger(value.week, "Fact week");
			assertNonNegativeInteger(value.capacity, "Training starvation capacity");
			assertNonNegativeInteger(
				value.servingDemand,
				"Training starvation serving demand",
			);
			assertNonNegativeInteger(
				value.evaluationDemand,
				"Training starvation evaluation demand",
			);
			assertNonNegativeInteger(
				value.trainingDemand,
				"Training starvation training demand",
			);
			return;
		case "rival_progressed":
			assertExactObject(
				value,
				["kind", "rivalId", "amount", "week"],
				"rival progressed fact",
			);
			assertIdentifier(value.rivalId, "Rival progress fact id");
			assertInteger(value.amount, "Rival progress fact amount");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "rival_milestone":
			assertExactObject(
				value,
				["kind", "rivalId", "milestone", "week"],
				"rival milestone fact",
			);
			assertIdentifier(value.rivalId, "Rival milestone fact id");
			assertIdentifier(value.milestone, "Rival milestone name");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "rival_published": {
			assertExactObject(
				value,
				[
					"kind",
					"rivalId",
					"actionId",
					"nodeId",
					"commandId",
					"threshold",
					"progress",
					"pressure",
					"week",
				],
				"rival published fact",
			);
			assertIdentifier(value.rivalId, "Rival publication rival id");
			assertIdentifier(value.actionId, "Rival publication action id");
			assertIdentifier(value.nodeId, "Rival publication node id");
			assertIdentifier(value.commandId, "Rival publication command id");
			const action = getRivalStrategyAction(value.actionId);
			if (action === undefined || action.kind !== "publication") {
				throw new Error(
					`Rival publication fact references an unknown publication action: ${value.actionId}`,
				);
			}
			if (action.nodeId !== value.nodeId) {
				throw new Error(
					`Rival publication fact node does not match action ${action.id}`,
				);
			}
			assertPositiveInteger(value.threshold, "Rival publication threshold");
			if (value.threshold !== action.threshold) {
				throw new Error(
					`Rival publication fact threshold does not match action ${action.id}`,
				);
			}
			assertNonNegativeInteger(value.progress, "Rival publication progress");
			if (value.progress > 100 || value.progress < value.threshold) {
				throw new Error(
					"Rival publication fact progress must reach its action threshold",
				);
			}
			assertPositiveInteger(value.pressure, "Rival publication pressure");
			if (value.pressure !== BALANCE.rivalStrategy.publicationPressure) {
				throw new Error("Rival publication fact has invalid pressure");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "rival_launched": {
			assertExactObject(
				value,
				[
					"kind",
					"rivalId",
					"actionId",
					"familyId",
					"commandId",
					"threshold",
					"progress",
					"pressure",
					"week",
				],
				"rival launched fact",
			);
			assertIdentifier(value.rivalId, "Rival launch rival id");
			assertIdentifier(value.actionId, "Rival launch action id");
			assertEnum(value.familyId, MODEL_FAMILY_IDS, "Rival launch family id");
			assertIdentifier(value.commandId, "Rival launch command id");
			const action = getRivalStrategyAction(value.actionId);
			if (action === undefined || action.kind !== "launch") {
				throw new Error(
					`Rival launch fact references an unknown launch action: ${value.actionId}`,
				);
			}
			if (action.familyId !== value.familyId) {
				throw new Error(
					`Rival launch fact family does not match action ${action.id}`,
				);
			}
			assertPositiveInteger(value.threshold, "Rival launch threshold");
			if (value.threshold !== action.threshold) {
				throw new Error(
					`Rival launch fact threshold does not match action ${action.id}`,
				);
			}
			assertNonNegativeInteger(value.progress, "Rival launch progress");
			if (value.progress > 100 || value.progress < value.threshold) {
				throw new Error(
					"Rival launch fact progress must reach its action threshold",
				);
			}
			assertPositiveInteger(value.pressure, "Rival launch pressure");
			if (value.pressure !== BALANCE.rivalStrategy.launchPressure) {
				throw new Error("Rival launch fact has invalid pressure");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "funding_resolved":
			assertExactObject(
				value,
				Object.hasOwn(value, "factors")
					? ["kind", "round", "outcome", "factors", "week"]
					: ["kind", "round", "outcome", "week"],
				"funding resolved fact",
			);
			assertEnum(value.round, FUNDING_ROUNDS, "Funding fact round");
			assertEnum(
				value.outcome,
				["accepted", "declined"],
				"Funding fact outcome",
			);
			if (Object.hasOwn(value, "factors")) {
				assertFundingGateFactors(value.factors);
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "incident_occurred": {
			const keys = [
				"kind",
				"incident",
				"condition",
				"affectedEntity",
				"metric",
				"measurement",
				"threshold",
				"severity",
			];
			for (const optionalKey of [
				"riskMemoryId",
				"recurrenceCount",
				"unresolvedRecurrenceCount",
				"unresolved",
				"riskSeverity",
			] as const) {
				if (Object.hasOwn(value, optionalKey)) keys.push(optionalKey);
			}
			keys.push("week");
			assertExactObject(value, keys, "incident occurred fact");
			assertEnum(value.incident, INCIDENT_TYPES, "Incident fact type");
			if (incidentDefinition(value.incident).condition !== value.condition) {
				throw new Error("Incident fact condition does not match its type");
			}
			assertEnum(
				value.condition,
				[
					"serving_overload",
					"api_overload",
					"low_quality",
					"training_overload",
					"enterprise_risk",
					"privacy_exposure",
				],
				"Incident fact condition",
			);
			assertString(value.affectedEntity, "Incident affected entity");
			if (value.affectedEntity.trim().length === 0) {
				throw new Error("Incident affected entity must not be empty");
			}
			assertString(value.metric, "Incident fact metric");
			if (value.metric.trim().length === 0) {
				throw new Error("Incident fact metric must not be empty");
			}
			assertInteger(value.measurement, "Incident fact measurement");
			assertInteger(value.threshold, "Incident fact threshold");
			assertInteger(value.severity, "Incident fact severity");
			if (Object.hasOwn(value, "riskMemoryId")) {
				assertIdentifier(value.riskMemoryId, "Incident risk memory fact id");
			}
			if (Object.hasOwn(value, "recurrenceCount")) {
				assertPositiveInteger(
					value.recurrenceCount,
					"Incident recurrence fact count",
				);
			}
			if (Object.hasOwn(value, "unresolvedRecurrenceCount")) {
				assertNonNegativeInteger(
					value.unresolvedRecurrenceCount,
					"Incident unresolved recurrence fact count",
				);
			}
			if (Object.hasOwn(value, "unresolved")) {
				assertBoolean(value.unresolved, "Incident risk unresolved fact");
			}
			if (Object.hasOwn(value, "riskSeverity")) {
				assertNonNegativeInteger(
					value.riskSeverity,
					"Incident risk severity fact",
				);
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "incident_resolved": {
			const keys = ["kind", "incidentId", "incident", "response"];
			if (Object.hasOwn(value, "riskMemoryId")) keys.push("riskMemoryId");
			keys.push("week");
			assertExactObject(value, keys, "incident resolved fact");
			assertIdentifier(value.incidentId, "Resolved incident id");
			assertEnum(value.incident, INCIDENT_TYPES, "Resolved incident type");
			assertEnum(
				value.response,
				["repair", "reduce_scope", "disclose"],
				"Incident response",
			);
			if (Object.hasOwn(value, "riskMemoryId")) {
				assertIdentifier(value.riskMemoryId, "Resolved risk memory id");
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
		case "risk_memory_updated":
			assertExactObject(
				value,
				[
					"kind",
					"riskMemoryId",
					"name",
					"incident",
					"condition",
					"severity",
					"affectedProductId",
					"affectedModelId",
					"unresolved",
					"recurrenceCount",
					"unresolvedRecurrenceCount",
					"lastOccurrenceWeek",
					"week",
				],
				"risk memory updated fact",
			);
			assertIdentifier(value.riskMemoryId, "Risk memory fact id");
			assertString(value.name, "Risk memory fact name");
			if (value.name.trim().length === 0) {
				throw new Error("Risk memory fact name must not be empty");
			}
			assertEnum(value.incident, INCIDENT_TYPES, "Risk memory fact incident");
			if (incidentDefinition(value.incident).condition !== value.condition) {
				throw new Error("Risk memory fact condition does not match its type");
			}
			assertEnum(
				value.condition,
				[
					"serving_overload",
					"api_overload",
					"low_quality",
					"training_overload",
					"enterprise_risk",
					"privacy_exposure",
				],
				"Risk memory fact condition",
			);
			assertNonNegativeInteger(value.severity, "Risk memory fact severity");
			assertNullableString(
				value.affectedProductId,
				"Risk memory fact product id",
			);
			if (value.affectedProductId !== null) {
				assertIdentifier(
					value.affectedProductId,
					"Risk memory fact product id",
				);
			}
			assertNullableString(value.affectedModelId, "Risk memory fact model id");
			if (value.affectedModelId !== null) {
				assertIdentifier(value.affectedModelId, "Risk memory fact model id");
			}
			assertBoolean(value.unresolved, "Risk memory fact unresolved");
			assertPositiveInteger(
				value.recurrenceCount,
				"Risk memory fact recurrence count",
			);
			assertNonNegativeInteger(
				value.unresolvedRecurrenceCount,
				"Risk memory fact unresolved recurrence count",
			);
			if (
				value.unresolvedRecurrenceCount > value.recurrenceCount ||
				(!value.unresolved && value.unresolvedRecurrenceCount !== 0) ||
				(value.unresolved && value.unresolvedRecurrenceCount < 1)
			) {
				throw new Error("Risk memory fact has an invalid unresolved streak");
			}
			assertPositiveInteger(
				value.lastOccurrenceWeek,
				"Risk memory fact last occurrence week",
			);
			assertPositiveInteger(value.week, "Fact week");
			if (value.lastOccurrenceWeek > value.week) {
				throw new Error("Risk memory fact cannot report a future occurrence");
			}
			return;
		case "crisis_opened":
			assertExactObject(
				value,
				["kind", "crisisId", "riskMemoryId", "crisis", "week"],
				"crisis opened fact",
			);
			assertIdentifier(value.crisisId, "Opened crisis id");
			assertIdentifier(value.riskMemoryId, "Opened crisis memory id");
			assertEnum(value.crisis, ["risk_escalation"], "Opened crisis kind");
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "crisis_resolved":
			assertExactObject(
				value,
				["kind", "crisisId", "riskMemoryId", "choice", "week"],
				"crisis resolved fact",
			);
			assertIdentifier(value.crisisId, "Resolved crisis id");
			assertIdentifier(value.riskMemoryId, "Resolved crisis memory id");
			assertEnum(
				value.choice,
				["investigate", "contain", "disclose"],
				"Resolved crisis choice",
			);
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "milestone_reached":
			assertExactObject(value, ["kind", "milestone", "week"], "milestone fact");
			assertEnum(
				value.milestone,
				["first_multimodal_launch"],
				"Milestone fact",
			);
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "terminal": {
			assertExactObject(
				value,
				["kind", "reason", "contributors", "week"],
				"terminal fact",
			);
			assertEnum(
				value.reason,
				["cash_depleted", "trust_collapsed"],
				"Terminal fact reason",
			);
			const contributors =
				value.contributors as unknown as TerminalContributor[];
			assertArray(contributors, "Terminal fact contributors");
			for (const contributor of contributors) {
				assertExactObject(
					contributor,
					["kind", "impact", "week", "index"],
					"Terminal fact contributor",
				);
				assertEnum(contributor.kind, FACT_KINDS, "Terminal contributor kind");
				assertInteger(contributor.impact, "Terminal contributor impact");
				assertPositiveInteger(contributor.week, "Terminal contributor week");
				assertNonNegativeInteger(
					contributor.index,
					"Terminal contributor index",
				);
			}
			if (contributors.length !== 3) {
				throw new Error(
					"Terminal facts must contain exactly three contributors",
				);
			}
			for (let index = 1; index < contributors.length; index += 1) {
				const previous = contributors[index - 1];
				const current = contributors[index];
				if (previous === undefined || current === undefined) continue;
				if (
					Math.abs(previous.impact) < Math.abs(current.impact) ||
					(Math.abs(previous.impact) === Math.abs(current.impact) &&
						previous.index > current.index)
				) {
					throw new Error(
						"Terminal fact contributors must be deterministically ordered",
					);
				}
			}
			assertPositiveInteger(value.week, "Fact week");
			return;
		}
	}
}
