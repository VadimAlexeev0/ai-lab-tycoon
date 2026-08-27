import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertNonNegativeInteger,
	assertObject,
} from "../validation.js";

export type ProductChannel = "chat" | "developer_api" | "enterprise";
export type ProductStatus = "planned" | "operating" | "paused";

const PRODUCT_CHANNELS = ["chat", "developer_api", "enterprise"] as const;
const PRODUCT_STATUSES = ["planned", "operating", "paused"] as const;
const PRODUCT_KEYS = new Set([
	"id",
	"channel",
	"modelId",
	"status",
	"users",
	"lastRevenue",
	"cumulativeRevenue",
	"servingDemand",
	"effectiveQuality",
]);

export type Product = {
	id: string;
	channel: ProductChannel;
	modelId: string;
	status: ProductStatus;
	/**
	 * Current retained users. Pausing preserves this value; V1 resume uses
	 * persist-with-decay=0 and applies no growth tick until the next week.
	 */
	users?: number;
	lastRevenue?: number;
	cumulativeRevenue?: number;
	servingDemand?: number;
	effectiveQuality?: number;
};

export type ProductsState = {
	items: Product[];
};

export function createProductsState(items: Product[] = []): ProductsState {
	return {
		items: items.map((product) => ({ ...product })),
	};
}

export function assertProductsState(
	value: unknown,
): asserts value is ProductsState {
	assertExactObject(value, ["items"], "products");
	assertArray(value.items, "Products items");

	const ids = new Set<string>();
	for (const item of value.items) {
		assertObject(item, "product");
		const product = item as unknown as Product;
		for (const key of ["id", "channel", "modelId", "status"] as const) {
			if (!Object.hasOwn(item, key)) {
				throw new Error(`product is missing required field: ${key}`);
			}
		}
		for (const key of Reflect.ownKeys(item)) {
			if (typeof key !== "string" || !PRODUCT_KEYS.has(key)) {
				throw new Error(`product contains an unexpected field: ${String(key)}`);
			}
		}
		assertIdentifier(product.id, "Product id");
		if (ids.has(product.id)) {
			throw new Error(`Duplicate product id: ${product.id}`);
		}
		ids.add(product.id);
		assertEnum(product.channel, PRODUCT_CHANNELS, "Product channel");
		assertIdentifier(product.modelId, "Product model id");
		assertEnum(product.status, PRODUCT_STATUSES, "Product status");
		for (const metric of [
			"users",
			"lastRevenue",
			"cumulativeRevenue",
			"servingDemand",
			"effectiveQuality",
		] as const) {
			if (Object.hasOwn(item, metric)) {
				assertNonNegativeInteger(
					product[metric],
					`Product ${product.id} ${metric}`,
				);
			}
		}
		if (
			Object.hasOwn(item, "effectiveQuality") &&
			(product.effectiveQuality as number) > 100
		) {
			throw new Error(
				`Product ${product.id} effective quality must be at most 100`,
			);
		}
	}
}
