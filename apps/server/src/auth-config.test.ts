import { describe, expect, it } from "vitest";

import { requireAuthSecret } from "./auth-config";

describe("Better Auth secret configuration", () => {
	it("fails closed when the secret is missing", () => {
		expect(() => requireAuthSecret(undefined)).toThrow(
			/BETTER_AUTH_SECRET.*32/i,
		);
	});

	it("fails closed when the secret is shorter than 32 characters", () => {
		expect(() => requireAuthSecret("too-short")).toThrow(
			/BETTER_AUTH_SECRET.*32/i,
		);
	});

	it("accepts a secret at the minimum length", () => {
		const secret = "a".repeat(32);
		expect(requireAuthSecret(secret)).toBe(secret);
	});
});
