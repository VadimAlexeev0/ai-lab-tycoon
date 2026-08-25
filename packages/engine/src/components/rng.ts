import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import { assertExactObject, assertUnsignedInteger } from "../validation.js";

export const RNG_STREAM_NAMES = [
	"training",
	"incidents",
	"products",
	"rivals",
	"funding",
] as const;

export type RngStream = (typeof RNG_STREAM_NAMES)[number];

export type RngGeneratorState = [number, number, number, number];

export type RngStreams = {
	training: RngGeneratorState;
	incidents: RngGeneratorState;
	products: RngGeneratorState;
	rivals: RngGeneratorState;
	funding: RngGeneratorState;
};

export type RngState = {
	seed: number;
	streams: RngStreams;
};

export function createRngState(seed: number): RngState {
	assertUnsignedInteger(seed, "RNG seed");
	const streams = {} as RngStreams;
	const generator = xoroshiro128plus(seed);
	for (const stream of RNG_STREAM_NAMES) {
		generator.jump();
		streams[stream] = serializeGeneratorState(generator.getState());
	}
	return { seed, streams };
}

export function serializeGeneratorState(
	state: readonly number[],
): RngGeneratorState {
	if (state.length !== 4) {
		throw new Error(
			"RNG generator state must be an array of four int32 values",
		);
	}
	for (const [index, value] of state.entries()) {
		if (
			!Number.isInteger(value) ||
			value < -0x8000_0000 ||
			value > 0x7fff_ffff
		) {
			throw new Error(
				`RNG generator state value ${index} must be a signed 32-bit integer`,
			);
		}
	}
	const [s0, s1, s2, s3] = state;
	if (
		s0 === undefined ||
		s1 === undefined ||
		s2 === undefined ||
		s3 === undefined
	) {
		throw new Error(
			"RNG generator state must be an array of four int32 values",
		);
	}
	return [s0, s1, s2, s3];
}

export function assertRngState(value: unknown): asserts value is RngState {
	assertExactObject(value, ["seed", "streams"], "rng");
	assertUnsignedInteger(value.seed, "RNG seed");
	assertExactObject(value.streams, RNG_STREAM_NAMES, "RNG streams");
	for (const stream of RNG_STREAM_NAMES) {
		assertGeneratorState(value.streams[stream], `RNG ${stream} stream`);
	}
}

function assertGeneratorState(value: unknown, path: string): void {
	if (!Array.isArray(value) || value.length !== 4) {
		throw new Error(`${path} must be an array of four int32 values`);
	}
	for (const item of value) {
		if (!Number.isInteger(item) || item < -0x8000_0000 || item > 0x7fff_ffff) {
			throw new Error(`${path} value must be a signed 32-bit integer`);
		}
	}
	if (value.every((item) => item === 0)) {
		throw new Error(`${path} state must not be all zero`);
	}
}
