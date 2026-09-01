import { describe, expect, it } from "vitest";
import type { Model } from "./components/models.js";
import { assertFact } from "./components/reports.js";
import { computeReservations } from "./compute-reservations.js";
import { BALANCE } from "./data/balance.js";
import { RESEARCH_PARADIGMS } from "./data/research/paradigms.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";
import {
	designModel,
	generateTrueScores,
	type ModelDesignSpec,
} from "./model-design.js";
import { deriveResearchEffects } from "./research-effects.js";

const SCALE_MODEL_SPEC: ModelDesignSpec = {
	name: "Scale-1",
	family: "text",
	foundation: "fresh",
	tier: "standard",
	dataMix: { general: 60, code: 30, multimodal: 10 },
	emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
};

describe("Era-1 paradigm decision", () => {
	it("exposes one blocking decision with the three Era-1 paradigm choices", () => {
		const result = advanceWeek(startRun({ companyName: "Acme Labs" }, 42));
		const pending = result.state.decisions.pending;

		expect(pending).toHaveLength(1);
		const decision = pending[0] as unknown as {
			kind: string;
			blocking: boolean;
			choices: readonly string[];
		};
		expect(decision).toMatchObject({ kind: "paradigm", blocking: true });
		expect(decision.choices).toHaveLength(3);
		expect(new Set(decision.choices)).toEqual(
			new Set([
				"scale_maximalism",
				"data_curation_doctrine",
				"architecture_tinkering",
			]),
		);
		expect(result.state.queue.decisionIds).toEqual(["decision_001"]);
		expect(result.state.counters.decision).toBe(2);
	});

	it("resolves one selection and prevents duplicate or repeat selection", () => {
		const offered = advanceWeek(startRun({ companyName: "Acme Labs" }, 42));
		const decision = offered.state.decisions.pending[0];
		if (decision?.kind !== "paradigm") {
			throw new Error("Expected a paradigm decision");
		}

		expect(() => advanceWeek(offered.state)).toThrow(/blocking decision/i);

		const selected = applyDecision(offered.state, {
			kind: "paradigm",
			decisionId: decision.id,
			paradigmId: "data_curation_doctrine",
		});
		expect(offered.state.research.paradigmId).toBeNull();
		expect(selected.state.research.paradigmId).toBe("data_curation_doctrine");
		expect(selected.state.decisions.pending).toEqual([]);
		expect(selected.state.queue.decisionIds).toEqual([]);
		expect(selected.facts).toEqual([
			{
				kind: "paradigm_selected",
				paradigmId: "data_curation_doctrine",
				era: "text",
				week: offered.state.meta.week,
			},
		]);
		const reportCountBeforeSelection = offered.state.reports.items.length;
		expect(selected.state.reports.items).toHaveLength(
			reportCountBeforeSelection + 1,
		);
		const paradigmReport = selected.state.reports.items.find(
			(report) => report.fact.kind === "paradigm_selected",
		);
		if (paradigmReport === undefined) {
			throw new Error("Expected one paradigm selection report");
		}
		expect(paradigmReport).toMatchObject({
			priority: "important",
			fact: selected.facts[0],
		});
		expect(selected.state.queue.reportIds).toContain(paradigmReport.id);
		expect(() =>
			assertFact({
				kind: "paradigm_selected",
				paradigmId: "not_a_catalog_paradigm",
				era: "text",
				week: 1,
			}),
		).toThrow(/unknown research paradigm|paradigm/i);
		expect(selected.state.commandLog.at(-1)).toMatchObject({
			kind: "apply_decision",
			choice: {
				kind: "paradigm",
				decisionId: decision.id,
				paradigmId: "data_curation_doctrine",
			},
		});

		expect(() =>
			applyDecision(selected.state, {
				kind: "paradigm",
				decisionId: decision.id,
				paradigmId: "architecture_tinkering",
			}),
		).toThrow(/unknown decision|already selected/i);

		const nextWeek = advanceWeek(selected.state);
		expect(nextWeek.state.research.paradigmId).toBe("data_curation_doctrine");
		expect(
			nextWeek.state.decisions.pending.some((item) => item.kind === "paradigm"),
		).toBe(false);
	});

	it("rejects an arbitrary paradigm choice without mutating the offer", () => {
		const offered = advanceWeek(startRun({ companyName: "Acme Labs" }, 42));
		const decision = offered.state.decisions.pending[0];
		if (decision?.kind !== "paradigm") {
			throw new Error("Expected a paradigm decision");
		}

		expect(() =>
			applyDecision(offered.state, {
				kind: "paradigm",
				decisionId: decision.id,
				paradigmId: "not_a_catalog_paradigm" as never,
			}),
		).toThrow(/paradigm|unsupported/i);
		expect(offered.state.research.paradigmId).toBeNull();
		expect(offered.state.decisions.pending).toEqual([decision]);
	});

	it("rejects a tampered paradigm choice set before resolution", () => {
		const offered = advanceWeek(startRun({ companyName: "Acme Labs" }, 42));
		const tampered = {
			...offered.state,
			decisions: {
				pending: offered.state.decisions.pending.map((item) =>
					item.kind === "paradigm"
						? {
								...item,
								choices: [
									"scale_maximalism",
									"scale_maximalism",
									"architecture_tinkering",
								] as never,
							}
						: item,
				),
			},
		};
		const decision = tampered.decisions.pending[0];
		if (decision?.kind !== "paradigm") {
			throw new Error("Expected a paradigm decision");
		}

		expect(() =>
			applyDecision(tampered, {
				kind: "paradigm",
				decisionId: decision.id,
				paradigmId: "scale_maximalism",
			}),
		).toThrow(/duplicate|exactly|paradigm/i);
	});

	it("catalogs a real benefit and liability for every Era-1 choice", () => {
		expect(RESEARCH_PARADIGMS).toHaveLength(3);
		expect(
			RESEARCH_PARADIGMS.every((definition) => definition.effects.length >= 2),
		).toBe(true);
	});

	it("applies selected Scale Maximalism to model ceiling and training compute", () => {
		const state = startRun({ companyName: "Scale Lab" }, 42);
		state.research.paradigmId = "scale_maximalism";
		const textModels = state.research.nodes.find(
			(node) => node.id === "text_models_principles",
		);
		if (textModels === undefined) {
			throw new Error("Expected the Text model research node");
		}
		textModels.status = "completed";

		const designed = designModel(state, SCALE_MODEL_SPEC).state;

		expect(designed.models.items.at(-1)?.scoreCeiling).toBe(96);
		expect(computeReservations(designed).trainingDemand).toBe(
			BALANCE.modelTiers.standard.trainingCompute + 2,
		);
	});

	it("increases the existing data-mix contribution under Data Curation", () => {
		const state = startRun({ companyName: "Curation Lab" }, 42);
		const model: Model = {
			id: "model_001",
			name: "Curation-1",
			foundation: "fresh",
			status: "designing",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 100,
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		};
		const baseline = generateTrueScores(
			state.rng,
			model,
			undefined,
			deriveResearchEffects(state.research),
		);

		state.research.paradigmId = "data_curation_doctrine";
		const curatedEffects = deriveResearchEffects(state.research);
		const curated = generateTrueScores(
			state.rng,
			model,
			undefined,
			curatedEffects,
		);

		expect(curatedEffects.dataQualityImpactBonus).toBe(20);
		expect(curated.trueScores.capability).toBeGreaterThan(
			baseline.trueScores.capability,
		);
	});

	it("widens Architecture Tinkering uncertainty without changing RNG progression", () => {
		const state = startRun({ companyName: "Architecture Lab" }, 42);
		const model: Model = {
			id: "model_001",
			name: "Architecture-1",
			foundation: "fresh",
			status: "designing",
			projectId: null,
			family: "text",
			tier: "standard",
			scoreCeiling: 100,
			dataMix: { general: 60, code: 30, multimodal: 10 },
			emphasis: { capability: 2, reliability: 2, safety: 1, efficiency: 1 },
		};
		const baselineEffects = deriveResearchEffects(state.research);
		const baseline = generateTrueScores(
			state.rng,
			model,
			undefined,
			baselineEffects,
		);

		state.research.paradigmId = "architecture_tinkering";
		const tinkeringEffects = deriveResearchEffects(state.research);
		const tinkering = generateTrueScores(
			state.rng,
			model,
			undefined,
			tinkeringEffects,
		);
		const repeated = generateTrueScores(
			state.rng,
			model,
			undefined,
			tinkeringEffects,
		);

		expect(tinkeringEffects.trainingVarianceBonus).toBe(3);
		expect(tinkering.rng).toEqual(baseline.rng);
		expect(tinkering).toEqual(repeated);
		expect(tinkering.estimates).not.toEqual(baseline.estimates);
	});
});
