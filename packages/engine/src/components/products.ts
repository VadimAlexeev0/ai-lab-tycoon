export type ProductChannel = "chat" | "developer_api" | "enterprise";
export type ProductStatus = "planned" | "operating" | "paused";

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

export function assertProductsState(state: ProductsState): void {
	const ids: string[] = [];
	for (const product of state.items) {
		assertIdentifier(product.id, "product id");
		if (ids.includes(product.id)) {
			throw new Error(`Duplicate product id: ${product.id}`);
		}
		ids.push(product.id);
		assertIdentifier(product.modelId, "product model id");
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}
