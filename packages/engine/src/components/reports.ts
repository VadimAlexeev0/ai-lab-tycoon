import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertObject,
	assertPositiveInteger,
} from "../validation.js";
import type { IncidentType } from "./decisions.js";
import type { FundingRound } from "./funding.js";
import type { ProductChannel } from "./products.js";

export type ResourceName = "cash" | "compute" | "insight" | "trust" | "hype";

const FACT_KINDS = [
	"resource_changed",
	"project_progressed",
	"project_completed",
	"research_completed",
	"model_trained",
	"product_launched",
	"rival_progressed",
	"funding_resolved",
	"incident_occurred",
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
			week: number;
	  }
	| {
			kind: "model_trained";
			modelId: string;
			week: number;
	  }
	| {
			kind: "product_launched";
			productId: string;
			channel: ProductChannel;
			week: number;
	  }
	| {
			kind: "rival_progressed";
			rivalId: string;
			amount: number;
			week: number;
	  }
	| {
			kind: "funding_resolved";
			round: FundingRound;
			outcome: "accepted" | "declined";
			week: number;
	  }
	| {
			kind: "incident_occurred";
			incident: IncidentType;
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
};

export function createReportsState(items: Report[] = []): ReportsState {
	return {
		items: items.map((report) => ({
			...report,
			fact: { ...report.fact },
		})),
	};
}

export function assertReportsState(
	value: unknown,
): asserts value is ReportsState {
	assertExactObject(value, ["items"], "reports");
	assertArray(value.items, "Reports items");

	const ids: string[] = [];
	for (const item of value.items) {
		assertExactObject(
			item,
			["id", "priority", "fact", "acknowledged"],
			"report",
		);
		assertIdentifier(item.id, "Report id");
		if (ids.includes(item.id)) {
			throw new Error(`Duplicate report id: ${item.id}`);
		}
		ids.push(item.id);
		assertEnum(item.priority, REPORT_PRIORITIES, "Report priority");
		assertBoolean(item.acknowledged, "Report acknowledged");
		assertFact(item.fact);
	}
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
				["kind", "nodeId", "week"],
				"research completed fact",
			);
			assertIdentifier(value.nodeId, "Completed research node id");
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
		case "funding_resolved":
			assertExactObject(
				value,
				["kind", "round", "outcome", "week"],
				"funding resolved fact",
			);
			assertEnum(value.round, FUNDING_ROUNDS, "Funding fact round");
			assertEnum(
				value.outcome,
				["accepted", "declined"],
				"Funding fact outcome",
			);
			assertPositiveInteger(value.week, "Fact week");
			return;
		case "incident_occurred":
			assertExactObject(
				value,
				["kind", "incident", "week"],
				"incident occurred fact",
			);
			assertEnum(value.incident, INCIDENT_TYPES, "Incident fact type");
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
		case "terminal":
			assertExactObject(value, ["kind", "reason", "week"], "terminal fact");
			assertEnum(
				value.reason,
				["cash_depleted", "trust_collapsed"],
				"Terminal fact reason",
			);
			assertPositiveInteger(value.week, "Fact week");
			return;
	}
}
