import type {
	DataInventoryRecord,
	DataInventoryState,
} from "./components/data-inventory.js";
import type { DataAllocation, Model } from "./components/models.js";
import type { Product } from "./components/products.js";
import type { Fact } from "./components/reports.js";
import { BALANCE } from "./data/balance.js";
import {
	type DataSourceDefinition,
	getDataSourceDefinition,
} from "./data/data-sources.js";
import { DATA_MIX_DIMENSIONS, type DataMix } from "./data/model-families.js";
import { assertRunActive } from "./guards.js";
import { allocateId } from "./ids.js";
import { assertGameState } from "./invariants.js";
import type { EngineResult, GameState } from "./state.js";
import { appendFactsAsReports } from "./systems/reporting.js";
import {
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertNullableString,
	assertObject,
	assertPositiveInteger,
} from "./validation.js";

export type DataAcquisitionRequest = Readonly<{
	sourceId: string;
	productId?: string | null;
}>;

export type DataReservation = Readonly<{
	state: GameState;
	allocations: DataAllocation[];
	staleRecordIds: string[];
}>;

export type DataReservationOptions = Readonly<{
	/** Require every reserved record to meet this freshness percentage. */
	minimumFreshness?: number;
}>;

export type TrainingDataProfile = Readonly<{
	totalAmount: number;
	syntheticAmount: number;
	weightedQuality: number;
	weightedFreshness: number;
	/** Latest in-game availability week among the records actually allocated. */
	newestAvailableFromWeek: number | null;
	staleRecordIds: string[];
}>;

const TRAINING_BLOCKING_RESTRICTIONS = new Set([
	"research_only",
	"no_training",
]);

/** Acquire one source-defined strategic batch without mutating the input. */
export function acquireData(state: GameState, sourceId: string): EngineResult;
export function acquireData(
	state: GameState,
	request: DataAcquisitionRequest,
): EngineResult;
export function acquireData(
	state: GameState,
	requestOrSourceId: string | DataAcquisitionRequest,
): EngineResult {
	assertGameState(state);
	assertRunActive(state);
	const request = normalizeRequest(requestOrSourceId);
	const source = getDataSourceDefinition(request.sourceId);
	if (source === undefined) {
		throw new Error(`Unknown data source: ${request.sourceId}`);
	}
	const product = resolveEligibleProduct(state, source, request.productId);
	const productId = product?.id ?? null;
	if (
		source.provenance !== "product_derived" &&
		request.productId !== undefined
	) {
		throw new Error(
			`Data source ${source.id} is not product-derived and cannot use a product`,
		);
	}
	if (state.company.cash < source.acquisitionCost) {
		throw new Error(
			`Insufficient cash for ${source.id} acquisition cost ${source.acquisitionCost}`,
		);
	}

	let allocation = allocateId(state, "data");
	const dataId = allocation.id;
	allocation = allocateId(allocation.state, "command");
	const commandId = allocation.id;
	const record: DataInventoryRecord = {
		id: dataId,
		sourceId: source.id,
		provenance: source.provenance,
		quality: source.quality,
		freshness: source.freshness,
		modality: source.modality,
		usageRestrictions: [...source.usageRestrictions],
		rightsRisk: source.rightsRisk,
		quantity: source.quantity,
		consumedAmount: 0,
		reservedAmount: 0,
		availableFromWeek: state.meta.week + source.acquisitionTime,
		derivedFromProductId: productId,
	};
	const nextState: GameState = {
		...allocation.state,
		company: {
			...allocation.state.company,
			cash: allocation.state.company.cash - source.acquisitionCost,
		},
		dataInventory: {
			items: [
				...allocation.state.dataInventory.items.map(cloneDataRecord),
				record,
			],
		},
		commandLog: [
			...allocation.state.commandLog,
			{
				id: commandId,
				kind: "acquire_data",
				week: state.meta.week,
				dataId,
				sourceId: source.id,
				productId,
			},
		],
	};
	const facts: Fact[] = [
		...(source.acquisitionCost === 0
			? []
			: [
					{
						kind: "resource_changed" as const,
						resource: "cash" as const,
						amount: -source.acquisitionCost,
						week: state.meta.week,
					},
				]),
		{
			kind: "data_acquired",
			dataId,
			sourceId: source.id,
			provenance: source.provenance,
			quantity: source.quantity,
			cost: source.acquisitionCost,
			availableFromWeek: record.availableFromWeek,
			rightsRisk: source.rightsRisk,
			week: state.meta.week,
		},
	];
	const reportedState = appendFactsAsReports(nextState, facts);
	assertGameState(reportedState);
	return {
		state: reportedState,
		facts,
		pending: reportedState.decisions.pending.map((decision) => ({
			...decision,
		})),
	};
}

/** Compile the existing three-slider mix into deterministic record reservations. */
export function reserveDataForMix(
	state: GameState,
	dataMix: DataMix,
	options: DataReservationOptions = {},
): DataReservation {
	assertDataMix(dataMix);
	assertReservationOptions(options);
	const nextItems = state.dataInventory.items.map(cloneDataRecord);
	const allocations: DataAllocation[] = [];
	const staleRecordIds: string[] = [];

	for (const modality of DATA_MIX_DIMENSIONS) {
		const requested = dataMix[modality];
		if (requested === 0) continue;
		const candidates = nextItems.filter(
			(record) => record.modality === modality,
		);
		const usable = candidates.filter(
			(record) =>
				record.availableFromWeek <= state.meta.week &&
				record.usageRestrictions.every(
					(restriction) => !TRAINING_BLOCKING_RESTRICTIONS.has(restriction),
				) &&
				(options.minimumFreshness === undefined ||
					record.freshness >= options.minimumFreshness),
		);
		const availableAmount = usable.reduce(
			(total, record) =>
				total + record.quantity - record.consumedAmount - record.reservedAmount,
			0,
		);
		const hasBlockedCandidate = candidates.some(
			(record) =>
				record.availableFromWeek > state.meta.week ||
				record.usageRestrictions.some((restriction) =>
					TRAINING_BLOCKING_RESTRICTIONS.has(restriction),
				),
		);
		if (availableAmount < requested) {
			const reason =
				hasBlockedCandidate || candidates.length === 0
					? "locked or restricted"
					: "insufficient available quantity";
			throw new Error(
				`Insufficient ${modality} data for model training: ${reason} (requested ${requested}, available ${availableAmount})`,
			);
		}

		let remaining = requested;
		for (const record of usable) {
			if (remaining === 0) break;
			const available =
				record.quantity - record.consumedAmount - record.reservedAmount;
			const amount = Math.min(remaining, available);
			if (amount === 0) continue;
			record.reservedAmount += amount;
			allocations.push({ recordId: record.id, amount });
			if (record.freshness < BALANCE.dataInventory.stalenessThreshold) {
				staleRecordIds.push(record.id);
			}
			remaining -= amount;
		}
		if (remaining !== 0) {
			throw new Error(`Failed to reserve all ${modality} training data`);
		}
	}

	return {
		state: {
			...state,
			dataInventory: { items: nextItems },
		},
		allocations,
		staleRecordIds,
	};
}

/** Release a model's reservation when its training project is cancelled. */
export function releaseDataAllocations(
	inventory: DataInventoryState,
	allocations: readonly DataAllocation[],
): DataInventoryState {
	return updateDataAllocations(inventory, allocations, "release");
}

/** Move a model's reservation to consumed inventory exactly once. */
export function consumeDataAllocations(
	inventory: DataInventoryState,
	allocations: readonly DataAllocation[],
): DataInventoryState {
	return updateDataAllocations(inventory, allocations, "consume");
}

export function profileTrainingData(
	state: GameState,
	model: Model,
): TrainingDataProfile {
	const allocations = model.dataAllocation ?? [];
	let totalAmount = 0;
	let syntheticAmount = 0;
	let qualityTotal = 0;
	let freshnessTotal = 0;
	let newestAvailableFromWeek: number | null = null;
	const staleRecordIds: string[] = [];
	for (const allocation of allocations) {
		const record = state.dataInventory.items.find(
			(candidate) => candidate.id === allocation.recordId,
		);
		if (record === undefined) {
			throw new Error(
				`Model ${model.id} data allocation references unknown record ${allocation.recordId}`,
			);
		}
		totalAmount += allocation.amount;
		qualityTotal += record.quality * allocation.amount;
		freshnessTotal += record.freshness * allocation.amount;
		newestAvailableFromWeek =
			newestAvailableFromWeek === null
				? record.availableFromWeek
				: Math.max(newestAvailableFromWeek, record.availableFromWeek);
		if (record.provenance === "synthetic") syntheticAmount += allocation.amount;
		if (
			record.freshness < BALANCE.dataInventory.stalenessThreshold &&
			!staleRecordIds.includes(record.id)
		) {
			staleRecordIds.push(record.id);
		}
	}
	return {
		totalAmount,
		syntheticAmount,
		weightedQuality:
			totalAmount === 0 ? 100 : Math.trunc(qualityTotal / totalAmount),
		weightedFreshness:
			totalAmount === 0 ? 100 : Math.trunc(freshnessTotal / totalAmount),
		newestAvailableFromWeek,
		staleRecordIds,
	};
}

export function syntheticDataEffects(profile: TrainingDataProfile): Readonly<{
	qualityPenalty: number;
	debtAdded: number;
}> {
	const overuse = Math.max(
		0,
		profile.syntheticAmount - BALANCE.dataInventory.syntheticOveruseThreshold,
	);
	return {
		qualityPenalty:
			overuse * BALANCE.dataInventory.syntheticQualityPenaltyPerUnit,
		debtAdded: Math.min(
			100,
			overuse * BALANCE.dataInventory.syntheticDebtPerUnit,
		),
	};
}

function updateDataAllocations(
	inventory: DataInventoryState,
	allocations: readonly DataAllocation[],
	operation: "release" | "consume",
): DataInventoryState {
	const nextItems = inventory.items.map(cloneDataRecord);
	const allocationIds = new Set<string>();
	for (const allocation of allocations) {
		assertExactObject(allocation, ["recordId", "amount"], "Data allocation");
		assertIdentifier(allocation.recordId, "Data allocation record id");
		assertPositiveInteger(allocation.amount, "Data allocation amount");
		if (allocationIds.has(allocation.recordId)) {
			throw new Error(`Duplicate data allocation: ${allocation.recordId}`);
		}
		allocationIds.add(allocation.recordId);
	}
	for (const allocation of allocations) {
		const record = nextItems.find(
			(candidate) => candidate.id === allocation.recordId,
		);
		if (record === undefined) {
			throw new Error(`Unknown data allocation record: ${allocation.recordId}`);
		}
		if (record.reservedAmount < allocation.amount) {
			throw new Error(
				`Data allocation ${allocation.recordId} exceeds its reserved amount`,
			);
		}
		record.reservedAmount -= allocation.amount;
		if (operation === "consume") {
			record.consumedAmount += allocation.amount;
			if (record.consumedAmount > record.quantity) {
				throw new Error(
					`Data allocation ${allocation.recordId} exceeds its quantity`,
				);
			}
		}
	}
	return { items: nextItems };
}

function assertReservationOptions(value: DataReservationOptions): void {
	assertExactObject(
		value,
		Object.hasOwn(value, "minimumFreshness") ? ["minimumFreshness"] : [],
		"Data reservation options",
	);
	if (Object.hasOwn(value, "minimumFreshness")) {
		assertNonNegativeInteger(
			value.minimumFreshness,
			"Data reservation minimum freshness",
		);
		if (value.minimumFreshness > 100) {
			throw new Error("Data reservation minimum freshness must be at most 100");
		}
	}
}

function assertDataMix(value: DataMix): void {
	assertExactObject(value, DATA_MIX_DIMENSIONS, "Data mix");
	let total = 0;
	for (const dimension of DATA_MIX_DIMENSIONS) {
		assertNonNegativeInteger(value[dimension], `Data mix ${dimension}`);
		total += value[dimension];
	}
	if (total !== BALANCE.dataInventory.trainingUnits) {
		throw new Error(
			`Data mix must total exactly ${BALANCE.dataInventory.trainingUnits}`,
		);
	}
}

function normalizeRequest(value: string | DataAcquisitionRequest): {
	sourceId: string;
	productId?: string;
} {
	if (typeof value === "string") {
		assertIdentifier(value, "Data source id");
		return { sourceId: value };
	}
	assertObject(value, "Data acquisition request");
	assertExactObject(
		value,
		Object.hasOwn(value, "productId")
			? ["sourceId", "productId"]
			: ["sourceId"],
		"data acquisition request",
	);
	assertIdentifier(value.sourceId, "Data source id");
	if (!Object.hasOwn(value, "productId") || value.productId === null) {
		return { sourceId: value.sourceId };
	}
	assertNullableString(value.productId, "Data acquisition product id");
	if (value.productId === null) return { sourceId: value.sourceId };
	assertIdentifier(value.productId, "Data acquisition product id");
	return { sourceId: value.sourceId, productId: value.productId };
}

function resolveEligibleProduct(
	state: GameState,
	source: DataSourceDefinition,
	requestedProductId: string | undefined,
): Product | undefined {
	if (source.provenance !== "product_derived") {
		return undefined;
	}
	const product =
		requestedProductId === undefined
			? state.products.items.find(
					(candidate) =>
						candidate.status === "operating" &&
						source.eligibleProductChannels.includes(candidate.channel),
				)
			: state.products.items.find(
					(candidate) => candidate.id === requestedProductId,
				);
	if (
		product === undefined ||
		product.status !== "operating" ||
		!source.eligibleProductChannels.includes(product.channel)
	) {
		throw new Error(
			`Product-derived data requires an eligible operating product for ${source.id}`,
		);
	}
	return product;
}

function cloneDataRecord(record: DataInventoryRecord): DataInventoryRecord {
	return {
		...record,
		usageRestrictions: [...record.usageRestrictions],
	};
}
