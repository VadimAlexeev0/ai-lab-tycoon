import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertObject,
} from "../validation.js";
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

const DECISION_KINDS = ["launch", "evaluation", "funding", "incident"] as const;
const CHOICE_KINDS = [
	"launch",
	"evaluate",
	"funding",
	"incident",
	"shelve",
] as const;
const EVALUATION_KINDS = ["capability", "safety_reliability"] as const;
const INCIDENT_TYPES = [
	"outage",
	"latency_degradation",
	"quality_safety_scandal",
	"compute_cost_overrun",
	"enterprise_sla_breach",
	"data_privacy_incident",
] as const;
const INCIDENT_RESPONSES = ["repair", "reduce_scope", "disclose"] as const;
const FUNDING_ROUNDS = ["seed", "series_a"] as const;
const PRODUCT_CHANNELS = ["chat", "developer_api", "enterprise"] as const;

export type PendingDecision =
	| {
			kind: "launch";
			id: string;
			modelId: string;
			channel?: ProductChannel;
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
			/** Stable id shared by the occurrence, decision, and resolution facts. */
			incidentId?: string;
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

export function assertDecisionsState(
	value: unknown,
): asserts value is DecisionsState {
	assertExactObject(value, ["pending"], "decisions");
	assertArray(value.pending, "Pending decisions");

	const ids = new Set<string>();
	for (const item of value.pending) {
		assertObject(item, "pending decision");
		assertEnum(item.kind, DECISION_KINDS, "Pending decision kind");
		assertIdentifier(item.id, "Decision id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate decision id: ${item.id}`);
		}
		ids.add(item.id);
		assertPendingDecision(item);
	}
}

export function assertDecisionChoice(
	value: unknown,
): asserts value is DecisionChoice {
	assertObject(value, "decision choice");
	assertEnum(value.kind, CHOICE_KINDS, "Decision choice kind");
	assertIdentifier(value.decisionId, "Decision choice id");

	switch (value.kind) {
		case "launch":
			assertExactObject(
				value,
				["kind", "decisionId", "channel"],
				"launch decision choice",
			);
			assertEnum(value.channel, PRODUCT_CHANNELS, "Launch channel");
			return;
		case "evaluate":
			assertExactObject(
				value,
				["kind", "decisionId", "evaluation"],
				"evaluation decision choice",
			);
			assertEnum(value.evaluation, EVALUATION_KINDS, "Evaluation kind");
			return;
		case "funding":
			assertExactObject(
				value,
				["kind", "decisionId", "round", "accept"],
				"funding decision choice",
			);
			assertEnum(value.round, FUNDING_ROUNDS, "Funding round");
			assertBoolean(value.accept, "Funding acceptance");
			return;
		case "incident":
			assertExactObject(
				value,
				["kind", "decisionId", "response"],
				"incident decision choice",
			);
			assertEnum(value.response, INCIDENT_RESPONSES, "Incident response");
			return;
		case "shelve":
			assertExactObject(
				value,
				["kind", "decisionId"],
				"shelve decision choice",
			);
			return;
	}
}

function assertPendingDecision(value: Record<string, unknown>): void {
	switch (value.kind) {
		case "launch": {
			const keys = Object.hasOwn(value, "channel")
				? ["kind", "id", "modelId", "channel", "blocking"]
				: ["kind", "id", "modelId", "blocking"];
			assertExactObject(value, keys, "launch decision");
			assertIdentifier(value.modelId, "Launch model id");
			if (Object.hasOwn(value, "channel")) {
				assertEnum(value.channel, PRODUCT_CHANNELS, "Launch decision channel");
			}
			assertBoolean(value.blocking, "Launch decision blocking");
			if (value.blocking !== true) {
				throw new Error("Launch decisions must be blocking");
			}
			return;
		}
		case "evaluation":
			assertExactObject(
				value,
				["kind", "id", "modelId", "evaluation", "blocking"],
				"evaluation decision",
			);
			assertIdentifier(value.modelId, "Evaluation model id");
			assertEnum(
				value.evaluation,
				EVALUATION_KINDS,
				"Decision evaluation kind",
			);
			assertBoolean(value.blocking, "Evaluation decision blocking");
			if (value.blocking !== true) {
				throw new Error("Evaluation decisions must be blocking");
			}
			return;
		case "funding":
			assertExactObject(
				value,
				["kind", "id", "round", "blocking"],
				"funding decision",
			);
			assertEnum(value.round, FUNDING_ROUNDS, "Decision funding round");
			assertBoolean(value.blocking, "Funding decision blocking");
			if (value.blocking !== false) {
				throw new Error("Funding decisions must be non-blocking");
			}
			return;
		case "incident": {
			const keys = Object.hasOwn(value, "incidentId")
				? ["kind", "id", "incidentId", "incident", "blocking"]
				: ["kind", "id", "incident", "blocking"];
			assertExactObject(value, keys, "incident decision");
			if (Object.hasOwn(value, "incidentId")) {
				assertIdentifier(value.incidentId, "Incident id");
			}
			assertEnum(value.incident, INCIDENT_TYPES, "Decision incident type");
			assertBoolean(value.blocking, "Incident decision blocking");
			if (value.blocking !== true) {
				throw new Error("Incident decisions must be blocking");
			}
			return;
		}
	}
}
