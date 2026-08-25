export type ModelFoundation = "fresh" | "continued" | "distilled";
export type ModelStatus =
	| "designing"
	| "training"
	| "ready"
	| "launched"
	| "shelved";

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

export function assertModelsState(state: ModelsState): void {
	const ids: string[] = [];
	for (const model of state.items) {
		assertIdentifier(model.id, "model id");
		if (ids.includes(model.id)) {
			throw new Error(`Duplicate model id: ${model.id}`);
		}
		ids.push(model.id);

		if (model.name.trim().length === 0) {
			throw new Error(`Model ${model.id} must have a name`);
		}
		if (model.projectId !== null) {
			assertIdentifier(model.projectId, "model project id");
		}
	}

	if (state.activeModelId !== null && !ids.includes(state.activeModelId)) {
		throw new Error("Active model must belong to the models component");
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}
