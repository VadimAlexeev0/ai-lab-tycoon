import { describe, expect, it } from "vitest";

import {
	createRngState,
	nextInt,
	RNG_STREAM_NAMES,
	type RngState,
	type RngStream,
} from "./rng.js";

function drawValues(
	rng: RngState,
	stream: RngStream,
	count: number,
): { rng: RngState; values: number[] } {
	const values: number[] = [];
	let nextRng = rng;
	for (let index = 0; index < count; index += 1) {
		const result = nextInt(nextRng, stream, 1, 100);
		nextRng = result.rng;
		values.push(result.value);
	}
	return { rng: nextRng, values };
}

describe("deterministic named RNG streams", () => {
	it("replays the known training sequence for seed 42", () => {
		const result = drawValues(createRngState(42), "training", 5);

		expect(result.values).toEqual([88, 61, 92, 46, 74]);
	});

	it("derives reproducible nonzero initial states independently per stream", () => {
		const first = createRngState(42);
		const second = createRngState(42);

		expect(first).toEqual(second);
		expect(first.streams).toEqual({
			training: 0xfd3c8198,
			incidents: 0xa44b9d55,
			products: 0xb86a46c7,
			rivals: 0x9c46990d,
			funding: 0x29e6ce50,
		});
		for (const stream of RNG_STREAM_NAMES) {
			expect(first.streams[stream]).toBeGreaterThan(0);
		}
	});

	it("supports seed zero without a zero stream state", () => {
		const rng = createRngState(0);

		expect(rng.seed).toBe(0);
		for (const stream of RNG_STREAM_NAMES) {
			expect(rng.streams[stream]).toBeGreaterThan(0);
			expect(nextInt(rng, stream, 0, 1).value).toBeGreaterThanOrEqual(0);
			expect(nextInt(rng, stream, 0, 1).value).toBeLessThanOrEqual(1);
		}
	});

	it("keeps every draw inside its inclusive integer bounds", () => {
		const rng = createRngState(42);
		const ranges = [
			[0, 0],
			[-10, -4],
			[7, 7],
			[1, 100],
		] as const;

		for (const [minInclusive, maxInclusive] of ranges) {
			const result = nextInt(rng, "products", minInclusive, maxInclusive);
			expect(result.value).toBeGreaterThanOrEqual(minInclusive);
			expect(result.value).toBeLessThanOrEqual(maxInclusive);
		}
	});

	it("rejects unsupported streams and invalid integer ranges", () => {
		const rng = createRngState(42);

		expect(() => nextInt(rng, "unknown" as RngStream, 1, 2)).toThrow(/stream/i);
		expect(() => nextInt(rng, "training", 2, 1)).toThrow(/minimum|maximum/i);
		expect(() => nextInt(rng, "training", 1.5, 2)).toThrow(/integer/i);
		expect(() => nextInt(rng, "training", 0, Number.MAX_SAFE_INTEGER)).toThrow(
			/range|32-bit/i,
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
		expect(interleavedTraining.rng.streams.training).toBe(
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
