import type { ProductChannel } from "../components/products.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertPositiveInteger,
	assertString,
} from "../validation.js";

export const DATA_PROVENANCES = [
	"acquired",
	"licensed",
	"product_derived",
	"synthetic",
] as const;
export type DataProvenance = (typeof DATA_PROVENANCES)[number];

/** The three strategic modalities compiled from the designer's three sliders. */
export const DATA_MODALITIES = ["general", "code", "multimodal"] as const;
export type DataModality = (typeof DATA_MODALITIES)[number];

/** Restrictions are deliberately coarse until source-level licensing exists. */
export const DATA_USAGE_RESTRICTIONS = [
	"training_only",
	"research_only",
	"no_training",
	"consent_required",
	"no_commercial",
	"no_external_release",
	"no_sublicense",
] as const;
export type DataUsageRestriction = (typeof DATA_USAGE_RESTRICTIONS)[number];

export type DataSourceId =
	| "web_corpus"
	| "licensed_code"
	| "licensed_vision"
	| "product_feedback"
	| "synthetic_curriculum"
	| "research_archive"
	| "legacy_forum_dump";

export type DataSourceDefinition = Readonly<{
	id: DataSourceId;
	label: string;
	provenance: DataProvenance;
	modality: DataModality;
	quality: number;
	freshness: number;
	rightsRisk: number;
	quantity: number;
	acquisitionCost: number;
	/** Weeks until this batch can be used by a model. */
	acquisitionTime: number;
	usageRestrictions: readonly DataUsageRestriction[];
	/** Operating product channels eligible to produce this source. */
	eligibleProductChannels: readonly ProductChannel[];
}>;

/**
 * Strategic source catalog for Wave 3.1. These are source-level records, not
 * individual examples; each source explicitly carries its cost, time, rights
 * risk, and restrictions into the inventory.
 *
 * ponytail: source-level dataset simulation is deferred; inventory records
 * strategic provenance and risk, not individual examples. Upgrade by adding a
 * paged example/consent ledger behind these stable source records.
 */
export const DATA_SOURCE_DEFINITIONS = [
	{
		id: "web_corpus",
		label: "Public web corpus",
		provenance: "acquired",
		modality: "general",
		quality: 100,
		freshness: 100,
		rightsRisk: 40,
		quantity: 300,
		acquisitionCost: 75,
		acquisitionTime: 1,
		usageRestrictions: ["no_external_release"],
		eligibleProductChannels: [],
	},
	{
		id: "licensed_code",
		label: "Licensed code archive",
		provenance: "licensed",
		modality: "code",
		quality: 100,
		freshness: 100,
		rightsRisk: 10,
		quantity: 300,
		acquisitionCost: 220,
		acquisitionTime: 2,
		usageRestrictions: ["no_sublicense"],
		eligibleProductChannels: [],
	},
	{
		id: "licensed_vision",
		label: "Licensed vision archive",
		provenance: "licensed",
		modality: "multimodal",
		quality: 100,
		freshness: 100,
		rightsRisk: 10,
		quantity: 300,
		acquisitionCost: 240,
		acquisitionTime: 2,
		usageRestrictions: ["no_sublicense"],
		eligibleProductChannels: [],
	},
	{
		id: "product_feedback",
		label: "Consented product feedback",
		provenance: "product_derived",
		modality: "general",
		quality: 85,
		freshness: 100,
		rightsRisk: 55,
		quantity: 300,
		acquisitionCost: 0,
		acquisitionTime: 1,
		usageRestrictions: ["consent_required"],
		eligibleProductChannels: ["chat", "developer_api", "enterprise"],
	},
	{
		id: "synthetic_curriculum",
		label: "Synthetic curriculum",
		provenance: "synthetic",
		modality: "general",
		quality: 65,
		freshness: 100,
		rightsRisk: 0,
		quantity: 300,
		acquisitionCost: 50,
		acquisitionTime: 1,
		usageRestrictions: ["training_only"],
		eligibleProductChannels: [],
	},
	{
		id: "research_archive",
		label: "Research-only archive",
		provenance: "acquired",
		modality: "general",
		quality: 80,
		freshness: 85,
		rightsRisk: 25,
		quantity: 300,
		acquisitionCost: 30,
		acquisitionTime: 1,
		usageRestrictions: ["research_only"],
		eligibleProductChannels: [],
	},
	{
		id: "legacy_forum_dump",
		label: "Legacy forum dump",
		provenance: "acquired",
		modality: "general",
		quality: 45,
		freshness: 20,
		rightsRisk: 70,
		quantity: 300,
		acquisitionCost: 20,
		acquisitionTime: 1,
		usageRestrictions: ["no_external_release"],
		eligibleProductChannels: [],
	},
] as const satisfies readonly DataSourceDefinition[];

const DATA_SOURCE_IDS = new Set<string>(
	DATA_SOURCE_DEFINITIONS.map((source) => source.id),
);

/** Opening data is granted as a finite lab allocation; procurement is explicit. */
export const STARTING_DATA_INVENTORY = [
	{
		id: "data_001",
		sourceId: "web_corpus",
		provenance: "acquired",
		quality: 100,
		freshness: 100,
		modality: "general",
		usageRestrictions: ["no_external_release"],
		rightsRisk: 40,
		quantity: 300,
		consumedAmount: 0,
		reservedAmount: 0,
		availableFromWeek: 1,
		derivedFromProductId: null,
	},
	{
		id: "data_002",
		sourceId: "licensed_code",
		provenance: "licensed",
		quality: 100,
		freshness: 100,
		modality: "code",
		usageRestrictions: ["no_sublicense"],
		rightsRisk: 10,
		quantity: 300,
		consumedAmount: 0,
		reservedAmount: 0,
		availableFromWeek: 1,
		derivedFromProductId: null,
	},
	{
		id: "data_003",
		sourceId: "licensed_vision",
		provenance: "licensed",
		quality: 100,
		freshness: 100,
		modality: "multimodal",
		usageRestrictions: ["no_sublicense"],
		rightsRisk: 10,
		quantity: 300,
		consumedAmount: 0,
		reservedAmount: 0,
		availableFromWeek: 1,
		derivedFromProductId: null,
	},
] as const;

export function getDataSourceDefinition(
	id: string,
): DataSourceDefinition | undefined {
	return DATA_SOURCE_DEFINITIONS.find((source) => source.id === id);
}

export function isDataSourceId(value: unknown): value is DataSourceId {
	return typeof value === "string" && DATA_SOURCE_IDS.has(value);
}

function assertPercentage(value: unknown, path: string): void {
	assertNonNegativeInteger(value, path);
	if (value > 100) throw new Error(`${path} must be between 0 and 100`);
}

/** Fail fast if authored source content drifts from the serializable contract. */
export function assertDataSourceDefinitions(
	value: readonly DataSourceDefinition[],
): void {
	assertArray(value, "Data source definitions");
	const ids = new Set<string>();
	for (const source of value) {
		assertExactObject(
			source,
			[
				"id",
				"label",
				"provenance",
				"modality",
				"quality",
				"freshness",
				"rightsRisk",
				"quantity",
				"acquisitionCost",
				"acquisitionTime",
				"usageRestrictions",
				"eligibleProductChannels",
			],
			"data source",
		);
		assertIdentifier(source.id, "Data source id");
		if (ids.has(source.id))
			throw new Error(`Duplicate data source id: ${source.id}`);
		ids.add(source.id);
		assertString(source.label, `Data source ${source.id} label`);
		if (source.label.trim().length === 0) {
			throw new Error(`Data source ${source.id} label must not be empty`);
		}
		assertEnum(source.provenance, DATA_PROVENANCES, "Data source provenance");
		assertEnum(source.modality, DATA_MODALITIES, "Data source modality");
		assertPercentage(source.quality, `Data source ${source.id} quality`);
		assertPercentage(source.freshness, `Data source ${source.id} freshness`);
		assertPercentage(source.rightsRisk, `Data source ${source.id} rights risk`);
		assertPositiveInteger(source.quantity, `Data source ${source.id} quantity`);
		assertNonNegativeInteger(
			source.acquisitionCost,
			`Data source ${source.id} acquisition cost`,
		);
		assertPositiveInteger(
			source.acquisitionTime,
			`Data source ${source.id} acquisition time`,
		);
		assertArray(
			source.usageRestrictions,
			`Data source ${source.id} restrictions`,
		);
		const restrictions = new Set<string>();
		for (const restriction of source.usageRestrictions) {
			assertEnum(
				restriction,
				DATA_USAGE_RESTRICTIONS,
				"Data usage restriction",
			);
			if (restrictions.has(restriction)) {
				throw new Error(
					`Data source ${source.id} repeats restriction: ${restriction}`,
				);
			}
			restrictions.add(restriction);
		}
		assertArray(
			source.eligibleProductChannels,
			`Data source ${source.id} eligible product channels`,
		);
		for (const channel of source.eligibleProductChannels) {
			assertEnum(
				channel,
				["chat", "developer_api", "enterprise"],
				"Product channel",
			);
		}
		if (
			source.provenance === "product_derived" &&
			source.eligibleProductChannels.length === 0
		) {
			throw new Error(
				`Product-derived source ${source.id} requires an eligible product channel`,
			);
		}
		if (
			source.provenance !== "product_derived" &&
			source.eligibleProductChannels.length > 0
		) {
			throw new Error(
				`Only product-derived source ${source.id} may declare eligible product channels`,
			);
		}
	}
}

assertDataSourceDefinitions(DATA_SOURCE_DEFINITIONS);
