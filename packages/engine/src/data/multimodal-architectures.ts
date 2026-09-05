import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertNonNegativeInteger,
	assertString,
} from "../validation.js";
import {
	type DataMix,
	MAX_INCIDENT_EXPOSURE_PERCENT,
	type ModelFamilyId,
} from "./model-families.js";
import { getResearchDefinition } from "./research.js";

const MAX_ARCHITECTURE_COST_ADJUSTMENT = 1_000;
const MAX_ARCHITECTURE_DURATION_ADJUSTMENT = 10;
const MAX_ARCHITECTURE_COMPUTE_ADJUSTMENT = 10;

/** The four Era 3 architecture choices for multimodal successors. */
export const MULTIMODAL_ARCHITECTURE_PATH_IDS = [
	"unified",
	"encoder_bolt_on",
	"specialist_ensemble",
	"clean_rebuild",
] as const;
export type MultimodalArchitecturePath =
	(typeof MULTIMODAL_ARCHITECTURE_PATH_IDS)[number];

export const ARCHITECTURE_FOUNDATIONS = [
	"fresh",
	"continued",
	"distilled",
] as const;
export type ArchitectureFoundation = (typeof ARCHITECTURE_FOUNDATIONS)[number];

/**
 * Content contract for a multimodal architecture choice. The engine applies
 * these integer adjustments; it does not duplicate path tuning constants.
 */
export type MultimodalArchitecturePathDefinition = Readonly<{
	family: "multimodal";
	id: MultimodalArchitecturePath;
	displayName: string;
	allowedFoundations: readonly ArchitectureFoundation[];
	/** Research node that must be completed before this path is usable. */
	unlockedByResearchNodeId: string;
	/** Additional parent-family restriction; an empty list means no extra rule. */
	compatibleParentFamilies: readonly ModelFamilyId[];
	minimumDataMix: DataMix;
	costAdjustment: number;
	durationAdjustment: number;
	trainingComputeAdjustment: number;
	scoreCeilingAdjustment: number;
	/** Percentage of the broad channel's serving compute used by this path. */
	servingComputePerUserPercent: number;
	/** Percentage multiplier applied to the family's incident exposure. */
	incidentExposurePercent: number;
	/** Signed score-generation adjustment applied to reliability. */
	reliabilityScoreAdjustment: number;
	architectureDebtBase: number;
	architectureDebtRetentionPercent: number;
	architectureDebtAdded: number;
	resetArchitectureDebt: boolean;
}>;

/**
 * Era 3 architecture balance. `unified` represents a fully integrated model;
 * `encoder_bolt_on` is deliberately constrained to an existing lineage;
 * `specialist_ensemble` trades serving cost for flexible specialists; and
 * `clean_rebuild` is a fresh foundation with no inherited path debt.
 */
export const MULTIMODAL_ARCHITECTURE_PATHS = [
	{
		family: "multimodal",
		id: "unified",
		displayName: "Unified Architecture",
		allowedFoundations: ["fresh", "continued", "distilled"],
		unlockedByResearchNodeId: "multimodal_models_fusion",
		compatibleParentFamilies: [],
		minimumDataMix: { general: 20, code: 5, multimodal: 45 },
		costAdjustment: 260,
		durationAdjustment: 2,
		trainingComputeAdjustment: 3,
		scoreCeilingAdjustment: 8,
		servingComputePerUserPercent: 125,
		incidentExposurePercent: 110,
		reliabilityScoreAdjustment: 0,
		architectureDebtBase: 0,
		architectureDebtRetentionPercent: 0,
		architectureDebtAdded: 0,
		resetArchitectureDebt: true,
	},
	// ponytail: bolt-ons deliberately trade a lower ceiling and higher
	// reliability exposure for a cheaper compatible successor. Upgrade path:
	// move the lineage to unified or clean_rebuild when integrated training is
	// affordable and the encoder debt should be retired.
	{
		family: "multimodal",
		id: "encoder_bolt_on",
		displayName: "Encoder Bolt-Ons",
		allowedFoundations: ["continued", "distilled"],
		unlockedByResearchNodeId: "vision_encoders",
		compatibleParentFamilies: ["text", "assistant", "multimodal"],
		minimumDataMix: { general: 20, code: 5, multimodal: 20 },
		costAdjustment: -80,
		durationAdjustment: -1,
		trainingComputeAdjustment: -2,
		scoreCeilingAdjustment: -6,
		servingComputePerUserPercent: 80,
		incidentExposurePercent: 180,
		reliabilityScoreAdjustment: -12,
		architectureDebtBase: 25,
		architectureDebtRetentionPercent: 100,
		architectureDebtAdded: 15,
		resetArchitectureDebt: false,
	},
	{
		family: "multimodal",
		id: "specialist_ensemble",
		displayName: "Specialist Ensemble",
		allowedFoundations: ["fresh", "continued", "distilled"],
		unlockedByResearchNodeId: "multimodal_models_fusion",
		compatibleParentFamilies: [],
		minimumDataMix: { general: 15, code: 5, multimodal: 35 },
		costAdjustment: 60,
		durationAdjustment: 1,
		trainingComputeAdjustment: 1,
		scoreCeilingAdjustment: -10,
		servingComputePerUserPercent: 160,
		incidentExposurePercent: 130,
		reliabilityScoreAdjustment: -4,
		architectureDebtBase: 10,
		architectureDebtRetentionPercent: 50,
		architectureDebtAdded: 0,
		resetArchitectureDebt: false,
	},
	{
		family: "multimodal",
		id: "clean_rebuild",
		displayName: "Clean Rebuild",
		allowedFoundations: ["fresh"],
		unlockedByResearchNodeId: "multimodal_models_fusion",
		compatibleParentFamilies: [],
		minimumDataMix: { general: 25, code: 5, multimodal: 30 },
		costAdjustment: 180,
		durationAdjustment: 3,
		trainingComputeAdjustment: 2,
		scoreCeilingAdjustment: 2,
		servingComputePerUserPercent: 110,
		incidentExposurePercent: 90,
		reliabilityScoreAdjustment: 0,
		architectureDebtBase: 0,
		architectureDebtRetentionPercent: 0,
		architectureDebtAdded: 0,
		resetArchitectureDebt: true,
	},
] as const satisfies readonly MultimodalArchitecturePathDefinition[];

const ARCHITECTURE_PATH_KEYS = [
	"family",
	"id",
	"displayName",
	"allowedFoundations",
	"unlockedByResearchNodeId",
	"compatibleParentFamilies",
	"minimumDataMix",
	"costAdjustment",
	"durationAdjustment",
	"trainingComputeAdjustment",
	"scoreCeilingAdjustment",
	"servingComputePerUserPercent",
	"incidentExposurePercent",
	"reliabilityScoreAdjustment",
	"architectureDebtBase",
	"architectureDebtRetentionPercent",
	"architectureDebtAdded",
	"resetArchitectureDebt",
] as const;

export function getMultimodalArchitecturePath(
	id: string,
): MultimodalArchitecturePathDefinition | undefined {
	return MULTIMODAL_ARCHITECTURE_PATHS.find((path) => path.id === id);
}

/** Derive path debt without conflating it with foundation debt. */
export function deriveMultimodalArchitectureDebt(
	path: MultimodalArchitecturePathDefinition,
	parentDebt = 0,
): number {
	assertNonNegativeInteger(parentDebt, "Parent architecture debt");
	if (parentDebt > 100) {
		throw new Error("Parent architecture debt must be at most 100");
	}
	if (path.resetArchitectureDebt) return 0;
	const retained = Math.trunc(
		(parentDebt * path.architectureDebtRetentionPercent) / 100,
	);
	return Math.min(
		100,
		Math.max(path.architectureDebtBase, retained + path.architectureDebtAdded),
	);
}

/** Fail fast when authored architecture content drifts from its typed contract. */
export function assertMultimodalArchitecturePathDefinitions(
	value: readonly MultimodalArchitecturePathDefinition[],
): void {
	assertArray(value, "Multimodal architecture paths");
	const ids = new Set<string>();
	for (const path of value) {
		assertExactObject(path, ARCHITECTURE_PATH_KEYS, "architecture path");
		assertEnum(path.family, ["multimodal"], "Architecture path family");
		assertEnum(
			path.id,
			MULTIMODAL_ARCHITECTURE_PATH_IDS,
			"Architecture path id",
		);
		if (ids.has(path.id)) {
			throw new Error(`Duplicate architecture path id: ${path.id}`);
		}
		ids.add(path.id);
		assertString(path.displayName, `Architecture path ${path.id} display name`);
		if (path.displayName.trim().length === 0) {
			throw new Error(
				`Architecture path ${path.id} display name must not be empty`,
			);
		}
		assertUniqueEnums(
			path.allowedFoundations,
			ARCHITECTURE_FOUNDATIONS,
			`Architecture path ${path.id} foundations`,
		);
		if (path.allowedFoundations.length === 0) {
			throw new Error(
				`Architecture path ${path.id} needs an allowed foundation`,
			);
		}
		assertIdentifier(
			path.unlockedByResearchNodeId,
			`Architecture path ${path.id} research unlock id`,
		);
		if (getResearchDefinition(path.unlockedByResearchNodeId) === undefined) {
			throw new Error(
				`Architecture path ${path.id} references an unknown research unlock node`,
			);
		}
		assertUniqueEnums(
			path.compatibleParentFamilies,
			[
				"text",
				"assistant",
				"multimodal",
				"local_edge",
				"video",
				"agent",
				"world",
				"robotics",
			],
			`Architecture path ${path.id} parent families`,
		);
		assertExactObject(
			path.minimumDataMix,
			["general", "code", "multimodal"],
			`Architecture path ${path.id} data requirements`,
		);
		let requirementTotal = 0;
		for (const dimension of ["general", "code", "multimodal"] as const) {
			assertNonNegativeInteger(
				path.minimumDataMix[dimension],
				`Architecture path ${path.id} ${dimension} requirement`,
			);
			if (path.minimumDataMix[dimension] > 100) {
				throw new Error(
					`Architecture path ${path.id} ${dimension} requirement must be at most 100`,
				);
			}
			requirementTotal += path.minimumDataMix[dimension];
		}
		if (requirementTotal > 100) {
			throw new Error(
				`Architecture path ${path.id} data requirements cannot exceed 100`,
			);
		}
		for (const [name, valueToCheck] of [
			["cost adjustment", path.costAdjustment],
			["duration adjustment", path.durationAdjustment],
			["training compute adjustment", path.trainingComputeAdjustment],
			["score ceiling adjustment", path.scoreCeilingAdjustment],
			["reliability score adjustment", path.reliabilityScoreAdjustment],
		] as const) {
			assertInteger(valueToCheck, `Architecture path ${path.id} ${name}`);
		}
		if (
			path.costAdjustment < -MAX_ARCHITECTURE_COST_ADJUSTMENT ||
			path.costAdjustment > MAX_ARCHITECTURE_COST_ADJUSTMENT
		) {
			throw new Error(
				`Architecture path ${path.id} cost adjustment must be between -${MAX_ARCHITECTURE_COST_ADJUSTMENT} and ${MAX_ARCHITECTURE_COST_ADJUSTMENT}`,
			);
		}
		if (
			path.durationAdjustment < -MAX_ARCHITECTURE_DURATION_ADJUSTMENT ||
			path.durationAdjustment > MAX_ARCHITECTURE_DURATION_ADJUSTMENT
		) {
			throw new Error(
				`Architecture path ${path.id} duration adjustment must be between -${MAX_ARCHITECTURE_DURATION_ADJUSTMENT} and ${MAX_ARCHITECTURE_DURATION_ADJUSTMENT}`,
			);
		}
		if (
			path.trainingComputeAdjustment < -MAX_ARCHITECTURE_COMPUTE_ADJUSTMENT ||
			path.trainingComputeAdjustment > MAX_ARCHITECTURE_COMPUTE_ADJUSTMENT
		) {
			throw new Error(
				`Architecture path ${path.id} training compute adjustment must be between -${MAX_ARCHITECTURE_COMPUTE_ADJUSTMENT} and ${MAX_ARCHITECTURE_COMPUTE_ADJUSTMENT}`,
			);
		}
		for (const [name, valueToCheck] of [
			["serving compute multiplier", path.servingComputePerUserPercent],
			["incident exposure multiplier", path.incidentExposurePercent],
			["architecture debt base", path.architectureDebtBase],
			["architecture debt retention", path.architectureDebtRetentionPercent],
			["architecture debt added", path.architectureDebtAdded],
		] as const) {
			assertNonNegativeInteger(
				valueToCheck,
				`Architecture path ${path.id} ${name}`,
			);
		}
		if (
			path.servingComputePerUserPercent > MAX_INCIDENT_EXPOSURE_PERCENT ||
			path.incidentExposurePercent > MAX_INCIDENT_EXPOSURE_PERCENT
		) {
			throw new Error(
				`Architecture path ${path.id} percentage multipliers must be at most ${MAX_INCIDENT_EXPOSURE_PERCENT}`,
			);
		}
		if (
			path.scoreCeilingAdjustment < -100 ||
			path.scoreCeilingAdjustment > 100 ||
			path.reliabilityScoreAdjustment < -100 ||
			path.reliabilityScoreAdjustment > 100
		) {
			throw new Error(
				`Architecture path ${path.id} score adjustments must be between -100 and 100`,
			);
		}
		if (path.servingComputePerUserPercent < 1) {
			throw new Error(
				`Architecture path ${path.id} serving multiplier must be positive`,
			);
		}
		if (path.incidentExposurePercent < 1) {
			throw new Error(
				`Architecture path ${path.id} incident multiplier must be positive`,
			);
		}
		for (const [name, valueToCheck] of [
			["architecture debt base", path.architectureDebtBase],
			["architecture debt retention", path.architectureDebtRetentionPercent],
			["architecture debt added", path.architectureDebtAdded],
		] as const) {
			if (valueToCheck > 100) {
				throw new Error(
					`Architecture path ${path.id} ${name} must be at most 100`,
				);
			}
		}
		if (path.architectureDebtRetentionPercent > 100) {
			throw new Error(
				`Architecture path ${path.id} architecture debt retention must be at most 100`,
			);
		}
		assertBoolean(
			path.resetArchitectureDebt,
			`Architecture path ${path.id} reset debt`,
		);
	}
	if (ids.size !== MULTIMODAL_ARCHITECTURE_PATH_IDS.length) {
		throw new Error("All multimodal architecture paths must be defined");
	}
}

function assertUniqueEnums<T extends string>(
	values: readonly T[],
	allowed: readonly T[],
	path: string,
): void {
	assertArray(values, path);
	const seen = new Set<string>();
	for (const value of values) {
		assertEnum(value, allowed, path);
		if (seen.has(value)) throw new Error(`${path} repeats ${value}`);
		seen.add(value);
	}
}

assertMultimodalArchitecturePathDefinitions(MULTIMODAL_ARCHITECTURE_PATHS);
