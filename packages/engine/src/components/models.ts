import { BALANCE } from "../data/balance.js";
import {
	type DataMix,
	MODEL_DIMENSIONS,
	MODEL_EMPHASIS_DIMENSIONS,
	MODEL_FAMILY_IDS,
	MODEL_TIERS,
	type ModelDimension,
	type ModelEmphasis,
	type ModelFamilyId,
	type ModelTier,
} from "../data/model-families.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertNonNegativeInteger,
	assertNullableString,
	assertObject,
	assertString,
} from "../validation.js";

export type ModelFoundation = "fresh" | "continued" | "distilled";
export type ModelStatus =
	| "designing"
	| "training"
	| "ready"
	| "launched"
	| "shelved";

const MODEL_FOUNDATIONS = ["fresh", "continued", "distilled"] as const;
const MODEL_STATUSES = [
	"designing",
	"training",
	"ready",
	"launched",
	"shelved",
] as const;

export type ModelTrueScores = Record<ModelDimension, number>;
export type ModelEstimateBand = {
	estimate: number;
	lower: number;
	upper: number;
};
export type ModelEstimates = Record<ModelDimension, ModelEstimateBand>;

export type Model = {
	id: string;
	name: string;
	foundation: ModelFoundation;
	status: ModelStatus;
	projectId: string | null;
	family?: ModelFamilyId;
	parentModelId?: string | null;
	tier?: ModelTier;
	scoreCeiling?: number;
	dataMix?: DataMix;
	emphasis?: ModelEmphasis;
	/** Hidden until training completes; never project this field to a selector. */
	trueScores?: ModelTrueScores;
	estimates?: ModelEstimates;
};

export type ModelsState = {
	items: Model[];
	activeModelId: string | null;
};

export function createModelsState(
	items: Model[] = [],
	activeModelId: string | null = null,
): ModelsState {
	return {
		items: items.map(cloneModel),
		activeModelId,
	};
}

export function assertModelsState(
	value: unknown,
): asserts value is ModelsState {
	assertExactObject(value, ["items", "activeModelId"], "models");
	assertArray(value.items, "Models items");
	assertNullableString(value.activeModelId, "Active model id");

	const ids: string[] = [];
	for (const item of value.items) {
		assertObject(item, "model");
		assertAllowedModelKeys(item);
		assertRequiredModelFields(item);
		assertIdentifier(item.id, "Model id");
		if (ids.includes(item.id)) {
			throw new Error(`Duplicate model id: ${item.id}`);
		}
		ids.push(item.id);

		assertString(item.name, `Model ${item.id} name`);
		if (item.name.trim().length === 0) {
			throw new Error(`Model ${item.id} must have a name`);
		}
		assertEnum(item.foundation, MODEL_FOUNDATIONS, "Model foundation");
		assertEnum(item.status, MODEL_STATUSES, "Model status");
		assertNullableString(item.projectId, "Model project id");
		if (item.projectId !== null) {
			assertIdentifier(item.projectId, "Model project id");
		}

		if (Object.hasOwn(item, "family")) {
			assertEnum(item.family, MODEL_FAMILY_IDS, "Model family");
		}
		if (Object.hasOwn(item, "parentModelId")) {
			assertNullableString(item.parentModelId, "Model parent id");
			if (item.parentModelId !== null) {
				assertIdentifier(item.parentModelId, "Model parent id");
			}
		}
		if (Object.hasOwn(item, "tier")) {
			assertEnum(item.tier, MODEL_TIERS, "Model compute tier");
		}
		if (Object.hasOwn(item, "scoreCeiling")) {
			assertBoundedInteger(item.scoreCeiling, "Model score ceiling");
		}
		if (Object.hasOwn(item, "dataMix")) {
			assertDataMix(item.dataMix, `Model ${item.id} data mix`);
		}
		if (Object.hasOwn(item, "emphasis")) {
			assertEmphasis(item.emphasis, `Model ${item.id} emphasis`);
		}
		if (Object.hasOwn(item, "trueScores")) {
			assertScores(item.trueScores, `Model ${item.id} true scores`);
		}
		if (Object.hasOwn(item, "estimates")) {
			assertEstimates(item.estimates, `Model ${item.id} estimates`);
		}
	}

	if (value.activeModelId !== null) {
		assertIdentifier(value.activeModelId, "Active model id");
		if (!ids.includes(value.activeModelId)) {
			throw new Error("Active model must belong to the models component");
		}
	}
}

function cloneModel(model: Model): Model {
	return {
		...model,
		...(model.dataMix === undefined ? {} : { dataMix: { ...model.dataMix } }),
		...(model.emphasis === undefined
			? {}
			: { emphasis: { ...model.emphasis } }),
		...(model.trueScores === undefined
			? {}
			: { trueScores: { ...model.trueScores } }),
		...(model.estimates === undefined
			? {}
			: {
					estimates: Object.fromEntries(
						Object.entries(model.estimates).map(([dimension, band]) => [
							dimension,
							{ ...band },
						]),
					) as ModelEstimates,
				}),
	};
}

function assertAllowedModelKeys(value: Record<string, unknown>): void {
	const allowed = new Set([
		"id",
		"name",
		"foundation",
		"status",
		"projectId",
		"family",
		"parentModelId",
		"tier",
		"scoreCeiling",
		"dataMix",
		"emphasis",
		"trueScores",
		"estimates",
	]);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowed.has(key)) {
			throw new Error(`model contains an unexpected field: ${String(key)}`);
		}
	}
}

function assertRequiredModelFields(value: Record<string, unknown>): void {
	for (const key of ["id", "name", "foundation", "status", "projectId"]) {
		if (!Object.hasOwn(value, key)) {
			throw new Error(`model is missing required field: ${key}`);
		}
	}
}

function assertDataMix(value: unknown, path: string): asserts value is DataMix {
	assertExactObject(value, ["general", "code", "multimodal"], path);
	for (const dimension of ["general", "code", "multimodal"] as const) {
		assertNonNegativeBoundedInteger(value[dimension], `${path} ${dimension}`);
	}
	const dataMix = value as DataMix;
	if (dataMix.general + dataMix.code + dataMix.multimodal !== 100) {
		throw new Error(`${path} must total exactly 100`);
	}
}

function assertEmphasis(
	value: unknown,
	path: string,
): asserts value is ModelEmphasis {
	assertExactObject(value, MODEL_EMPHASIS_DIMENSIONS, path);
	for (const dimension of MODEL_EMPHASIS_DIMENSIONS) {
		assertNonNegativeInteger(value[dimension], `${path} ${dimension}`);
	}
	const emphasis = value as ModelEmphasis;
	if (
		emphasis.capability +
			emphasis.reliability +
			emphasis.safety +
			emphasis.efficiency !==
		BALANCE.modelEmphasisPoints
	) {
		throw new Error(
			`${path} must total exactly ${BALANCE.modelEmphasisPoints}`,
		);
	}
}

function assertScores(
	value: unknown,
	path: string,
): asserts value is ModelTrueScores {
	assertExactObject(value, MODEL_DIMENSIONS, path);
	for (const dimension of MODEL_DIMENSIONS) {
		assertBoundedInteger(value[dimension], `${path} ${dimension}`);
	}
}

function assertEstimates(
	value: unknown,
	path: string,
): asserts value is ModelEstimates {
	assertExactObject(value, MODEL_DIMENSIONS, path);
	for (const dimension of MODEL_DIMENSIONS) {
		const band = value[dimension];
		assertExactObject(
			band,
			["estimate", "lower", "upper"],
			`${path} ${dimension}`,
		);
		assertBoundedInteger(band.estimate, `${path} ${dimension} estimate`);
		assertBoundedInteger(band.lower, `${path} ${dimension} lower`);
		assertBoundedInteger(band.upper, `${path} ${dimension} upper`);
		if (band.lower > band.estimate || band.estimate > band.upper) {
			throw new Error(
				`${path} ${dimension} must be ordered lower <= estimate <= upper`,
			);
		}
	}
}

function assertBoundedInteger(
	value: unknown,
	path: string,
): asserts value is number {
	assertInteger(value, path);
	if (value < 0 || value > 100) {
		throw new Error(`${path} must be between 0 and 100`);
	}
}

function assertNonNegativeBoundedInteger(
	value: unknown,
	path: string,
): asserts value is number {
	assertBoundedInteger(value, path);
}
