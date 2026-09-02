import {
	PARADIGM_IDS,
	type ResearchParadigmId,
} from "../data/research/paradigms.js";
import { getResearchDefinition } from "../data/research.js";
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
export type CrisisKind = "risk_escalation";
export type CrisisChoice = "investigate" | "contain" | "disclose";

const DECISION_KINDS = [
	"launch",
	"evaluation",
	"funding",
	"incident",
	"crisis",
	"paradigm",
	"publication",
] as const;
const CHOICE_KINDS = [
	"launch",
	"evaluate",
	"funding",
	"incident",
	"crisis",
	"shelve",
	"paradigm",
	"publication",
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
const CRISIS_KINDS = ["risk_escalation"] as const;
const CRISIS_CHOICES = ["investigate", "contain", "disclose"] as const;
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
			/** Stable risk memory updated by this occurrence, when available. */
			riskMemoryId?: string;
			incident: IncidentType;
			blocking: true;
	  }
	| {
			kind: "crisis";
			id: string;
			crisisId: string;
			riskMemoryId: string;
			crisis: CrisisKind;
			choices: readonly CrisisChoice[];
			blocking: true;
	  }
	| {
			kind: "paradigm";
			id: string;
			era: "text";
			choices: readonly ResearchParadigmId[];
			blocking: true;
	  }
	| {
			kind: "publication";
			id: string;
			nodeId: string;
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
			kind: "crisis";
			decisionId: string;
			crisisId: string;
			choice: CrisisChoice;
	  }
	| {
			kind: "shelve";
			decisionId: string;
	  }
	| {
			kind: "paradigm";
			decisionId: string;
			paradigmId: ResearchParadigmId;
	  }
	| {
			kind: "publication";
			decisionId: string;
			nodeId: string;
			outcome: "publish" | "hoard";
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
	const publicationNodeIds = new Set<string>();
	const crisisIds = new Set<string>();
	for (const item of value.pending) {
		assertObject(item, "pending decision");
		assertEnum(item.kind, DECISION_KINDS, "Pending decision kind");
		assertIdentifier(item.id, "Decision id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate decision id: ${item.id}`);
		}
		ids.add(item.id);
		assertPendingDecision(item);
		if (item.kind === "publication") {
			if (publicationNodeIds.has(item.nodeId)) {
				throw new Error(`Duplicate publication node: ${item.nodeId}`);
			}
			publicationNodeIds.add(item.nodeId);
		}
		if (item.kind === "crisis") {
			if (crisisIds.has(item.crisisId)) {
				throw new Error(`Duplicate crisis decision: ${item.crisisId}`);
			}
			crisisIds.add(item.crisisId);
		}
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
		case "crisis":
			assertExactObject(
				value,
				["kind", "decisionId", "crisisId", "choice"],
				"crisis decision choice",
			);
			assertIdentifier(value.crisisId, "Crisis choice id");
			assertEnum(value.choice, CRISIS_CHOICES, "Crisis choice");
			return;
		case "shelve":
			assertExactObject(
				value,
				["kind", "decisionId"],
				"shelve decision choice",
			);
			return;
		case "paradigm":
			assertExactObject(
				value,
				["kind", "decisionId", "paradigmId"],
				"paradigm decision choice",
			);
			assertEnum(value.paradigmId, PARADIGM_IDS, "Research paradigm id");
			return;
		case "publication":
			assertExactObject(
				value,
				["kind", "decisionId", "nodeId", "outcome"],
				"publication decision choice",
			);
			assertIdentifier(value.nodeId, "Publication decision node id");
			assertPublishableResearchNode(value.nodeId, "Publication decision node");
			assertEnum(
				value.outcome,
				["publish", "hoard"],
				"Publication decision outcome",
			);
			return;
	}
}

function assertPendingDecision(
	value: Record<string, unknown>,
): asserts value is PendingDecision {
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
				? Object.hasOwn(value, "riskMemoryId")
					? ["kind", "id", "incidentId", "riskMemoryId", "incident", "blocking"]
					: ["kind", "id", "incidentId", "incident", "blocking"]
				: Object.hasOwn(value, "riskMemoryId")
					? ["kind", "id", "riskMemoryId", "incident", "blocking"]
					: ["kind", "id", "incident", "blocking"];
			assertExactObject(value, keys, "incident decision");
			if (Object.hasOwn(value, "incidentId")) {
				assertIdentifier(value.incidentId, "Incident id");
				if (
					Object.hasOwn(value, "riskMemoryId") &&
					value.incidentId !== value.id
				) {
					throw new Error(
						`Incident decision ${value.id} must use its own id as incident id`,
					);
				}
			}
			if (Object.hasOwn(value, "riskMemoryId")) {
				assertIdentifier(value.riskMemoryId, "Incident risk memory id");
			}
			assertEnum(value.incident, INCIDENT_TYPES, "Decision incident type");
			assertBoolean(value.blocking, "Incident decision blocking");
			if (value.blocking !== true) {
				throw new Error("Incident decisions must be blocking");
			}
			return;
		}
		case "crisis": {
			assertExactObject(
				value,
				[
					"kind",
					"id",
					"crisisId",
					"riskMemoryId",
					"crisis",
					"choices",
					"blocking",
				],
				"crisis decision",
			);
			assertIdentifier(value.crisisId, "Crisis id");
			assertIdentifier(value.riskMemoryId, "Crisis risk memory id");
			assertEnum(value.crisis, CRISIS_KINDS, "Crisis kind");
			assertArray(value.choices, "Crisis choices");
			if (value.choices.length !== CRISIS_CHOICES.length) {
				throw new Error("Crisis decisions must contain exactly three choices");
			}
			const choices = new Set<string>();
			for (const choice of value.choices) {
				assertEnum(choice, CRISIS_CHOICES, "Crisis choice");
				if (choices.has(choice)) {
					throw new Error(`Duplicate crisis choice: ${choice}`);
				}
				choices.add(choice);
			}
			assertBoolean(value.blocking, "Crisis decision blocking");
			if (value.blocking !== true) {
				throw new Error("Crisis decisions must be blocking");
			}
			return;
		}
		case "paradigm": {
			assertExactObject(
				value,
				["kind", "id", "era", "choices", "blocking"],
				"paradigm decision",
			);
			assertEnum(value.era, ["text"] as const, "Paradigm decision era");
			assertArray(value.choices, "Paradigm decision choices");
			if (value.choices.length !== PARADIGM_IDS.length) {
				throw new Error(
					"Paradigm decisions must contain exactly three choices",
				);
			}
			const choices = new Set<string>();
			for (const choice of value.choices) {
				assertEnum(choice, PARADIGM_IDS, "Research paradigm id");
				if (choices.has(choice)) {
					throw new Error(`Duplicate paradigm choice: ${choice}`);
				}
				choices.add(choice);
			}
			assertBoolean(value.blocking, "Paradigm decision blocking");
			if (value.blocking !== true) {
				throw new Error("Paradigm decisions must be blocking");
			}
			return;
		}
		case "publication":
			assertExactObject(
				value,
				["kind", "id", "nodeId", "blocking"],
				"publication decision",
			);
			assertIdentifier(value.nodeId, "Publication decision node id");
			assertPublishableResearchNode(value.nodeId, "Publication decision node");
			assertBoolean(value.blocking, "Publication decision blocking");
			if (value.blocking !== true) {
				throw new Error("Publication decisions must be blocking");
			}
			return;
	}
}

function assertPublishableResearchNode(nodeId: string, path: string): void {
	const definition = getResearchDefinition(nodeId);
	if (definition === undefined) {
		throw new Error(`${path} references an unknown research node: ${nodeId}`);
	}
	if (definition.publishable !== true) {
		throw new Error(`${path} must reference a publishable research node`);
	}
}
