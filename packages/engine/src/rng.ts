import {
	assertRngState,
	RNG_STREAM_NAMES,
	type RngState,
	type RngStream,
} from "./components/rng.js";
import { assertInteger } from "./validation.js";

export type { RngState, RngStream, RngStreams } from "./components/rng.js";
export { createRngState, RNG_STREAM_NAMES } from "./components/rng.js";

const UINT32_RANGE = 0x1_0000_0000;

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

	const rejectionLimit = UINT32_RANGE - (UINT32_RANGE % rangeSize);
	let streamState = rng.streams[stream];
	let randomValue: number;
	do {
		const next = nextUint32(streamState);
		streamState = next.state;
		randomValue = next.value;
	} while (randomValue >= rejectionLimit);

	return {
		rng: {
			seed: rng.seed,
			streams: {
				...rng.streams,
				[stream]: streamState,
			},
		},
		value: minInclusive + (randomValue % rangeSize),
	};
}

function nextUint32(state: number): { state: number; value: number } {
	let value = state;
	value ^= value << 13;
	value >>>= 0;
	value ^= value >>> 17;
	value >>>= 0;
	value ^= value << 5;
	value >>>= 0;
	return { state: value, value };
}

function assertRngStream(value: RngStream): void {
	if (!RNG_STREAM_NAMES.includes(value)) {
		throw new Error(`Unsupported RNG stream: ${String(value)}`);
	}
}

function assertSafeInteger(value: number, path: string): void {
	assertInteger(value, path);
	if (!Number.isSafeInteger(value)) {
		throw new Error(`${path} must be a safe integer`);
	}
}
