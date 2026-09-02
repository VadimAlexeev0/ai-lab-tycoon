import { PRODUCT_PRESSURE_BALANCE } from "../data/balance.js";
import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertNonNegativeInteger,
	assertObject,
} from "../validation.js";

export type ProductChannel = "chat" | "developer_api" | "enterprise";
export type ProductStatus = "planned" | "operating" | "paused" | "retired";

const PRODUCT_CHANNELS = ["chat", "developer_api", "enterprise"] as const;
const PRODUCT_STATUSES = ["planned", "operating", "paused", "retired"] as const;
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
	"price",
	"lastMargin",
	"cumulativeMargin",
	"satisfaction",
	"churnRate",
	"retiredUsers",
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
	/** Player-controlled channel price; legacy products use channel default. */
	price?: number;
	/** Revenue less data-defined product operating costs for the last week. */
	lastMargin?: number;
	cumulativeMargin?: number;
	/** Retained customer sentiment and next-week churn pressure. */
	satisfaction?: number;
	churnRate?: number;
	/** Customers affected when this product was retired. */
	retiredUsers?: number;
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
			"satisfaction",
			"churnRate",
			"retiredUsers",
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
		if (Object.hasOwn(item, "price")) {
			assertProductPrice(product.channel, product.price);
		}
		for (const metric of ["satisfaction", "churnRate"] as const) {
			if (Object.hasOwn(item, metric) && (product[metric] as number) > 100) {
				throw new Error(`Product ${product.id} ${metric} must be at most 100`);
			}
		}
		for (const metric of ["lastMargin", "cumulativeMargin"] as const) {
			if (Object.hasOwn(item, metric)) {
				assertInteger(product[metric], `Product ${product.id} ${metric}`);
			}
		}
		if (product.status === "retired") {
			for (const field of [
				"price",
				"lastMargin",
				"cumulativeMargin",
				"satisfaction",
				"churnRate",
				"retiredUsers",
				"users",
				"servingDemand",
				"lastRevenue",
			] as const) {
				if (!Object.hasOwn(item, field)) {
					throw new Error(`Retired product ${product.id} must retain ${field}`);
				}
			}
			for (const metric of ["users", "servingDemand", "lastRevenue"] as const) {
				if (Object.hasOwn(item, metric) && product[metric] !== 0) {
					throw new Error(
						`Retired product ${product.id} must have zero ${metric}`,
					);
				}
			}
			if (product.satisfaction !== 0 || product.churnRate !== 100) {
				throw new Error(
					`Retired product ${product.id} must have zero satisfaction and full churn`,
				);
			}
			if (product.lastMargin !== 0) {
				throw new Error(
					`Retired product ${product.id} must have zero last margin`,
				);
			}
		} else if (
			Object.hasOwn(item, "retiredUsers") &&
			product.retiredUsers !== 0
		) {
			throw new Error(
				`Non-retired product ${product.id} cannot have retired users`,
			);
		}
	}
}

export function assertProductPrice(
	channel: ProductChannel,
	value: unknown,
): asserts value is number {
	assertNonNegativeInteger(value, "Product price");
	const tuning = PRODUCT_PRESSURE_BALANCE.channels[channel];
	if (value < tuning.minimumPrice || value > tuning.maximumPrice) {
		throw new Error(
			`Product ${channel} price must be between ${tuning.minimumPrice} and ${tuning.maximumPrice}`,
		);
	}
}
