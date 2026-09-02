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
	assertPositiveInteger,
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

export type DataAllocation = Readonly<{
	recordId: string;
	amount: number;
}>;

export type Model = {
	id: string;
	name: string;
	foundation: ModelFoundation;
	status: ModelStatus;
	projectId: string | null;
	family?: ModelFamilyId;
	parentModelId?: string | null;
	/** Market identity shared by models in the same public brand line. */
	brandId?: string;
	/** Technical identity shared by models in the same foundation line. */
	foundationId?: string;
	/** Bounded technical debt inherited from the foundation lineage. */
	foundationDebt?: number;
	/** Bounded hidden risk inherited from the foundation lineage. */
	foundationRisk?: number;
	tier?: ModelTier;
	scoreCeiling?: number;
	dataMix?: DataMix;
	dataAllocation?: DataAllocation[];
	/** Bounded technical debt caused by overusing synthetic training data. */
	dataDebt?: number;
	/** In-game week of the newest allocated training data. */
	knowledgeCutoff?: number;
	/** Weighted freshness of the allocated training data at completion. */
	knowledgeFreshness?: number;
	emphasis?: ModelEmphasis;
	/** Hidden until training completes; never project this field to a selector. */
	trueScores?: ModelTrueScores;
	/** Public uncertainty bands backed by an independently generated estimate. */
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

	const ids = new Set<string>();
	for (const item of value.items) {
		assertObject(item, "model");
		assertAllowedModelKeys(item);
		assertRequiredModelFields(item);
		assertIdentifier(item.id, "Model id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate model id: ${item.id}`);
		}
		ids.add(item.id);

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
		assertModelLineageFields(item);
		if (Object.hasOwn(item, "tier")) {
			assertEnum(item.tier, MODEL_TIERS, "Model compute tier");
		}
		if (Object.hasOwn(item, "scoreCeiling")) {
			assertBoundedInteger(item.scoreCeiling, "Model score ceiling");
		}
		if (Object.hasOwn(item, "dataMix")) {
			assertDataMix(item.dataMix, `Model ${item.id} data mix`);
		}
		if (Object.hasOwn(item, "dataAllocation")) {
			assertDataAllocation(
				item.dataAllocation,
				`Model ${item.id} data allocation`,
			);
		}
		if (Object.hasOwn(item, "dataDebt")) {
			assertBoundedInteger(item.dataDebt, `Model ${item.id} data debt`);
		}
		if (Object.hasOwn(item, "knowledgeCutoff")) {
			assertPositiveInteger(
				item.knowledgeCutoff,
				`Model ${item.id} knowledge cutoff`,
			);
		}
		if (Object.hasOwn(item, "knowledgeFreshness")) {
			assertBoundedInteger(
				item.knowledgeFreshness,
				`Model ${item.id} knowledge freshness`,
			);
		}
		if (
			Object.hasOwn(item, "knowledgeCutoff") !==
			Object.hasOwn(item, "knowledgeFreshness")
		) {
			throw new Error(
				`Model ${item.id} knowledge cutoff and freshness must be recorded together`,
			);
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

	assertFoundationParentReferences(value.items as Model[]);

	if (value.activeModelId !== null) {
		assertIdentifier(value.activeModelId, "Active model id");
		if (!ids.has(value.activeModelId)) {
			throw new Error("Active model must belong to the models component");
		}
	}
}

/**
 * ponytail: foundation risk is a bounded model-linked scalar for this wave,
 * while the persistent risk component remains the authoritative incident
 * history. Upgrade path: attach lineage-scoped inherited risk records when a
 * later model-family wave needs per-risk provenance.
 */
function assertModelLineageFields(value: Record<string, unknown>): void {
	const fields = [
		"brandId",
		"foundationId",
		"foundationDebt",
		"foundationRisk",
	];
	const present = fields.filter((field) => Object.hasOwn(value, field));
	if (present.length === 0) return;
	if (present.length !== fields.length) {
		throw new Error(
			`Model ${String(value.id)} lineage fields must be recorded together`,
		);
	}
	assertIdentifier(value.brandId, `Model ${String(value.id)} brand id`);
	assertIdentifier(
		value.foundationId,
		`Model ${String(value.id)} foundation id`,
	);
	assertBoundedInteger(
		value.foundationDebt,
		`Model ${String(value.id)} foundation debt`,
	);
	assertBoundedInteger(
		value.foundationRisk,
		`Model ${String(value.id)} foundation risk`,
	);
}

function retainedFoundationValue(
	parentValue: number,
	retentionPercent: number,
): number {
	if (retentionPercent === 0) return 0;
	const retained = Math.trunc((parentValue * retentionPercent) / 100);
	return parentValue > 0 ? Math.max(1, retained) : retained;
}

function assertLineageRelation(model: Model, parent: Model): void {
	if (model.foundationId === undefined) return;
	if (
		parent.foundationId === undefined ||
		parent.foundationDebt === undefined ||
		parent.foundationRisk === undefined
	) {
		// Legacy in-memory fixtures may predate the v9 lineage fields. The v9
		// migration supplies their deterministic defaults before persistence.
		return;
	}
	if (model.foundationId !== parent.foundationId) {
		throw new Error(
			`Model ${model.id} foundation lineage must match parent ${parent.id}`,
		);
	}
	const balance = BALANCE.modelFoundations[model.foundation];
	const expectedDebt = retainedFoundationValue(
		parent.foundationDebt,
		balance.debtRetentionPercent,
	);
	const expectedRisk = retainedFoundationValue(
		parent.foundationRisk,
		balance.riskRetentionPercent,
	);
	if (model.foundationDebt !== expectedDebt) {
		throw new Error(
			`Model ${model.id} foundation debt does not match its ${model.foundation} retention rule`,
		);
	}
	if (model.foundationRisk !== expectedRisk) {
		throw new Error(
			`Model ${model.id} foundation risk does not match its ${model.foundation} retention rule`,
		);
	}
	if (parent.dataDebt !== undefined && model.dataDebt !== undefined) {
		const expectedDataDebt = retainedFoundationValue(
			parent.dataDebt,
			balance.dataDebtRetentionPercent,
		);
		if (model.dataDebt < expectedDataDebt) {
			throw new Error(
				`Model ${model.id} data debt cannot fall below its ${model.foundation} retention rule`,
			);
		}
	}
}

function assertFoundationParentReferences(items: readonly Model[]): void {
	for (const model of items) {
		if (model.foundation === "fresh") {
			if (model.parentModelId !== undefined && model.parentModelId !== null) {
				throw new Error(`Fresh model ${model.id} cannot reference a parent`);
			}
			continue;
		}

		if (model.parentModelId === undefined || model.parentModelId === null) {
			throw new Error(
				`${model.foundation} model ${model.id} must reference a parent model`,
			);
		}
		if (model.parentModelId === model.id) {
			throw new Error(`Model ${model.id} cannot be its own foundation parent`);
		}
		const parent = items.find(
			(candidate) => candidate.id === model.parentModelId,
		);
		if (parent === undefined) {
			throw new Error(
				`${model.foundation} model ${model.id} references an unknown parent model`,
			);
		}
		if (
			parent.status !== "ready" &&
			parent.status !== "launched" &&
			parent.status !== "shelved"
		) {
			throw new Error(
				`Parent model ${parent.id} must be ready, launched, or a scored shelved ancestor`,
			);
		}
		if (parent.trueScores === undefined) {
			throw new Error(`Parent model ${parent.id} must have true scores`);
		}
		assertLineageRelation(model, parent);
	}

	const byId = new Map(items.map((model) => [model.id, model]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (modelId: string): void => {
		if (visiting.has(modelId)) {
			throw new Error(`Foundation lineage contains a cycle at ${modelId}`);
		}
		if (visited.has(modelId)) return;
		const model = byId.get(modelId);
		if (model === undefined) return;
		visiting.add(modelId);
		if (model.parentModelId !== undefined && model.parentModelId !== null) {
			visit(model.parentModelId);
		}
		visiting.delete(modelId);
		visited.add(modelId);
	};
	for (const model of items) visit(model.id);

	const freshFoundationOwners = new Map<string, string>();
	for (const model of items) {
		if (model.foundation !== "fresh" || model.foundationId === undefined) {
			continue;
		}
		const existingOwner = freshFoundationOwners.get(model.foundationId);
		if (existingOwner !== undefined) {
			throw new Error(
				`Fresh models ${existingOwner} and ${model.id} share foundation identity ${model.foundationId}`,
			);
		}
		freshFoundationOwners.set(model.foundationId, model.id);
	}
}

function cloneModel(model: Model): Model {
	return {
		...model,
		...(model.dataMix === undefined ? {} : { dataMix: { ...model.dataMix } }),
		...(model.dataAllocation === undefined
			? {}
			: {
					dataAllocation: model.dataAllocation.map((allocation) => ({
						...allocation,
					})),
				}),
		...(model.dataDebt === undefined ? {} : { dataDebt: model.dataDebt }),
		...(model.knowledgeCutoff === undefined
			? {}
			: { knowledgeCutoff: model.knowledgeCutoff }),
		...(model.knowledgeFreshness === undefined
			? {}
			: { knowledgeFreshness: model.knowledgeFreshness }),
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
		"brandId",
		"foundationId",
		"foundationDebt",
		"foundationRisk",
		"tier",
		"scoreCeiling",
		"dataMix",
		"dataAllocation",
		"dataDebt",
		"knowledgeCutoff",
		"knowledgeFreshness",
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

function assertDataAllocation(
	value: unknown,
	path: string,
): asserts value is DataAllocation[] {
	assertArray(value, path);
	const recordIds = new Set<string>();
	for (const allocation of value) {
		assertExactObject(allocation, ["recordId", "amount"], `${path} item`);
		assertIdentifier(allocation.recordId, `${path} record id`);
		if (recordIds.has(allocation.recordId)) {
			throw new Error(`${path} repeats record id: ${allocation.recordId}`);
		}
		recordIds.add(allocation.recordId);
		assertPositiveInteger(allocation.amount, `${path} amount`);
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
