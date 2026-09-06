import {
	MODEL_FAMILY_IDS,
	type ModelFamilyId,
} from "../data/model-families.js";
import { getResearchDefinition } from "../data/research.js";
import { getRivalStrategyActions } from "../data/rivals.js";
import {
	assertArray,
	assertBoolean,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertObject,
	assertString,
} from "../validation.js";

export type RivalArchetype = "research_lab" | "platform" | "efficiency";
export type RivalFocus = "capability" | "reliability" | "distribution";

const RIVAL_ARCHETYPES = ["research_lab", "platform", "efficiency"] as const;
const RIVAL_FOCUSES = ["capability", "reliability", "distribution"] as const;

export type Rival = {
	id: string;
	name: string;
	archetype: RivalArchetype;
	focus: RivalFocus;
	progress: number;
	active: boolean;
	publishedNodeIds: string[];
	launchedFamilyIds: ModelFamilyId[];
	eventCursor: number;
	/** Command positions that emitted the authored strategy action prefix. */
	strategyCommandIds: string[];
};

export type RivalsState = {
	items: Rival[];
};

export function createRivalsState(items: Rival[] = []): RivalsState {
	return {
		items: items.map((rival) => ({
			...rival,
			publishedNodeIds: [...rival.publishedNodeIds],
			launchedFamilyIds: [...rival.launchedFamilyIds],
			strategyCommandIds: [...rival.strategyCommandIds],
		})),
	};
}

export function assertRivalsState(
	value: unknown,
): asserts value is RivalsState {
	assertExactObject(value, ["items"], "rivals");
	assertArray(value.items, "Rivals items");
	if (value.items.length > 3) {
		throw new Error("Rivals must contain at most three rivals");
	}

	const ids = new Set<string>();
	for (const item of value.items) {
		assertObject(item, "rival");
		const strategyFields = [
			"publishedNodeIds",
			"launchedFamilyIds",
			"eventCursor",
			"strategyCommandIds",
		] as const;
		const strategyFieldCount = strategyFields.filter((field) =>
			Object.hasOwn(item, field),
		).length;
		if (strategyFieldCount !== strategyFields.length) {
			throw new Error(
				`Rival ${String(item.id ?? "unknown")} must contain all strategy fields`,
			);
		}
		assertExactObject(
			item,
			[
				"id",
				"name",
				"archetype",
				"focus",
				"progress",
				"active",
				...strategyFields,
			],
			"rival",
		);
		assertIdentifier(item.id, "Rival id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate rival id: ${item.id}`);
		}
		ids.add(item.id);

		assertString(item.name, `Rival ${item.id} name`);
		if (item.name.trim().length === 0) {
			throw new Error(`Rival ${item.id} must have a name`);
		}
		assertEnum(item.archetype, RIVAL_ARCHETYPES, "Rival archetype");
		assertEnum(item.focus, RIVAL_FOCUSES, "Rival focus");
		assertNonNegativeInteger(item.progress, `Rival ${item.id} progress`);
		if (item.progress > 100) {
			throw new Error(`Rival ${item.id} progress must be at most 100`);
		}
		assertBoolean(item.active, `Rival ${item.id} active`);
		assertArray(item.publishedNodeIds, `Rival ${item.id} published nodes`);
		assertArray(item.launchedFamilyIds, `Rival ${item.id} launched families`);
		assertArray(
			item.strategyCommandIds,
			`Rival ${item.id} strategy command ids`,
		);
		const publishedNodeIdsInState = item.publishedNodeIds as string[];
		const launchedFamilyIdsInState = item.launchedFamilyIds as ModelFamilyId[];
		const strategyCommandIdsInState = item.strategyCommandIds as string[];
		assertNonNegativeInteger(item.eventCursor, `Rival ${item.id} event cursor`);
		if (strategyCommandIdsInState.length !== item.eventCursor) {
			throw new Error(
				`Rival ${item.id} strategy command ids must align with its event cursor`,
			);
		}
		for (const commandId of strategyCommandIdsInState) {
			assertIdentifier(commandId, `Rival ${item.id} strategy command id`);
		}
		const actions = getRivalStrategyActions(item.archetype);
		if (item.eventCursor > actions.length) {
			throw new Error(
				`Rival ${item.id} event cursor exceeds its strategy deck`,
			);
		}
		const publishedNodeIds: string[] = [];
		const launchedFamilyIds: ModelFamilyId[] = [];
		const seenPublishedNodeIds = new Set<string>();
		for (const nodeId of publishedNodeIdsInState) {
			assertIdentifier(nodeId, `Rival ${item.id} published node id`);
			if (seenPublishedNodeIds.has(nodeId)) {
				throw new Error(
					`Rival ${item.id} repeats published node id: ${nodeId}`,
				);
			}
			seenPublishedNodeIds.add(nodeId);
			if (getResearchDefinition(nodeId) === undefined) {
				throw new Error(
					`Rival ${item.id} references an unknown published research node: ${nodeId}`,
				);
			}
		}
		const seenLaunchedFamilyIds = new Set<ModelFamilyId>();
		for (const familyId of launchedFamilyIdsInState) {
			assertEnum(
				familyId,
				MODEL_FAMILY_IDS,
				`Rival ${item.id} launched family id`,
			);
			if (seenLaunchedFamilyIds.has(familyId)) {
				throw new Error(
					`Rival ${item.id} repeats launched family id: ${familyId}`,
				);
			}
			seenLaunchedFamilyIds.add(familyId);
		}
		for (let index = 0; index < item.eventCursor; index += 1) {
			const action = actions[index];
			if (action === undefined) {
				throw new Error(`Rival ${item.id} has an invalid strategy cursor`);
			}
			if (action.threshold > item.progress) {
				throw new Error(
					`Rival ${item.id} completed action ${action.id} before its threshold`,
				);
			}
			if (action.kind === "publication") {
				publishedNodeIds.push(action.nodeId);
			} else {
				launchedFamilyIds.push(action.familyId);
			}
		}
		if (!sameIds(publishedNodeIdsInState, publishedNodeIds)) {
			throw new Error(
				`Rival ${item.id} published node ids do not match its strategy cursor`,
			);
		}
		if (!sameIds(launchedFamilyIdsInState, launchedFamilyIds)) {
			throw new Error(
				`Rival ${item.id} launched family ids do not match its strategy cursor`,
			);
		}
		if (!item.active && item.eventCursor > 0) {
			throw new Error(
				`Inactive rival ${item.id} cannot have completed actions`,
			);
		}
	}
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((id, index) => id === right[index])
	);
}
