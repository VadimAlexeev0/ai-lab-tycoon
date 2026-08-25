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

const STREAM_SALTS: Record<RngStream, number> = {
	training: 0x243f6a88,
	incidents: 0x85a308d3,
	products: 0x13198a2e,
	rivals: 0x03707344,
	funding: 0xa4093822,
};
const NONZERO_STATE_FALLBACK = 0x6d2b79f5;

export function createRngState(seed: number): RngState {
	assertUnsignedInteger(seed, "RNG seed");
	return {
		seed,
		streams: {
			training: deriveStreamState(seed, "training"),
			incidents: deriveStreamState(seed, "incidents"),
			products: deriveStreamState(seed, "products"),
			rivals: deriveStreamState(seed, "rivals"),
			funding: deriveStreamState(seed, "funding"),
		},
	};
}

function deriveStreamState(seed: number, stream: RngStream): number {
	const mixed = mix32((seed + STREAM_SALTS[stream]) >>> 0);
	return mixed === 0 ? NONZERO_STATE_FALLBACK : mixed;
}

function mix32(value: number): number {
	let mixed = value >>> 0;
	mixed ^= mixed >>> 16;
	mixed = Math.imul(mixed, 0x7feb352d) >>> 0;
	mixed ^= mixed >>> 15;
	mixed = Math.imul(mixed, 0x846ca68b) >>> 0;
	mixed ^= mixed >>> 16;
	return mixed >>> 0;
}

export function assertRngState(value: unknown): asserts value is RngState {
	assertExactObject(value, ["seed", "streams"], "rng");
	assertUnsignedInteger(value.seed, "RNG seed");
	assertExactObject(value.streams, RNG_STREAM_NAMES, "RNG streams");
	for (const stream of RNG_STREAM_NAMES) {
		assertUnsignedInteger(value.streams[stream], `RNG ${stream} stream`);
		if (value.streams[stream] === 0) {
			throw new Error(`RNG ${stream} stream must be nonzero`);
		}
	}
}
