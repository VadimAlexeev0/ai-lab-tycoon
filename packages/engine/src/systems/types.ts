import type { PendingDecision } from "../components/decisions.js";
import type { Fact } from "../components/reports.js";
import type { GameState } from "../state.js";

export type SystemPhase =
	| "upkeep"
	| "projects"
	| "research"
	| "training"
	| "products"
	| "rivals"
	| "funding"
	| "incidents"
	| "terminal"
	| "decisions"
	| "reporting";

export type SystemContext = {
	readonly phase: SystemPhase;
	readonly seed: number;
	readonly week: number;
};

export type SystemResult = {
	state: GameState;
	facts: Fact[];
	pending: PendingDecision[];
};

export type GameSystem = (
	state: Readonly<GameState>,
	context: Readonly<SystemContext>,
) => SystemResult;
