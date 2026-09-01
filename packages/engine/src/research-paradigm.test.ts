import { describe, expect, it } from "vitest";
import { RESEARCH_PARADIGMS } from "./data/research/paradigms.js";
import { advanceWeek, applyDecision, startRun } from "./index.js";

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
		expect(selected.facts).toEqual([]);
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
});
