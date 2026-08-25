import { describe, expect, it } from "vitest";

import {
	createRngState,
	nextInt,
	RNG_STREAM_NAMES,
	type RngState,
	type RngStream,
} from "./rng.js";

const ZERO_STREAM_STATE = [0, 0, 0, 0] as const;
const MAX_UNSIGNED_SEED = 4_294_967_295;

function drawValues(
	rng: RngState,
	stream: RngStream,
	count: number,
	minInclusive = 1,
	maxInclusive = 100,
): { rng: RngState; values: number[] } {
	const values: number[] = [];
	let nextRng = rng;
	for (let index = 0; index < count; index += 1) {
		const result = nextInt(nextRng, stream, minInclusive, maxInclusive);
		nextRng = result.rng;
		values.push(result.value);
	}
	return { rng: nextRng, values };
}

describe("deterministic named RNG streams", () => {
	it("replays the known training sequence for seed 42 through the pure-rand adapter", () => {
		const result = drawValues(createRngState(42), "training", 5);

		expect(result.values).toEqual([29, 6, 43, 59, 86]);
	});

	it("reproduces identical states and sequences for the same seed", () => {
		const first = createRngState(42);
		const second = createRngState(42);

		expect(first).toEqual(second);
		expect(drawValues(first, "training", 5)).toEqual(
			drawValues(second, "training", 5),
		);
	});

	it("derives nonzero, distinct serialized states for seed zero and the maximum seed", () => {
		for (const seed of [0, MAX_UNSIGNED_SEED]) {
			const first = createRngState(seed);
			expect(first).toEqual(createRngState(seed));
			expect(first.seed).toBe(seed);

			const states = RNG_STREAM_NAMES.map((stream) => first.streams[stream]);
			for (const state of states) {
				expect(state).not.toEqual(ZERO_STREAM_STATE);
			}
			expect(new Set(states.map((state) => JSON.stringify(state))).size).toBe(
				RNG_STREAM_NAMES.length,
			);

			for (const stream of RNG_STREAM_NAMES) {
				const result = nextInt(first, stream, 0, 1);
				expect(result.value).toBeGreaterThanOrEqual(0);
				expect(result.value).toBeLessThanOrEqual(1);
			}
		}
	});

	it("advances seed zero training rolls through the returned state", () => {
		let current = createRngState(0);
		const values: number[] = [];
		for (let index = 0; index < 5; index += 1) {
			const result = nextInt(current, "training", 0, 1);
			values.push(result.value);
			current = result.rng;
		}

		expect(values).toEqual([0, 1, 1, 0, 0]);
		expect(current.streams.training).toEqual([
			1733404388, 1636490661, -93573114, -2061626361,
		]);
	});

	it("keeps every draw inside its inclusive integer bounds", () => {
		const rng = createRngState(42);
		const ranges = [
			[0, 0],
			[-10, -4],
			[7, 7],
			[1, 100],
			[-5, 5],
			[0, MAX_UNSIGNED_SEED],
		] as const;

		for (const [minInclusive, maxInclusive] of ranges) {
			const result = nextInt(rng, "products", minInclusive, maxInclusive);
			expect(result.value).toBeGreaterThanOrEqual(minInclusive);
			expect(result.value).toBeLessThanOrEqual(maxInclusive);
		}
	});

	it("rejects unsupported streams, invalid ranges, and unsafe endpoints", () => {
		const rng = createRngState(42);

		expect(() => nextInt(rng, "unknown" as RngStream, 1, 2)).toThrow(/stream/i);
		expect(() => nextInt(rng, "training", 2, 1)).toThrow(/minimum|maximum/i);
		expect(() => nextInt(rng, "training", 1.5, 2)).toThrow(/integer/i);
		expect(() => nextInt(rng, "training", 0, Number.MAX_SAFE_INTEGER)).toThrow(
			/range|32-bit/i,
		);
		expect(() => nextInt(rng, "training", -Number.MAX_SAFE_INTEGER, 0)).toThrow(
			/range|32-bit/i,
		);
		expect(() =>
			nextInt(
				rng,
				"training",
				Number.MAX_SAFE_INTEGER + 1,
				Number.MAX_SAFE_INTEGER + 2,
			),
		).toThrow(/safe integer/i);
	});

	it("rejects malformed or all-zero serialized generator states", () => {
		const rng = createRngState(42);

		const zeroState: RngState = {
			...rng,
			streams: { ...rng.streams, training: [0, 0, 0, 0] },
		};
		expect(() => nextInt(zeroState, "training", 0, 1)).toThrow(/all zero/i);

		const shortState = {
			...rng,
			streams: {
				...rng.streams,
				training: [1, 2, 3] as unknown as RngState["streams"]["training"],
			},
		};
		expect(() => nextInt(shortState, "training", 0, 1)).toThrow(
			/array of four/i,
		);

		const fractionalState: RngState = {
			...rng,
			streams: { ...rng.streams, training: [1, 2, 3, 1.5] },
		};
		expect(() => nextInt(fractionalState, "training", 0, 1)).toThrow(
			/signed 32-bit/i,
		);
	});

	it("does not mutate its input and updates only the selected stream", () => {
		const rng = createRngState(42);
		const before = JSON.parse(JSON.stringify(rng)) as RngState;
		const result = nextInt(rng, "incidents", 1, 100);

		expect(rng).toEqual(before);
		expect(result.rng).not.toBe(rng);
		expect(result.rng.seed).toBe(rng.seed);
		for (const stream of RNG_STREAM_NAMES) {
			if (stream === "incidents") {
				expect(result.rng.streams[stream]).not.toBe(rng.streams[stream]);
			} else {
				expect(result.rng.streams[stream]).toBe(rng.streams[stream]);
			}
		}
	});

	it("keeps stream sequences isolated from rolls on another stream", () => {
		const initial = createRngState(42);
		const firstTraining = nextInt(initial, "training", 1, 100);
		const incident = nextInt(firstTraining.rng, "incidents", 1, 100);
		const interleavedTraining = nextInt(incident.rng, "training", 1, 100);
		const sequentialTraining = nextInt(firstTraining.rng, "training", 1, 100);

		expect(incident.value).toBeGreaterThanOrEqual(1);
		expect(interleavedTraining.value).toBe(sequentialTraining.value);
		expect(interleavedTraining.rng.streams.training).toEqual(
			sequentialTraining.rng.streams.training,
		);
		expect(interleavedTraining.rng.streams.products).toBe(
			sequentialTraining.rng.streams.products,
		);
		expect(interleavedTraining.rng.streams.rivals).toBe(
			sequentialTraining.rng.streams.rivals,
		);
		expect(interleavedTraining.rng.streams.funding).toBe(
			sequentialTraining.rng.streams.funding,
		);
		expect(interleavedTraining.rng.streams.incidents).toBe(
			incident.rng.streams.incidents,
		);
	});
});
