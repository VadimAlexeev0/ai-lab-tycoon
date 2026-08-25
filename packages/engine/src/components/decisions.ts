import type { FundingRound } from "./funding.js";
import type { ProductChannel } from "./products.js";

export type EvaluationKind = "capability" | "safety_reliability";
export type IncidentType =
	| "outage"
	| "latency_degradation"
	| "quality_safety_scandal"
	| "compute_cost_overrun"
	| "enterprise_sla_breach"
	| "data_privacy_incident";
export type IncidentResponse = "repair" | "reduce_scope" | "disclose";

export type PendingDecision =
	| {
			kind: "launch";
			id: string;
			modelId: string;
			blocking: true;
	  }
	| {
			kind: "evaluation";
			id: string;
			modelId: string;
			evaluation: EvaluationKind;
			blocking: true;
	  }
	| {
			kind: "funding";
			id: string;
			round: FundingRound;
			blocking: false;
	  }
	| {
			kind: "incident";
			id: string;
			incident: IncidentType;
			blocking: true;
	  };

export type DecisionChoice =
	| {
			kind: "launch";
			decisionId: string;
			channel: ProductChannel;
	  }
	| {
			kind: "evaluate";
			decisionId: string;
			evaluation: EvaluationKind;
	  }
	| {
			kind: "funding";
			decisionId: string;
			round: FundingRound;
			accept: boolean;
	  }
	| {
			kind: "incident";
			decisionId: string;
			response: IncidentResponse;
	  }
	| {
			kind: "shelve";
			decisionId: string;
	  };

export type DecisionsState = {
	pending: PendingDecision[];
};

export function createDecisionsState(
	pending: PendingDecision[] = [],
): DecisionsState {
	return {
		pending: pending.map((decision) => ({ ...decision })),
	};
}

export function assertDecisionsState(state: DecisionsState): void {
	const ids: string[] = [];
	for (const decision of state.pending) {
		assertIdentifier(decision.id, "decision id");
		if (ids.includes(decision.id)) {
			throw new Error(`Duplicate decision id: ${decision.id}`);
		}
		ids.push(decision.id);
		assertPendingDecision(decision);
	}
}

export function assertDecisionChoice(choice: DecisionChoice): void {
	assertIdentifier(choice.decisionId, "decision choice id");

	switch (choice.kind) {
		case "launch":
			return;
		case "evaluate":
			return;
		case "funding":
			return;
		case "incident":
			return;
		case "shelve":
			return;
		default:
			assertNever(choice);
	}
}

function assertPendingDecision(decision: PendingDecision): void {
	switch (decision.kind) {
		case "launch":
			assertIdentifier(decision.modelId, "launch model id");
			if (decision.blocking !== true) {
				throw new Error("Launch decisions must be blocking");
			}
			return;
		case "evaluation":
			assertIdentifier(decision.modelId, "evaluation model id");
			if (decision.blocking !== true) {
				throw new Error("Evaluation decisions must be blocking");
			}
			return;
		case "funding":
			if (decision.blocking !== false) {
				throw new Error("Funding decisions must be non-blocking");
			}
			return;
		case "incident":
			if (decision.blocking !== true) {
				throw new Error("Incident decisions must be blocking");
			}
			return;
		default:
			assertNever(decision);
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unsupported decision kind: ${String(value)}`);
}
