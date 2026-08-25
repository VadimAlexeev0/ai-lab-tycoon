import { expect, it } from "vitest";

import { assertRngState, createRngState } from "./rng.js";

type RecordValue = Record<string, unknown>;

it("owns the serializable RNG initializer and invariant in the component", () => {
	const state = createRngState(42);
	expect(state).toEqual({
		seed: 42,
		streams: {
			training: 0xfd3c8198,
			incidents: 0xa44b9d55,
			products: 0xb86a46c7,
			rivals: 0x9c46990d,
			funding: 0x29e6ce50,
		},
	});
	expect(() => assertRngState(state)).not.toThrow();

	const missingStream = JSON.parse(JSON.stringify(state)) as RecordValue;
	delete (missingStream.streams as RecordValue).funding;
	expect(() => assertRngState(missingStream)).toThrow(/funding|missing/i);
});
