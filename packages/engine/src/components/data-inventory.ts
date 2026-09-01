import {
	DATA_MODALITIES,
	DATA_PROVENANCES,
	DATA_USAGE_RESTRICTIONS,
	type DataModality,
	type DataProvenance,
	type DataUsageRestriction,
	getDataSourceDefinition,
} from "../data/data-sources.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertNullableString,
	assertPositiveInteger,
} from "../validation.js";

export type DataInventoryRecord = {
	id: string;
	sourceId: string;
	provenance: DataProvenance;
	quality: number;
	freshness: number;
	modality: DataModality;
	usageRestrictions: readonly DataUsageRestriction[];
	rightsRisk: number;
	quantity: number;
	consumedAmount: number;
	reservedAmount: number;
	/** Week one means immediately usable; later weeks remain locked. */
	availableFromWeek: number;
	/** Product identity is retained for product-derived provenance/auditability. */
	derivedFromProductId: string | null;
};

export type DataInventoryState = {
	items: DataInventoryRecord[];
};

export function createDataInventoryState(
	items: readonly DataInventoryRecord[] = [],
): DataInventoryState {
	return {
		items: items.map((item) => ({
			...item,
			usageRestrictions: [...item.usageRestrictions],
		})),
	};
}

/** Validate the exact persisted inventory shape and each source's authored facts. */
export function assertDataInventoryState(
	value: unknown,
): asserts value is DataInventoryState {
	assertExactObject(value, ["items"], "data inventory");
	assertArray(value.items, "Data inventory items");
	const ids = new Set<string>();

	for (const item of value.items) {
		assertExactObject(
			item,
			[
				"id",
				"sourceId",
				"provenance",
				"quality",
				"freshness",
				"modality",
				"usageRestrictions",
				"rightsRisk",
				"quantity",
				"consumedAmount",
				"reservedAmount",
				"availableFromWeek",
				"derivedFromProductId",
			],
			"data inventory record",
		);
		assertIdentifier(item.id, "Data inventory id");
		if (ids.has(item.id)) {
			throw new Error(`Duplicate data inventory id: ${item.id}`);
		}
		ids.add(item.id);
		assertIdentifier(item.sourceId, `Data record ${item.id} source id`);
		const source = getDataSourceDefinition(item.sourceId);
		if (source === undefined) {
			throw new Error(`Unknown data source id: ${item.sourceId}`);
		}
		assertEnum(item.provenance, DATA_PROVENANCES, "Data provenance");
		assertEnum(item.modality, DATA_MODALITIES, "Data modality");
		if (item.provenance !== source.provenance) {
			throw new Error(
				`Data record ${item.id} provenance does not match its source`,
			);
		}
		if (item.modality !== source.modality) {
			throw new Error(
				`Data record ${item.id} modality does not match its source`,
			);
		}
		if (item.quality !== source.quality) {
			throw new Error(
				`Data record ${item.id} quality does not match its source`,
			);
		}
		if (item.freshness !== source.freshness) {
			throw new Error(
				`Data record ${item.id} freshness does not match its source`,
			);
		}
		if (item.rightsRisk !== source.rightsRisk) {
			throw new Error(
				`Data record ${item.id} rights risk does not match its source`,
			);
		}
		assertPercentage(item.quality, `Data record ${item.id} quality`);
		assertPercentage(item.freshness, `Data record ${item.id} freshness`);
		assertPercentage(item.rightsRisk, `Data record ${item.id} rights risk`);
		assertArray(item.usageRestrictions, `Data record ${item.id} restrictions`);
		if (item.usageRestrictions.length !== source.usageRestrictions.length) {
			throw new Error(
				`Data record ${item.id} restrictions do not match its source`,
			);
		}
		const restrictions = new Set<string>();
		for (const restriction of item.usageRestrictions) {
			assertEnum(
				restriction,
				DATA_USAGE_RESTRICTIONS,
				"Data usage restriction",
			);
			if (restrictions.has(restriction)) {
				throw new Error(
					`Data record ${item.id} repeats restriction: ${restriction}`,
				);
			}
			restrictions.add(restriction);
		}
		for (const restriction of source.usageRestrictions) {
			if (!restrictions.has(restriction)) {
				throw new Error(
					`Data record ${item.id} restrictions do not match its source`,
				);
			}
		}
		assertPositiveInteger(item.quantity, `Data record ${item.id} quantity`);
		if (item.quantity !== source.quantity) {
			throw new Error(
				`Data record ${item.id} quantity does not match its source`,
			);
		}
		assertNonNegativeInteger(
			item.consumedAmount,
			`Data record ${item.id} consumed amount`,
		);
		assertNonNegativeInteger(
			item.reservedAmount,
			`Data record ${item.id} reserved amount`,
		);
		if (item.consumedAmount + item.reservedAmount > item.quantity) {
			throw new Error(
				`Data record ${item.id} consumed and reserved amounts exceed quantity`,
			);
		}
		assertPositiveInteger(
			item.availableFromWeek,
			`Data record ${item.id} available-from week`,
		);
		assertNullableString(
			item.derivedFromProductId,
			`Data record ${item.id} derived product id`,
		);
		if (item.derivedFromProductId !== null) {
			assertIdentifier(
				item.derivedFromProductId,
				`Data record ${item.id} derived product id`,
			);
		}
		if (
			item.provenance === "product_derived" &&
			item.derivedFromProductId === null
		) {
			throw new Error(
				`Product-derived data record ${item.id} must retain its source product`,
			);
		}
		if (
			item.provenance !== "product_derived" &&
			item.derivedFromProductId !== null
		) {
			throw new Error(
				`Only product-derived data record ${item.id} may reference a source product`,
			);
		}
	}
}

function assertPercentage(value: unknown, path: string): void {
	assertNonNegativeInteger(value, path);
	if (value > 100) throw new Error(`${path} must be between 0 and 100`);
}
