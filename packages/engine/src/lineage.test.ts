import { describe, expect, it } from "vitest";
import { assertModelsState } from "./components/models.js";
import { BALANCE } from "./data/balance.js";
import {
	advanceWeek,
	applyDecision,
	assignProject,
	cancelProject,
	GAME_STATE_SCHEMA_VERSION,
	serializeGameState,
	startRun,
	upgradeGameState,
} from "./index.js";
import {
	assertGameState,
	assertionsEnabled,
	setAssertionsEnabled,
} from "./invariants.js";
import {
	designModel,
	generateTrueScores,
	type ModelDesignSpec,
} from "./model-design.js";
import { replayCommandLog } from "./replay.js";
import { selectAvailableProjects } from "./selectors.js";
import type { GameState } from "./state.js";
import { trainingSystem } from "./systems/training.js";

const TEXT_NODE_ID = "text_models_principles";

const BASE_SPEC: ModelDesignSpec = {
	name: "Aurora-1",
	family: "text",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

function designableState(seed = 42): GameState {
	const state = startRun({ companyName: "Lineage Labs" }, seed);
	for (const node of state.research.nodes) {
		if (node.id === TEXT_NODE_ID) node.status = "completed";
	}
	return state;
}

function replayableDesignableState(seed = 42): GameState {
	let state = startRun({ companyName: "Lineage Labs" }, seed);
	state = advanceWeek(state).state;
	const paradigm = state.decisions.pending.find(
		(decision) => decision.kind === "paradigm",
	);
	if (paradigm === undefined || paradigm.kind !== "paradigm") {
		throw new Error("Expected a paradigm decision");
	}
	const paradigmId = paradigm.choices[0];
	if (paradigmId === undefined) throw new Error("Expected a paradigm choice");
	state = applyDecision(state, {
		kind: "paradigm",
		decisionId: paradigm.id,
		paradigmId,
	}).state;
	const team = state.teams.items[0];
	const infrastructure = selectAvailableProjects(state).find(
		(project) =>
			project.kind === "research" &&
			project.nodeId === "text_infrastructure_compute",
	);
	if (team === undefined || infrastructure === undefined) {
		throw new Error("Expected opening infrastructure project");
	}
	state = assignProject(state, team.id, infrastructure.id).state;
	state = cancelProject(state, team.id, infrastructure.id).state;
	state = advanceWeek(state).state;
	const principles = selectAvailableProjects(state).find(
		(project) => project.kind === "research" && project.nodeId === TEXT_NODE_ID,
	);
	if (principles === undefined)
		throw new Error("Expected model principles project");
	state = assignProject(state, team.id, principles.id).state;
	return advanceWeek(state).state;
}

function readyFreshParentState(): GameState {
	let state = designModel(designableState(), {
		...BASE_SPEC,
		brandId: "brand_aurora",
	}).state;
	const project = state.projects.items.at(-1);
	if (project === undefined || project.kind !== "training") {
		throw new Error("Expected a parent training project");
	}
	for (let week = 1; week <= project.duration; week += 1) {
		state = trainingSystem(state, { phase: "training", week }).state;
	}
	const parent = state.models.items.at(-1);
	if (parent === undefined || parent.status !== "ready") {
		throw new Error("Expected a ready parent model");
	}
	return state;
}

function readyParentState(): GameState {
	const state = readyFreshParentState();
	const root = state.models.items.at(-1);
	if (root === undefined || root.status !== "ready") {
		throw new Error("Expected a ready root model");
	}

	const parent = {
		...root,
		id: "model_002",
		name: "Aurora-Parent",
		foundation: "continued" as const,
		parentModelId: root.id,
		projectId: null,
	};
	state.models.items.push(parent);
	state.counters.model += 1;
	parent.dataDebt = 37;
	return state;
}

function designWithInjectedLineageValues(
	state: GameState,
	spec: ModelDesignSpec,
): ReturnType<typeof designModel> {
	const previousAssertionsEnabled = assertionsEnabled;
	setAssertionsEnabled(false);
	try {
		return designModel(state, spec);
	} finally {
		setAssertionsEnabled(previousAssertionsEnabled);
	}
}

describe("foundation and brand lineage", () => {
	it("records an explicit market brand and a separate fresh foundation lineage", () => {
		const state = designableState();
		const result = designModel(state, {
			...BASE_SPEC,
			brandId: "brand_aurora",
		});
		const model = result.state.models.items.at(-1);

		expect(model).toMatchObject({
			brandId: "brand_aurora",
			foundationId: "foundation_model_001",
			foundation: "fresh",
			parentModelId: null,
		});
	});

	it("defaults market identity independently from the model name", () => {
		const aurora = designModel(designableState(), {
			...BASE_SPEC,
			name: "Aurora-1",
		}).state.models.items.at(-1);
		const borealis = designModel(designableState(), {
			...BASE_SPEC,
			name: "Borealis-1",
		}).state.models.items.at(-1);

		expect(aurora?.brandId).toBe("brand_model_001");
		expect(borealis?.brandId).toBe("brand_model_001");
	});

	it("retains the full foundation debt and risk for continued successors", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");

		const result = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		});
		const successor = result.state.models.items.at(-1);

		expect(successor).toMatchObject({
			parentModelId: parent.id,
			foundationId: parent.foundationId,
			foundationDebt: parent.foundationDebt,
			foundationRisk: parent.foundationRisk,
			brandId: parent.brandId,
		});
	});

	it("keeps synthetic data debt distinct and retained by continued training", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		parent.dataDebt = 37;

		const result = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		});
		const successor = result.state.models.items.at(-1);

		expect(successor).toMatchObject({
			dataDebt: 37,
			foundationDebt: parent.foundationDebt,
		});
		expect(successor?.dataDebt).not.toBe(successor?.foundationDebt);
	});

	it("rejects silently reset synthetic debt on a successor", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const successorState = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const successor = successorState.models.items.at(-1);
		if (successor === undefined) throw new Error("Expected a successor model");
		successor.dataDebt = 0;

		expect(() => assertGameState(successorState)).toThrow(
			/data debt|retention/i,
		);
	});

	it("rejects a successor with deleted inherited synthetic data debt", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const successorState = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const successor = successorState.models.items.at(-1);
		if (successor === undefined) throw new Error("Expected a successor model");
		delete successor.dataDebt;

		expect(() => assertGameState(successorState)).toThrow(
			/data debt|retention/i,
		);
	});

	it("uses the defined parent score floor for continued training", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined || parent.trueScores === undefined) {
			throw new Error("Expected a scored parent model");
		}
		const successorState = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const successor = successorState.models.items.at(-1);
		if (successor === undefined) throw new Error("Expected a successor model");
		const generated = generateTrueScores(
			successorState.rng,
			successor,
			parent,
			undefined,
			{ quality: 0, qualityPenalty: 100 },
		);
		const floorPercent = BALANCE.modelFoundations.continued.floorPercent;
		for (const dimension of [
			"capability",
			"coding",
			"reliability",
			"safety",
			"efficiency",
			"multimodal",
		] as const) {
			expect(generated.trueScores[dimension]).toBe(
				Math.ceil((parent.trueScores[dimension] * floorPercent) / 100),
			);
		}
	});

	it("reduces foundation and synthetic data debt for distilled successors", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		parent.foundationDebt = 80;
		parent.foundationRisk = 60;
		parent.dataDebt = 37;

		const result = designWithInjectedLineageValues(state, {
			...BASE_SPEC,
			name: "Aurora-S",
			foundation: "distilled",
			parentModelId: parent.id,
		});
		const successor = result.state.models.items.at(-1);
		if (successor === undefined)
			throw new Error("Expected a distilled successor");
		const balance = BALANCE.modelFoundations.distilled;

		expect(successor).toMatchObject({
			foundationId: parent.foundationId,
			foundationDebt: Math.trunc(
				((parent.foundationDebt ?? 0) * balance.debtRetentionPercent) / 100,
			),
			foundationRisk: Math.trunc(
				((parent.foundationRisk ?? 0) * balance.riskRetentionPercent) / 100,
			),
			dataDebt: Math.trunc((37 * balance.dataDebtRetentionPercent) / 100),
		});
		expect(successor.foundationDebt).toBeGreaterThan(0);
		expect(successor.foundationDebt).toBeLessThan(parent.foundationDebt ?? 0);
		expect(successor.foundationRisk).toBeGreaterThan(0);
		expect(successor.foundationRisk).toBeLessThan(parent.foundationRisk ?? 0);
	});

	it("does not erase a positive inherited debt or risk when distilling", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		parent.foundationDebt = 1;
		parent.foundationRisk = 1;
		parent.dataDebt = 1;

		const result = designWithInjectedLineageValues(state, {
			...BASE_SPEC,
			name: "Aurora-S",
			foundation: "distilled",
			parentModelId: parent.id,
		});
		const successor = result.state.models.items.at(-1);

		expect(successor).toMatchObject({
			foundationDebt: 1,
			foundationRisk: 1,
			dataDebt: 1,
		});
	});

	it("keeps a parent brand on a fresh rebuild while starting a new foundation", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");

		const result = designModel(state, {
			...BASE_SPEC,
			name: parent.name,
			foundation: "fresh",
			brandId: parent.brandId,
		});
		const successor = result.state.models.items.at(-1);
		if (successor === undefined) throw new Error("Expected a fresh successor");

		expect(successor).toMatchObject({
			name: parent.name,
			brandId: parent.brandId,
			foundation: "fresh",
			parentModelId: null,
			foundationDebt: 0,
			foundationRisk: 0,
			dataDebt: 0,
		});
		expect(successor.foundationId).not.toBe(parent.foundationId);
	});

	it("allows a same-name rebuild to deliberately start a new brand", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");

		const result = designModel(state, {
			...BASE_SPEC,
			name: parent.name,
			foundation: "fresh",
			brandId: "brand_nova",
		});
		const successor = result.state.models.items.at(-1);

		expect(successor).toMatchObject({
			name: parent.name,
			brandId: "brand_nova",
			foundation: "fresh",
			parentModelId: null,
		});
		expect(successor?.brandId).not.toBe(parent.brandId);
	});

	it("uses explicit foundation balance data for mode duration and cost", () => {
		const fresh = designModel(designableState(), {
			...BASE_SPEC,
			tier: "lean",
		}).state;
		const parentState = readyFreshParentState();
		const parent = parentState.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const continued = designModel(parentState, {
			...BASE_SPEC,
			name: "Aurora-2",
			tier: "lean",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const freshProject = fresh.projects.items.at(-1);
		const continuedProject = continued.projects.items.at(-1);
		if (
			freshProject === undefined ||
			continuedProject === undefined ||
			freshProject.kind !== "training" ||
			continuedProject.kind !== "training"
		) {
			throw new Error("Expected training projects");
		}

		expect(freshProject.duration).toBe(
			BALANCE.modelTiers.lean.duration +
				BALANCE.modelFoundations.fresh.duration,
		);
		expect(continuedProject.duration).toBe(
			BALANCE.modelTiers.lean.duration +
				BALANCE.modelFoundations.continued.duration,
		);
		expect(fresh.company.cash).toBe(
			BALANCE.startingCash -
				BALANCE.modelTiers.lean.cost -
				BALANCE.modelFoundations.fresh.cost,
		);
		expect(continued.company.cash).toBe(
			BALANCE.startingCash -
				BALANCE.modelTiers.standard.cost -
				BALANCE.modelFoundations.fresh.cost -
				BALANCE.modelTiers.lean.cost -
				BALANCE.modelFoundations.continued.cost,
		);
	});

	it("preserves persistent risk history while creating a successor", () => {
		const state = designableState();
		state.risk.memories.push({
			id: "risk_lineage_fixture",
			name: "Lineage fixture risk",
			incident: "outage",
			condition: "serving_overload",
			severity: 40,
			affectedProductId: null,
			affectedModelId: null,
			unresolved: true,
			recurrenceCount: 1,
			unresolvedRecurrenceCount: 1,
			lastOccurrenceWeek: 1,
		});
		const before = JSON.stringify(state.risk);

		const result = designModel(state, {
			...BASE_SPEC,
			brandId: "brand_aurora",
		});

		expect(JSON.stringify(result.state.risk)).toBe(before);
		expect(result.state.models.items.at(-1)?.foundationRisk).toBe(0);
	});

	it("does not mutate the state or brand input while designing", () => {
		const state = designableState();
		const spec = {
			...BASE_SPEC,
			brandId: "brand_aurora",
			dataMix: { ...BASE_SPEC.dataMix },
			emphasis: { ...BASE_SPEC.emphasis },
		};
		const stateBefore = JSON.stringify(state);
		const specBefore = JSON.stringify(spec);

		designModel(state, spec);

		expect(JSON.stringify(state)).toBe(stateBefore);
		expect(JSON.stringify(spec)).toBe(specBefore);
	});

	it("does not accept forged foundation fields in a design command", () => {
		const state = designableState();
		expect(() =>
			designModel(state, {
				...BASE_SPEC,
				foundationId: "foundation_forged",
				foundationDebt: 99,
				foundationRisk: 99,
			} as ModelDesignSpec),
		).toThrow(/unexpected.*field/i);
	});

	it("rejects a tampered brand payload in a persisted design command", () => {
		const state = designModel(designableState(), BASE_SPEC).state;
		const command = state.commandLog.at(-1);
		if (command === undefined || command.kind !== "design_model") {
			throw new Error("Expected a design command");
		}
		command.brandId = "brand_forged";

		expect(() => assertGameState(state)).toThrow(/payload|brand/i);
	});

	it("replays a brand-bearing design command to the identical state", () => {
		const original = designModel(replayableDesignableState(), {
			...BASE_SPEC,
			brandId: "brand_aurora",
		}).state;

		const replayed = replayCommandLog(original.commandLog);

		expect(replayed).toEqual(original);
	});

	it("upgrades a v8 model save with deterministic lineage defaults", () => {
		const designed = designModel(designableState(), BASE_SPEC).state;
		const fixture = JSON.parse(serializeGameState(designed)) as Record<
			string,
			unknown
		>;
		const models = fixture.models as { items: Record<string, unknown>[] };
		const model = models.items[0];
		if (model === undefined) throw new Error("Expected a legacy model");
		const rivals = fixture.rivals as {
			items: Record<string, unknown>[];
		};
		for (const rival of rivals.items) {
			delete rival.publishedNodeIds;
			delete rival.launchedFamilyIds;
			delete rival.eventCursor;
		}
		delete model.brandId;
		delete model.foundationId;
		delete model.foundationDebt;
		delete model.foundationRisk;
		const commandLog = fixture.commandLog as Record<string, unknown>[];
		const designCommand = commandLog.at(-1);
		if (designCommand === undefined) {
			throw new Error("Expected a design command");
		}
		delete designCommand.brandId;
		(fixture.meta as Record<string, unknown>).schemaVersion = 8;
		const before = JSON.stringify(fixture);

		const upgraded = upgradeGameState(fixture);
		const migrated = upgraded.models.items[0];
		if (migrated === undefined) throw new Error("Expected migrated model");

		expect(GAME_STATE_SCHEMA_VERSION).toBe(11);
		expect(upgraded.meta.schemaVersion).toBe(11);
		expect(migrated).toMatchObject({
			brandId: "brand_model_001",
			foundationId: "foundation_model_001",
			foundationDebt: 0,
			foundationRisk: 0,
		});
		expect(JSON.stringify(fixture)).toBe(before);
	});

	it("migrates a legacy successor with inherited default identities", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const designed = designModel(state, {
			...BASE_SPEC,
			name: "Legacy-Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const fixture = JSON.parse(serializeGameState(designed)) as Record<
			string,
			unknown
		>;
		const models = fixture.models as { items: Record<string, unknown>[] };
		const rivals = fixture.rivals as {
			items: Record<string, unknown>[];
		};
		for (const rival of rivals.items) {
			delete rival.publishedNodeIds;
			delete rival.launchedFamilyIds;
			delete rival.eventCursor;
		}
		for (const model of models.items) {
			delete model.brandId;
			delete model.foundationId;
			delete model.foundationDebt;
			delete model.foundationRisk;
		}
		const commandLog = fixture.commandLog as Record<string, unknown>[];
		for (const command of commandLog) {
			if (command.kind === "design_model") delete command.brandId;
		}
		(fixture.meta as Record<string, unknown>).schemaVersion = 8;

		const upgraded = upgradeGameState(fixture);
		const migratedParent = upgraded.models.items[0];
		const migratedSuccessor = upgraded.models.items[1];
		if (migratedParent === undefined || migratedSuccessor === undefined) {
			throw new Error("Expected migrated parent and successor");
		}

		expect(migratedSuccessor).toMatchObject({
			brandId: migratedParent.brandId,
			foundationId: migratedParent.foundationId,
			foundationDebt: 0,
			foundationRisk: 0,
		});
		expect(upgraded.commandLog.at(-1)).toMatchObject({
			kind: "design_model",
			brandId: migratedSuccessor.brandId,
		});
	});

	it("rejects v9 lineage fields smuggled into a v8 save", () => {
		const designed = designModel(designableState(), BASE_SPEC).state;
		const fixture = JSON.parse(serializeGameState(designed)) as Record<
			string,
			unknown
		>;
		(fixture.meta as Record<string, unknown>).schemaVersion = 8;

		expect(() => upgradeGameState(fixture)).toThrow(
			/v8.*unexpected.*lineage|lineage/i,
		);
	});

	it("rejects two fresh models sharing one foundation identity", () => {
		const state = designModel(designableState(), BASE_SPEC).state;
		const first = state.models.items.at(-1);
		if (first === undefined) throw new Error("Expected a model");
		const second = {
			...first,
			id: "model_002",
			name: "Duplicate Foundation",
			projectId: null,
		};
		delete second.dataAllocation;
		state.models.items.push(second);

		expect(() => assertGameState(state)).toThrow(
			/foundation.*identity|foundation.*lineage/i,
		);
	});

	it("rejects foundation parent cycles of any length", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const second = {
			...parent,
			id: "model_004",
			name: "Cycle-2",
			foundation: "continued" as const,
			parentModelId: "model_005",
		};
		const third = {
			...parent,
			id: "model_005",
			name: "Cycle-3",
			foundation: "continued" as const,
			parentModelId: "model_004",
		};
		state.models.items.push(second, third);

		expect(() => assertGameState(state)).toThrow(/cycle/i);
	});

	it("keeps a descendant valid when its parent is later shelved", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const successor = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const successorModel = successor.models.items.at(-1);
		if (successorModel === undefined)
			throw new Error("Expected a successor model");
		const shelvedParent = successor.models.items.find(
			(model) => model.id === parent.id,
		);
		if (shelvedParent === undefined)
			throw new Error("Expected the parent model");
		shelvedParent.status = "shelved";

		expect(() => assertGameState(successor)).not.toThrow();
	});

	it("can complete a descendant after its parent is shelved", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		let successor = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const shelvedParent = successor.models.items.find(
			(model) => model.id === parent.id,
		);
		const project = successor.projects.items.at(-1);
		if (
			shelvedParent === undefined ||
			project === undefined ||
			project.kind !== "training"
		) {
			throw new Error("Expected a shelved parent training scenario");
		}
		shelvedParent.status = "shelved";
		for (let week = 1; week <= project.duration; week += 1) {
			successor = trainingSystem(successor, { phase: "training", week }).state;
		}

		expect(successor.models.items.at(-1)?.status).toBe("ready");
	});

	it("rejects malformed foundation lineage field types", () => {
		const state = designModel(designableState(), BASE_SPEC).state;
		const model = state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected a model");
		(model as unknown as Record<string, unknown>).foundationId = 7;

		expect(() => assertGameState(state)).toThrow(
			/foundation id|integer|string/i,
		);
	});

	it("rejects a successor whose foundation identity differs from its parent", () => {
		const state = readyParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined) throw new Error("Expected a parent model");
		const successor = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const successorModel = successor.models.items.at(-1);
		if (successorModel === undefined)
			throw new Error("Expected a successor model");
		successorModel.foundationId = "foundation_forged";

		expect(() => assertGameState(successor)).toThrow(
			/foundation.*lineage|foundation id/i,
		);
	});

	it("rejects a current successor whose ready parent loses its lineage tuple", () => {
		const state = readyFreshParentState();
		const parent = state.models.items.at(-1);
		if (parent === undefined || parent.status !== "ready") {
			throw new Error("Expected a ready parent model");
		}

		const successorState = designModel(state, {
			...BASE_SPEC,
			name: "Aurora-2",
			foundation: "continued",
			parentModelId: parent.id,
		}).state;
		const successor = successorState.models.items.at(-1);
		const legacyParent = successorState.models.items.find(
			(model) => model.id === parent.id,
		);
		if (successor === undefined || legacyParent === undefined) {
			throw new Error("Expected a current successor and its parent");
		}
		expect(successor).toMatchObject({
			brandId: expect.any(String),
			foundationId: expect.any(String),
			foundationDebt: expect.any(Number),
			foundationRisk: expect.any(Number),
		});

		delete legacyParent.brandId;
		delete legacyParent.foundationId;
		delete legacyParent.foundationDebt;
		delete legacyParent.foundationRisk;

		expect(() => assertModelsState(successorState.models)).toThrow(/lineage/i);
	});

	it("rejects forged foundation identity and debt on a fresh root", () => {
		const state = designModel(designableState(), BASE_SPEC).state;
		const model = state.models.items.at(-1);
		if (model === undefined) throw new Error("Expected a fresh model");
		model.foundationId = "foundation_forged";
		model.foundationDebt = 99;
		model.foundationRisk = 99;

		expect(() => assertGameState(state)).toThrow(/fresh|deterministic|zero/i);
	});
});
