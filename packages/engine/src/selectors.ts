import type { PendingDecision } from "./components/decisions.js";
import type { FundingGateFactors } from "./components/funding.js";
import type { Model } from "./components/models.js";
import type { Product } from "./components/products.js";
import type { Project } from "./components/projects.js";
import type { Fact, Report } from "./components/reports.js";
import type {
	ResearchBranch,
	ResearchNodeStatus,
} from "./components/research.js";
import type { Rival } from "./components/rivals.js";
import type {
	TerminalContributor,
	TerminalReason,
	TerminalStatus,
} from "./components/terminal.js";
import {
	getResearchDefinition,
	type ResearchCategory,
} from "./data/research.js";
import type { GameState } from "./state.js";
import { fundingFactors } from "./systems/funding.js";
import type { DeepReadonly } from "./systems/types.js";

export class IncompatibleSaveError extends Error {
	name = "IncompatibleSaveError";
}

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

export type VisibleResearchNode = {
	id: string;
	label: string;
	era: GameState["research"]["currentEra"];
	eraLabel: string;
	category: ResearchCategory;
	branch: ResearchBranch;
	status: ResearchNodeStatus;
	prereqs: string[];
	insightCost: number;
	description: string;
};

export type VisibleProductSummary = {
	id: string;
	channel: Product["channel"];
	modelId: string;
	status: Product["status"];
	users?: number;
	lastRevenue?: number;
	cumulativeRevenue?: number;
	servingDemand?: number;
	effectiveQuality?: number;
};

export type VisibleFundingSummary = {
	seed: { round: "seed"; status: GameState["funding"]["seed"]["status"] };
	seriesA: {
		round: "series_a";
		status: GameState["funding"]["seriesA"]["status"];
	};
	factors: FundingGateFactors;
};

export type VisiblePendingDecision = PendingDecision;

export type VisibleReport = {
	id: string;
	priority: Report["priority"];
	fact: Fact;
	acknowledged: boolean;
};

export type VisibleTerminalProjection = {
	status: TerminalStatus;
	reason: TerminalReason;
	frontierReached: boolean;
	contributors: TerminalContributor[];
};

export type TerminalObjective = {
	kind: "restart";
	reason: Exclude<TerminalReason, "none">;
	guidance: string;
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
	  }
	| TerminalObjective;

export type VisibleGameState = {
	resourceBar: ResourceBarSummary;
	teams: VisibleTeam[];
	availableProjects: VisibleAvailableProject[];
	rivals: VisibleRival[];
	models: VisibleModelEstimate[];
	research: VisibleResearchNode[];
	products: VisibleProductSummary[];
	funding: VisibleFundingSummary;
	pendingDecisions: VisiblePendingDecision[];
	recentReports: VisibleReport[];
	terminal: VisibleTerminalProjection;
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

export function selectResearchNodes(
	state: DeepReadonly<GameState>,
): VisibleResearchNode[] {
	return state.research.nodes.map((node) => {
		const definition = getResearchDefinition(node.id);
		if (definition === undefined) {
			throw new IncompatibleSaveError(
				`Save is incompatible with the current research catalog: unknown node "${node.id}". Start a new run.`,
			);
		}
		return {
			id: node.id,
			label: definition.label,
			era: node.era,
			eraLabel: definition.eraLabel,
			category: definition.category,
			branch: node.branch,
			status: node.status,
			prereqs: [...node.prerequisites],
			insightCost: node.insightCost,
			description: definition.description,
		};
	});
}

export function selectProducts(
	state: DeepReadonly<GameState>,
): VisibleProductSummary[] {
	return state.products.items.map((product) => {
		const visible: VisibleProductSummary = {
			id: product.id,
			channel: product.channel,
			modelId: product.modelId,
			status: product.status,
		};
		if (product.users !== undefined) visible.users = product.users;
		if (product.lastRevenue !== undefined) {
			visible.lastRevenue = product.lastRevenue;
		}
		if (product.cumulativeRevenue !== undefined) {
			visible.cumulativeRevenue = product.cumulativeRevenue;
		}
		if (product.servingDemand !== undefined) {
			visible.servingDemand = product.servingDemand;
		}
		if (product.effectiveQuality !== undefined) {
			visible.effectiveQuality = product.effectiveQuality;
		}
		return visible;
	});
}

export function selectFunding(
	state: DeepReadonly<GameState>,
): VisibleFundingSummary {
	return {
		seed: { round: "seed", status: state.funding.seed.status },
		seriesA: { round: "series_a", status: state.funding.seriesA.status },
		factors: fundingFactors(state as unknown as GameState),
	};
}

export function selectPendingDecisions(
	state: DeepReadonly<GameState>,
): VisiblePendingDecision[] {
	return state.decisions.pending.map((decision) => ({ ...decision }));
}

export function selectRecentReports(
	state: DeepReadonly<GameState>,
): VisibleReport[] {
	return state.reports.items.map(reportToVisible);
}

export function selectTerminalProjection(
	state: DeepReadonly<GameState>,
): VisibleTerminalProjection {
	return {
		status: state.terminal.status,
		reason: state.terminal.reason,
		frontierReached: state.terminal.frontierReached,
		contributors: state.terminal.contributors.map((contributor) => ({
			...contributor,
		})),
	};
}

/** Return the only valid next action for a run that has already been lost. */
export function selectTerminalObjective(
	state: DeepReadonly<GameState>,
): TerminalObjective | null {
	if (state.terminal.status !== "lost" || state.terminal.reason === "none") {
		return null;
	}
	return {
		kind: "restart",
		reason: state.terminal.reason,
		guidance: restartGuidance(state.terminal.reason),
	};
}

export function selectNextObjective(
	state: DeepReadonly<GameState>,
): NextObjective {
	const terminalObjective = selectTerminalObjective(state);
	if (terminalObjective !== null) {
		return terminalObjective;
	}

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
		models: selectVisibleModels(state),
		research: selectResearchNodes(state),
		products: selectProducts(state),
		funding: selectFunding(state),
		pendingDecisions: selectPendingDecisions(state),
		recentReports: selectRecentReports(state),
		terminal: selectTerminalProjection(state),
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

function reportToVisible(report: DeepReadonly<Report>): VisibleReport {
	return {
		id: report.id,
		priority: report.priority,
		fact: cloneFact(report.fact),
		acknowledged: report.acknowledged,
	};
}

function cloneFact(fact: DeepReadonly<Fact>): Fact {
	if (fact.kind === "terminal") {
		return {
			...fact,
			contributors: fact.contributors.map((contributor) => ({
				...contributor,
			})),
		};
	}
	if (fact.kind === "funding_resolved" && fact.factors !== undefined) {
		return { ...fact, factors: { ...fact.factors } };
	}
	return { ...fact } as Fact;
}

function restartGuidance(reason: Exclude<TerminalReason, "none">): string {
	return reason === "cash_depleted"
		? "Restart with more runway: protect cash before committing to another expensive project."
		: "Restart with a safer posture: evaluate reliability and protect Trust before scaling.";
}
