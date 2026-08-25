import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plusFromState } from "pure-rand/generator/xoroshiro128plus";
import { purify } from "pure-rand/utils/purify";

import {
	assertRngState,
	RNG_STREAM_NAMES,
	type RngState,
	type RngStream,
	serializeGeneratorState,
} from "./components/rng.js";
import { assertSafeInteger } from "./validation.js";

export type { RngState, RngStream, RngStreams } from "./components/rng.js";
export { createRngState, RNG_STREAM_NAMES } from "./components/rng.js";

const UINT32_RANGE = 0x1_0000_0000;

const pureUniformInt = purify(uniformInt);

export type NextIntResult = {
	rng: RngState;
	value: number;
};

export function nextInt(
	rng: RngState,
	stream: RngStream,
	minInclusive: number,
	maxInclusive: number,
): NextIntResult {
	assertRngStream(stream);
	assertRngState(rng);
	assertSafeInteger(minInclusive, "Minimum RNG value");
	assertSafeInteger(maxInclusive, "Maximum RNG value");
	if (minInclusive > maxInclusive) {
		throw new Error("Minimum RNG value must not exceed maximum RNG value");
	}

	const rangeSize = maxInclusive - minInclusive + 1;
	if (rangeSize > UINT32_RANGE) {
		throw new Error("RNG value range must fit within an unsigned 32-bit draw");
	}

	const generator = xoroshiro128plusFromState(rng.streams[stream]);
	const [value, nextGenerator] = pureUniformInt(
		generator,
		minInclusive,
		maxInclusive,
	);
	const nextState = serializeGeneratorState(nextGenerator.getState());

	return {
		rng: {
			seed: rng.seed,
			streams: {
				...rng.streams,
				[stream]: nextState,
			},
		},
		value,
	};
}

function assertRngStream(value: RngStream): void {
	if (!RNG_STREAM_NAMES.includes(value)) {
		throw new Error(`Unsupported RNG stream: ${String(value)}`);
	}
}
