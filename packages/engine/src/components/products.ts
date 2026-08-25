import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
} from "../validation.js";

export type ProductChannel = "chat" | "developer_api" | "enterprise";
export type ProductStatus = "planned" | "operating" | "paused";

const PRODUCT_CHANNELS = ["chat", "developer_api", "enterprise"] as const;
const PRODUCT_STATUSES = ["planned", "operating", "paused"] as const;

export type Product = {
	id: string;
	channel: ProductChannel;
	modelId: string;
	status: ProductStatus;
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

	const ids: string[] = [];
	for (const item of value.items) {
		assertExactObject(item, ["id", "channel", "modelId", "status"], "product");
		assertIdentifier(item.id, "Product id");
		if (ids.includes(item.id)) {
			throw new Error(`Duplicate product id: ${item.id}`);
		}
		ids.push(item.id);
		assertEnum(item.channel, PRODUCT_CHANNELS, "Product channel");
		assertIdentifier(item.modelId, "Product model id");
		assertEnum(item.status, PRODUCT_STATUSES, "Product status");
	}
}
