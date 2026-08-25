import type { IncidentType } from "./decisions.js";
import type { FundingRound } from "./funding.js";
import type { ProductChannel } from "./products.js";

export type ResourceName = "cash" | "compute" | "insight" | "trust" | "hype";

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

export function assertReportsState(state: ReportsState): void {
	const ids: string[] = [];
	for (const report of state.items) {
		assertIdentifier(report.id, "report id");
		if (ids.includes(report.id)) {
			throw new Error(`Duplicate report id: ${report.id}`);
		}
		ids.push(report.id);
		assertFact(report.fact);
	}
}

export function assertFact(fact: Fact): void {
	if (!Number.isInteger(fact.week) || fact.week < 1) {
		throw new Error("Fact week must be a positive integer");
	}

	switch (fact.kind) {
		case "resource_changed":
		case "project_progressed":
		case "rival_progressed":
			if (!Number.isInteger(fact.amount)) {
				throw new Error(`Fact ${fact.kind} amount must be an integer`);
			}
			if (fact.kind !== "resource_changed") {
				assertIdentifier(
					fact.kind === "project_progressed" ? fact.projectId : fact.rivalId,
					`${fact.kind} identifier`,
				);
			}
			return;
		case "project_completed":
			assertIdentifier(fact.projectId, "completed project id");
			return;
		case "research_completed":
			assertIdentifier(fact.nodeId, "completed research node id");
			return;
		case "model_trained":
			assertIdentifier(fact.modelId, "trained model id");
			return;
		case "product_launched":
			assertIdentifier(fact.productId, "launched product id");
			return;
		case "funding_resolved":
		case "incident_occurred":
		case "milestone_reached":
		case "terminal":
			return;
		default:
			assertNever(fact);
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unsupported fact kind: ${String(value)}`);
}
