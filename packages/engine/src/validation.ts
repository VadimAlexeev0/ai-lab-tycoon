export type UnknownRecord = Record<string, unknown>;

const ARRAY_INDEX_PATTERN = /^(0|[1-9]\d*)$/;

export function assertObject(
	value: unknown,
	path: string,
): asserts value is UnknownRecord {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error(`${path} must be a plain object`);
	}
}

export function assertExactObject(
	value: unknown,
	keys: readonly string[],
	path: string,
): asserts value is UnknownRecord {
	assertObject(value, path);
	const expected = new Set(keys);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new Error(`${path} must not contain symbol keys`);
		}
		if (!expected.has(key)) {
			throw new Error(`${path} contains an unexpected field: ${key}`);
		}
	}
	for (const key of keys) {
		if (!Object.hasOwn(value, key)) {
			throw new Error(`${path} is missing required field: ${key}`);
		}
	}
}

export function assertArray(
	value: unknown,
	path: string,
): asserts value is unknown[] {
	if (
		!Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Array.prototype
	) {
		throw new Error(`${path} must be a plain array`);
	}

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new Error(`${path} must not contain symbol keys`);
		}
		if (key === "length") {
			continue;
		}
		if (
			!ARRAY_INDEX_PATTERN.test(key) ||
			Number(key) >= value.length ||
			String(Number(key)) !== key
		) {
			throw new Error(
				`${path} contains an unexpected array own property: ${key}`,
			);
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (
			descriptor === undefined ||
			!descriptor.enumerable ||
			!("value" in descriptor)
		) {
			throw new Error(`${path}.${key} must be an enumerable data property`);
		}
	}

	for (let index = 0; index < value.length; index += 1) {
		if (!Object.hasOwn(value, String(index))) {
			throw new Error(`${path} must not contain sparse elements`);
		}
	}
}

export function assertString(
	value: unknown,
	path: string,
): asserts value is string {
	if (typeof value !== "string") {
		throw new Error(`${path} must be a string`);
	}
}

export function assertBoolean(
	value: unknown,
	path: string,
): asserts value is boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${path} must be a boolean`);
	}
}

export function assertIdentifier(
	value: unknown,
	path: string,
): asserts value is string {
	assertString(value, path);
	if (value.trim().length === 0) {
		throw new Error(`${path} must not be empty`);
	}
}

export function assertInteger(
	value: unknown,
	path: string,
): asserts value is number {
	if (!Number.isInteger(value) || Object.is(value, -0)) {
		throw new Error(`${path} must be an integer and not negative zero`);
	}
}

export function assertNonNegativeInteger(
	value: unknown,
	path: string,
): asserts value is number {
	assertInteger(value, path);
	if (value < 0) {
		throw new Error(`${path} must be a non-negative integer`);
	}
}

export function assertPositiveInteger(
	value: unknown,
	path: string,
): asserts value is number {
	assertInteger(value, path);
	if (value < 1) {
		throw new Error(`${path} must be a positive integer`);
	}
}

export function assertUnsignedInteger(
	value: unknown,
	path: string,
): asserts value is number {
	assertInteger(value, path);
	if (value < 0 || value > 4_294_967_295) {
		throw new Error(`${path} must be an unsigned 32-bit integer`);
	}
}

export function assertSafeInteger(
	value: unknown,
	path: string,
): asserts value is number {
	assertInteger(value, path);
	if (!Number.isSafeInteger(value)) {
		throw new Error(`${path} must be a safe integer`);
	}
}

export function assertNullableString(
	value: unknown,
	path: string,
): asserts value is string | null {
	if (value !== null) {
		assertString(value, path);
	}
}

export function assertEnum<T extends string>(
	value: unknown,
	values: readonly T[],
	path: string,
): asserts value is T {
	if (typeof value !== "string" || !values.includes(value as T)) {
		throw new Error(`${path} has an unsupported value: ${String(value)}`);
	}
}

export function assertJsonCompatible(value: unknown, path = "state"): void {
	assertJsonValue(value, path, new WeakSet<object>());
}

function assertJsonValue(
	value: unknown,
	path: string,
	active: WeakSet<object>,
): void {
	if (
		value === undefined ||
		typeof value === "function" ||
		typeof value === "symbol" ||
		typeof value === "bigint"
	) {
		throw new Error(`${path} contains a non-JSON value`);
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error(`${path} contains a non-finite number`);
		}
		if (Object.is(value, -0)) {
			throw new Error(`${path} contains negative zero, which is not JSON-safe`);
		}
	}
	if (value === null || typeof value !== "object") {
		return;
	}

	const prototype = Object.getPrototypeOf(value);
	if (
		(Array.isArray(value) && prototype !== Array.prototype) ||
		(!Array.isArray(value) && prototype !== Object.prototype)
	) {
		throw new Error(`${path} must contain plain objects and arrays only`);
	}
	if (active.has(value)) {
		throw new Error(`${path} contains a cycle`);
	}

	active.add(value);
	if (Array.isArray(value)) {
		assertArray(value, path);
		for (let index = 0; index < value.length; index += 1) {
			assertJsonValue(value[index], `${path}[${index}]`, active);
		}
	} else {
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") {
				throw new Error(`${path} must not contain symbol keys`);
			}
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (
				descriptor === undefined ||
				!descriptor.enumerable ||
				!("value" in descriptor)
			) {
				throw new Error(`${path}.${key} must be an enumerable data property`);
			}
			assertJsonValue((value as UnknownRecord)[key], `${path}.${key}`, active);
		}
	}
	active.delete(value);
}
