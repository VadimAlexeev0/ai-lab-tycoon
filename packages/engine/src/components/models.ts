import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNullableString,
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

export type Model = {
	id: string;
	name: string;
	foundation: ModelFoundation;
	status: ModelStatus;
	projectId: string | null;
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
		items: items.map((model) => ({ ...model })),
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
		assertExactObject(
			item,
			["id", "name", "foundation", "status", "projectId"],
			"model",
		);
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
	}

	if (value.activeModelId !== null) {
		assertIdentifier(value.activeModelId, "Active model id");
		if (!ids.includes(value.activeModelId)) {
			throw new Error("Active model must belong to the models component");
		}
	}
}
