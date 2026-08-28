import {
	type GameState,
	selectPendingDecisions,
	selectTeams,
} from "@ai-lab-tycoon/engine";

/** The least expensive legal-looking fresh/lean model configuration. */
export const MIN_MODEL_DESIGN_COST = 80;

export type PriorityAction =
	| {
			kind: "resolve_decision";
			decisionId: string;
	  }
	| {
			kind: "assign_project";
			teamId: string;
			teamName: string;
	  }
	| {
			kind: "design_model";
			minimumCost: number;
	  }
	| {
			kind: "advance_week";
			week: number;
	  };

export function getPriorityAction(state: GameState): PriorityAction {
	const blockingDecision = selectPendingDecisions(state).find(
		(decision) => decision.blocking,
	);
	if (blockingDecision !== undefined) {
		return {
			kind: "resolve_decision",
			decisionId: blockingDecision.id,
		};
	}

	const idleTeam = selectTeams(state).find((team) => team.status === "idle");
	if (idleTeam !== undefined) {
		return {
			kind: "assign_project",
			teamId: idleTeam.id,
			teamName: idleTeam.name,
		};
	}

	const activeModelWork = state.models.items.some(
		(model) => model.status === "designing" || model.status === "training",
	);
	if (!activeModelWork && state.company.cash >= MIN_MODEL_DESIGN_COST) {
		return {
			kind: "design_model",
			minimumCost: MIN_MODEL_DESIGN_COST,
		};
	}

	return {
		kind: "advance_week",
		week: state.meta.week,
	};
}

export function priorityMessage(
	action: PriorityAction,
	state: GameState,
): string {
	switch (action.kind) {
		case "resolve_decision":
			return "A blocking decision is holding the week.";
		case "assign_project":
			return `${action.teamName} is idle and ready for work.`;
		case "design_model":
			return `No model work is active; minimum design cost is $${action.minimumCost}.`;
		case "advance_week":
			return `No higher-priority action detected for week ${state.meta.week}.`;
	}
}
