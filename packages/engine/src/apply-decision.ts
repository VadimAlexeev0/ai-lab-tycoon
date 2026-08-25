import { appendFactsAsReports } from "./advance-week.js";
import type {
	DecisionChoice,
	PendingDecision,
} from "./components/decisions.js";
import { assertDecisionChoice } from "./components/decisions.js";
import { applyEvaluation } from "./evaluations.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import { applyProductLaunch } from "./products.js";
import type { EngineResult, GameState } from "./state.js";
import { applyFunding } from "./systems/funding.js";
import { applyIncidentResponse } from "./systems/incidents.js";

/** Resolve one queued decision without mutating the input state. */
export function applyDecision(
	state: GameState,
	choice: DecisionChoice,
): EngineResult {
	assertGameState(state);
	assertDecisionChoice(choice);
	const pending = state.decisions.pending.find(
		(decision) => decision.id === choice.decisionId,
	);
	if (pending === undefined) {
		throw new Error(`Cannot apply unknown decision: ${choice.decisionId}`);
	}
	if (!isChoiceCompatible(pending, choice)) {
		throw new Error(
			`Decision choice ${choice.kind} is not compatible with ${pending.kind} decision ${pending.id}`,
		);
	}

	let resolved: EngineResult;
	let remaining: PendingDecision[];
	if (choice.kind === "launch") {
		try {
			resolved = applyProductLaunch(
				state,
				{ modelId: pendingModelId(pending), channel: choice.channel },
				false,
			);
		} catch (error) {
			if (error instanceof Error && /estimate/i.test(error.message)) {
				throw new Error(
					`Launch decision is not implemented without model estimates: ${error.message}`,
				);
			}
			throw error;
		}
		remaining = withoutDecision(state.decisions.pending, pending.id);
	} else if (choice.kind === "evaluate") {
		resolved = applyEvaluation(
			state,
			{ modelId: pendingModelId(pending), evaluation: choice.evaluation },
			false,
		);
		remaining =
			pending.kind === "launch"
				? state.decisions.pending.map((decision) => ({ ...decision }))
				: withoutDecision(state.decisions.pending, pending.id);
	} else if (choice.kind === "funding") {
		resolved = applyFunding(state, choice.round, choice.accept);
		remaining = withoutDecision(state.decisions.pending, pending.id);
	} else if (choice.kind === "incident") {
		resolved = applyIncidentResponse(
			state,
			pendingIncident(pending),
			choice.response,
		);
		remaining = withoutDecision(state.decisions.pending, pending.id);
	} else {
		resolved = shelveDecision(state, pending);
		remaining = withoutDecision(state.decisions.pending, pending.id);
	}

	const withDecision = {
		...resolved.state,
		decisions: { pending: remaining },
		queue: {
			...resolved.state.queue,
			decisionIds: remaining.map((decision) => decision.id),
		},
	};
	const commandAllocation = allocateId(withDecision, "command");
	let nextState: GameState = {
		...commandAllocation.state,
		commandLog: [
			...commandAllocation.state.commandLog,
			{
				id: commandAllocation.id,
				kind: "apply_decision",
				week: state.meta.week,
				choice: { ...choice },
			},
		],
	};
	nextState = appendFactsAsReports(nextState, resolved.facts);
	assertGameState(nextState);
	return {
		state: nextState,
		facts: resolved.facts,
		pending: remaining,
	};
}

function isChoiceCompatible(
	decision: PendingDecision,
	choice: DecisionChoice,
): boolean {
	if (choice.kind === "shelve") {
		return decision.kind === "launch" || decision.kind === "evaluation";
	}
	if (choice.kind === "evaluate") {
		return (
			decision.kind === "evaluation" &&
			choice.evaluation === decision.evaluation
		);
	}
	switch (decision.kind) {
		case "launch":
			return choice.kind === "launch";
		case "evaluation":
			return false;
		case "funding":
			return choice.kind === "funding" && choice.round === decision.round;
		case "incident":
			return choice.kind === "incident";
	}
}

function pendingModelId(decision: PendingDecision): string {
	if (decision.kind !== "launch" && decision.kind !== "evaluation") {
		throw new Error("This decision does not reference a model");
	}
	return decision.modelId;
}

function pendingIncident(
	decision: PendingDecision,
):
	| "outage"
	| "latency_degradation"
	| "quality_safety_scandal"
	| "compute_cost_overrun"
	| "enterprise_sla_breach"
	| "data_privacy_incident" {
	if (decision.kind !== "incident") {
		throw new Error("This decision is not an incident");
	}
	return decision.incident;
}

function withoutDecision(
	decisions: readonly PendingDecision[],
	decisionId: string,
): PendingDecision[] {
	return decisions
		.filter((decision) => decision.id !== decisionId)
		.map((decision) => ({ ...decision }));
}

function shelveDecision(
	state: GameState,
	decision: PendingDecision,
): EngineResult {
	if (decision.kind !== "launch" && decision.kind !== "evaluation") {
		throw new Error("Only model decisions can be shelved");
	}
	const nextState: GameState = {
		...state,
		models: {
			...state.models,
			items: state.models.items.map((model) =>
				model.id === decision.modelId
					? { ...model, status: "shelved", projectId: null }
					: { ...model },
			),
		},
	};
	assertGameState(nextState);
	return { state: nextState, facts: [], pending: [] };
}
