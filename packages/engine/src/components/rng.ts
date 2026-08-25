import { assertExactObject, assertUnsignedInteger } from "../validation.js";

export const RNG_STREAM_NAMES = [
	"training",
	"incidents",
	"products",
	"rivals",
	"funding",
] as const;

export type RngStream = (typeof RNG_STREAM_NAMES)[number];

export type RngStreams = {
	training: number;
	incidents: number;
	products: number;
	rivals: number;
	funding: number;
};

export type RngState = {
	seed: number;
	streams: RngStreams;
};

export function createRngState(seed: number): RngState {
	assertUnsignedInteger(seed, "RNG seed");
	return {
		seed,
		streams: {
			training: seed,
			incidents: seed,
			products: seed,
			rivals: seed,
			funding: seed,
		},
	};
}

export function assertRngState(value: unknown): asserts value is RngState {
	assertExactObject(value, ["seed", "streams"], "rng");
	assertUnsignedInteger(value.seed, "RNG seed");
	assertExactObject(value.streams, RNG_STREAM_NAMES, "RNG streams");
	for (const stream of RNG_STREAM_NAMES) {
		assertUnsignedInteger(value.streams[stream], `RNG ${stream} stream`);
	}
}
