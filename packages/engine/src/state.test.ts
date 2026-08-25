import { describe, expect, it } from "vitest";

import type {
	DecisionChoice,
	PendingDecision,
} from "./components/decisions.js";
import type { Fact } from "./components/reports.js";
import { startRun } from "./index.js";
import { assertGameState } from "./invariants.js";
import { createInitialGameState, type GameState } from "./state.js";
import type {
	DeepReadonly,
	GameSystem,
	SystemResult,
} from "./systems/types.js";

function cloneState(state: GameState | DeepReadonly<GameState>): GameState {
	return JSON.parse(JSON.stringify(state)) as GameState;
}

function containsUndefined(value: unknown): boolean {
	if (value === undefined) {
		return true;
	}

	if (Array.isArray(value)) {
		return value.some(containsUndefined);
	}

	if (value !== null && typeof value === "object") {
		return Object.values(value).some(containsUndefined);
	}

	return false;
}

describe("GameState", () => {
	it("creates a plain JSON state that round-trips without undefined fields", () => {
		const state = startRun({ companyName: "Acme Labs" }, 42);
		const roundTripped = cloneState(state);

		expect(containsUndefined(state)).toBe(false);
		expect(roundTripped).toEqual(state);
		expect(() => assertGameState(roundTripped)).not.toThrow();
	});

	it("initializes every V1 component as a serializable state slice", () => {
		const state = createInitialGameState({ companyName: "Acme Labs" }, 42);

		expect(Object.keys(state)).toEqual([
			"meta",
			"rng",
			"counters",
			"company",
			"teams",
			"projects",
			"compute",
			"research",
			"models",
			"products",
			"rivals",
			"funding",
			"decisions",
			"reports",
			"queue",
			"commandLog",
			"warnings",
			"terminal",
		]);
		expect(state.company.name).toBe("Acme Labs");
		expect(state.rng.seed).toBe(42);
		expect(state.meta.week).toBe(1);
	});

	it("initializes counters at the next available entity IDs", () => {
		const state = createInitialGameState({ companyName: "Acme Labs" }, 42);

		expect(state.commandLog[0]?.id).toBe("command_001");
		expect(state.counters).toEqual({
			team: 1,
			project: 1,
			model: 1,
			product: 1,
			rival: 1,
			decision: 1,
			report: 1,
			command: 2,
		});
	});

	it("composes component invariants for resources, ownership, IDs, and queue references", () => {
		const invalidCash = cloneState(
			createInitialGameState({ companyName: "Acme Labs" }, 42),
		);
		invalidCash.company.cash = -1;
		expect(() => assertGameState(invalidCash)).toThrow(/cash/i);

		const invalidOwnership = cloneState(
			createInitialGameState({ companyName: "Acme Labs" }, 42),
		);
		invalidOwnership.teams.items = [
			{
				id: "team_001",
				name: "Founding Team",
				activeProjectId: "project_001",
			},
		];
		invalidOwnership.projects.items = [
			{
				kind: "research",
				id: "project_001",
				teamId: "team_404",
				nodeId: "node_001",
				status: "active",
				progress: 0,
				duration: 1,
			},
		];
		expect(() => assertGameState(invalidOwnership)).toThrow(/team/i);

		const duplicateIds = cloneState(
			createInitialGameState({ companyName: "Acme Labs" }, 42),
		);
		duplicateIds.teams.items = [
			{ id: "team_001", name: "Founding Team", activeProjectId: null },
			{ id: "team_001", name: "Research Team", activeProjectId: null },
		];
		expect(() => assertGameState(duplicateIds)).toThrow(/duplicate.*id/i);

		const invalidQueue = cloneState(
			createInitialGameState({ companyName: "Acme Labs" }, 42),
		);
		invalidQueue.queue.decisionIds = ["decision_missing"];
		expect(() => assertGameState(invalidQueue)).toThrow(/queue/i);
	});

	it("keeps facts, decisions, and choices closed under discriminated unions", () => {
		const fact: Fact = {
			kind: "resource_changed",
			resource: "cash",
			amount: -10,
			week: 1,
		};
		const pending: PendingDecision = {
			kind: "launch",
			id: "decision_001",
			modelId: "model_001",
			blocking: true,
		};
		const choice: DecisionChoice = {
			kind: "launch",
			decisionId: "decision_001",
			channel: "chat",
		};

		expect(fact.kind).toBe("resource_changed");
		expect(pending.kind).toBe("launch");
		expect(choice.kind).toBe("launch");
	});

	it("allows a pure system to return a new state with typed facts and pending decisions", () => {
		const system: GameSystem = (state): SystemResult => ({
			state: cloneState(state),
			facts: [],
			pending: [],
		});
		const state = createInitialGameState({ companyName: "Acme Labs" }, 42);
		const result = system(state, {
			phase: "upkeep",
			week: state.meta.week,
		});

		expect(result.state).toEqual(state);
		expect(result.facts).toEqual([]);
		expect(result.pending).toEqual([]);
	});

	it("keeps raw seeds out of the system context at compile and runtime", () => {
		let receivedContext: unknown;
		const system: GameSystem = (_state, context) => {
			receivedContext = context;
			// @ts-expect-error SystemContext must not expose the raw run seed
			const rawSeed = context.seed;
			void rawSeed;
			return {
				state: createInitialGameState({ companyName: "Acme Labs" }, 42),
				facts: [],
				pending: [],
			};
		};
		const state = createInitialGameState({ companyName: "Acme Labs" }, 42);
		const context = {
			phase: "upkeep" as const,
			week: state.meta.week,
		};

		expect(system(state, context).state).toEqual(state);
		expect(receivedContext).toEqual(context);
		expect(receivedContext).not.toHaveProperty("seed");
	});
});
