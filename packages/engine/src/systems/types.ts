import type { PendingDecision } from "../components/decisions.js";
import type { Fact } from "../components/reports.js";
import type { GameState } from "../state.js";

export type DeepReadonly<T> = T extends (
	...args: infer Arguments
) => infer Result
	? (...args: Arguments) => Result
	: T extends readonly (infer Item)[]
		? ReadonlyArray<DeepReadonly<Item>>
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

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
	readonly week: number;
	readonly facts?: readonly Fact[];
	/** Optional deterministic incident rolls used by fixtures and replays. */
	readonly incidentRolls?: readonly number[];
	readonly incidentRoll?: number;
};

export type SystemResult = {
	state: GameState;
	facts: Fact[];
	pending: PendingDecision[];
};

export type GameSystem = (
	state: DeepReadonly<GameState>,
	context: DeepReadonly<SystemContext>,
) => SystemResult;

export type SystemDeclaration = Readonly<{
	reads: readonly string[];
	writes: readonly string[];
}>;

export type RegisteredSystem = SystemDeclaration &
	Readonly<{
		phase: SystemPhase;
		system: GameSystem;
	}>;
