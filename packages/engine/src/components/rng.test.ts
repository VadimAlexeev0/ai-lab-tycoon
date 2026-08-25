import { expect, it } from "vitest";

import { assertRngState, createRngState } from "./rng.js";

type RecordValue = Record<string, unknown>;

it("owns the serializable RNG initializer and invariant in the component", () => {
	const state = createRngState(42);
	expect(state).toEqual({
		seed: 42,
		streams: {
			training: 42,
			incidents: 42,
			products: 42,
			rivals: 42,
			funding: 42,
		},
	});
	expect(() => assertRngState(state)).not.toThrow();

	const missingStream = JSON.parse(JSON.stringify(state)) as RecordValue;
	delete (missingStream.streams as RecordValue).funding;
	expect(() => assertRngState(missingStream)).toThrow(/funding|missing/i);
});
