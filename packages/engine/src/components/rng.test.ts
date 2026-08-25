import { expect, it } from "vitest";

import { assertRngState, createRngState } from "./rng.js";

type RecordValue = Record<string, unknown>;

it("owns the serializable RNG initializer and invariant in the component", () => {
	const state = createRngState(42);
	expect(state).toEqual({
		seed: 42,
		streams: {
			training: [-1076042686, 1972995308, -1600347284, -72464928],
			incidents: [396400533, 64495150, -2049379465, -199036651],
			products: [1839066550, 587057829, -1158932177, -1409935186],
			rivals: [394538890, -1908707685, -1709464395, -828688265],
			funding: [1162306347, -2069859185, 1314944651, 2101674429],
		},
	});
	expect(() => assertRngState(state)).not.toThrow();

	const missingStream = JSON.parse(JSON.stringify(state)) as RecordValue;
	delete (missingStream.streams as RecordValue).funding;
	expect(() => assertRngState(missingStream)).toThrow(/funding|missing/i);

	const zeroStream = JSON.parse(JSON.stringify(state)) as RecordValue;
	(zeroStream.streams as RecordValue).training = [0, 0, 0, 0];
	expect(() => assertRngState(zeroStream)).toThrow(/all zero/i);

	const shortStream = JSON.parse(JSON.stringify(state)) as RecordValue;
	(shortStream.streams as RecordValue).training = [1, 2, 3];
	expect(() => assertRngState(shortStream)).toThrow(/array of four/i);
});
