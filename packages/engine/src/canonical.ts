import { assertJsonCompatible } from "./validation.js";

type CanonicalJson =
	| null
	| boolean
	| number
	| string
	| CanonicalJson[]
	| { [key: string]: CanonicalJson };
type CanonicalPath = readonly (number | string)[];

/** Serialize a JSON-compatible value with stable object and state collection ordering. */
export function canonicalSerialize(value: unknown): string {
	assertJsonCompatible(value);
	return serializeCanonicalJson(canonicalize(value, []));
}

/** Compare JSON-compatible values using the canonical serialization contract. */
export function canonicalEqual(left: unknown, right: unknown): boolean {
	return canonicalSerialize(left) === canonicalSerialize(right);
}

function canonicalize(value: unknown, path: CanonicalPath): CanonicalJson {
	if (Array.isArray(value)) {
		const items = value.map((child, index) =>
			canonicalize(child, [...path, index]),
		);
		if (isUnorderedStateCollection(path)) {
			return items.toSorted(compareCanonicalJson);
		}
		return items;
	}
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, canonicalize(record[key], [...path, key])]),
		) as { [key: string]: CanonicalJson };
	}
	return value as null | boolean | number | string;
}

/**
 * Research prerequisites are a set of dependencies. Other GameState arrays
 * carry history or queue order and must remain ordered.
 */
function isUnorderedStateCollection(path: CanonicalPath): boolean {
	return (
		path.length === 4 &&
		path[0] === "research" &&
		path[1] === "nodes" &&
		typeof path[2] === "number" &&
		path[3] === "prerequisites"
	);
}

function compareCanonicalJson(
	left: CanonicalJson,
	right: CanonicalJson,
): number {
	const leftSerialized = serializeCanonicalJson(left);
	const rightSerialized = serializeCanonicalJson(right);
	if (leftSerialized < rightSerialized) return -1;
	if (leftSerialized > rightSerialized) return 1;
	return 0;
}

function serializeCanonicalJson(value: CanonicalJson): string {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		throw new Error("Canonical serialization produced no JSON value");
	}
	return serialized;
}
