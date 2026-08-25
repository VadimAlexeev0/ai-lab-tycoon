import type { Model } from "./components/models.js";
import type { Project } from "./components/projects.js";
import type { Rival } from "./components/rivals.js";
import type { GameState } from "./state.js";
import type { DeepReadonly } from "./systems/types.js";

export type ResourceBarSummary = {
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

export type TeamStatus = "idle" | "working";

export type VisibleTeam = {
	id: string;
	name: string;
	status: TeamStatus;
	activeProjectId: string | null;
};

export type VisibleEstimateBand = {
	estimate: number;
	lower: number;
	upper: number;
};

export type VisibleModelEstimate = {
	id: string;
	name: string;
	brand?: string;
	family?: string;
	estimates?: Readonly<Record<string, VisibleEstimateBand>>;
};

type VisibleProjectBase = {
	id: string;
	status: "available";
	progress: number;
	duration: number;
};

export type VisibleAvailableProject =
	| (VisibleProjectBase & {
			kind: "research";
			nodeId: string;
	  })
	| (VisibleProjectBase & {
			kind: "infrastructure";
			target: "compute";
	  })
	| (VisibleProjectBase & {
			kind: "model";
			modelId: string;
	  })
	| (VisibleProjectBase & {
			kind: "training";
			modelId: string;
	  })
	| (VisibleProjectBase & {
			kind: "evaluation";
			modelId: string;
			evaluation: "capability" | "safety_reliability";
	  })
	| (VisibleProjectBase & {
			kind: "product";
			modelId: string;
			channel: "chat" | "developer_api" | "enterprise";
	  });

export type VisibleRival = {
	id: string;
	name: string;
	archetype: Rival["archetype"];
	focus: Rival["focus"];
	progress: number;
	active: boolean;
};

export type NextObjective =
	| {
			kind: "assign_project";
			teamId: string;
	  }
	| {
			kind: "resolve_decision";
			decisionId: string;
	  }
	| {
			kind: "advance_week";
			week: number;
	  };

export type VisibleGameState = {
	resourceBar: ResourceBarSummary;
	teams: VisibleTeam[];
	availableProjects: VisibleAvailableProject[];
	rivals: VisibleRival[];
	nextObjective: NextObjective;
};

export function selectResourceBar(
	state: DeepReadonly<GameState>,
): ResourceBarSummary {
	return {
		cash: state.company.cash,
		compute: {
			capacity: state.compute.capacity,
			allocated: state.compute.allocated,
			trainingDemand: state.compute.trainingDemand,
			servingDemand: state.compute.servingDemand,
		},
		insight: state.company.insight,
		trust: state.company.trust,
		hype: state.company.hype,
	};
}

export function selectTeams(state: DeepReadonly<GameState>): VisibleTeam[] {
	return state.teams.items.map((team) => ({
		id: team.id,
		name: team.name,
		status: team.activeProjectId === null ? "idle" : "working",
		activeProjectId: team.activeProjectId,
	}));
}

export function selectAvailableProjects(
	state: DeepReadonly<GameState>,
): VisibleAvailableProject[] {
	return state.projects.items
		.filter((project) => project.status === "available")
		.map(projectToVisible);
}

export function selectRivals(state: DeepReadonly<GameState>): VisibleRival[] {
	return state.rivals.items
		.filter((rival) => state.meta.era !== "text" || rival.active)
		.map((rival) => ({
			id: rival.id,
			name: rival.name,
			archetype: rival.archetype,
			focus: rival.focus,
			progress: rival.progress,
			active: rival.active,
		}));
}

/** Project only the model facts that the player is allowed to see. */
export function selectVisibleModels(
	state: DeepReadonly<GameState>,
): VisibleModelEstimate[] {
	return state.models.items.map(modelToVisible);
}

export function selectNextObjective(
	state: DeepReadonly<GameState>,
): NextObjective {
	const blockingDecision = state.decisions.pending.find(
		(decision) => decision.blocking,
	);
	if (blockingDecision !== undefined) {
		return {
			kind: "resolve_decision",
			decisionId: blockingDecision.id,
		};
	}

	const availableProjectExists = state.projects.items.some(
		(project) => project.status === "available",
	);
	const idleTeam = state.teams.items.find(
		(team) => team.activeProjectId === null,
	);
	if (availableProjectExists && idleTeam !== undefined) {
		return {
			kind: "assign_project",
			teamId: idleTeam.id,
		};
	}

	return {
		kind: "advance_week",
		week: state.meta.week,
	};
}

export function selectVisibleState(
	state: DeepReadonly<GameState>,
): VisibleGameState {
	return {
		resourceBar: selectResourceBar(state),
		teams: selectTeams(state),
		availableProjects: selectAvailableProjects(state),
		rivals: selectRivals(state),
		nextObjective: selectNextObjective(state),
	};
}

function projectToVisible(
	project: DeepReadonly<Project>,
): VisibleAvailableProject {
	if (project.status !== "available") {
		throw new Error("Only available projects can be projected");
	}

	switch (project.kind) {
		case "research":
			return {
				id: project.id,
				kind: "research",
				status: "available",
				progress: project.progress,
				duration: project.duration,
				nodeId: project.nodeId,
			};
		case "infrastructure":
			return {
				id: project.id,
				kind: "infrastructure",
				status: "available",
				progress: project.progress,
				duration: project.duration,
				target: project.target,
			};
		case "model":
			return {
				id: project.id,
				kind: "model",
				status: "available",
				progress: project.progress,
				duration: project.duration,
				modelId: project.modelId,
			};
		case "training":
			return {
				id: project.id,
				kind: "training",
				status: "available",
				progress: project.progress,
				duration: project.duration,
				modelId: project.modelId,
			};
		case "evaluation":
			return {
				id: project.id,
				kind: "evaluation",
				status: "available",
				progress: project.progress,
				duration: project.duration,
				modelId: project.modelId,
				evaluation: project.evaluation,
			};
		case "product":
			return {
				id: project.id,
				kind: "product",
				status: "available",
				progress: project.progress,
				duration: project.duration,
				modelId: project.modelId,
				channel: project.channel,
			};
	}
}

type ModelWithLegacyVisibleBrand = Model & {
	brand?: string;
};

function modelToVisible(model: DeepReadonly<Model>): VisibleModelEstimate {
	const candidate = model as DeepReadonly<ModelWithLegacyVisibleBrand>;
	const visible: VisibleModelEstimate = {
		id: candidate.id,
		name: candidate.name,
	};

	if (candidate.brand !== undefined) {
		visible.brand = candidate.brand;
	}
	if (candidate.family !== undefined) {
		visible.family = candidate.family;
	}
	if (candidate.estimates !== undefined) {
		visible.estimates = projectEstimateBands(candidate.estimates);
	}

	return visible;
}

function projectEstimateBands(
	estimates: DeepReadonly<Readonly<Record<string, VisibleEstimateBand>>>,
): Readonly<Record<string, VisibleEstimateBand>> {
	const visible: Record<string, VisibleEstimateBand> = {};
	for (const dimension of Object.keys(estimates)) {
		const band = estimates[dimension];
		if (band === undefined) {
			continue;
		}
		visible[dimension] = {
			estimate: band.estimate,
			lower: band.lower,
			upper: band.upper,
		};
	}
	return visible;
}
