import { describe, expect, it } from "vitest";

import { createRequestId } from "./orpc";

describe("server command request ids", () => {
	it("creates a bounded opaque id for each user action", () => {
		const first = createRequestId();
		const second = createRequestId();

		expect(first).not.toBe(second);
		expect(first.length).toBeGreaterThan(0);
		expect(first.length).toBeLessThanOrEqual(128);
	});
});
