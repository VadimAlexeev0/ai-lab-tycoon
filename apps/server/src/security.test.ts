import { describe, expect, it } from "vitest";

import {
	API_SECURITY_HEADERS,
	getRpcRateLimitKey,
	InMemoryTokenBucket,
	isApiDocsEnabled,
	isRpcRequestAllowed,
} from "./security";

const CORS_ORIGIN = "https://lab.example";

function request(method: string, headers?: Record<string, string>): Request {
	return new Request("https://api.example/rpc/gameSave/applyCommand", {
		method,
		headers,
	});
}

describe("RPC CSRF/origin policy", () => {
	it("allows same-origin mutation requests with the configured origin", () => {
		expect(
			isRpcRequestAllowed(
				request("POST", {
					Origin: CORS_ORIGIN,
					"Sec-Fetch-Site": "same-origin",
				}),
				CORS_ORIGIN,
			),
		).toBe(true);
	});

	it("allows non-browser requests marked as fetch metadata none", () => {
		expect(
			isRpcRequestAllowed(
				request("POST", {
					Origin: CORS_ORIGIN,
					"Sec-Fetch-Site": "none",
				}),
				CORS_ORIGIN,
			),
		).toBe(true);
	});

	it("rejects mutations with a missing origin", () => {
		expect(
			isRpcRequestAllowed(
				request("POST", { "Sec-Fetch-Site": "same-origin" }),
				CORS_ORIGIN,
			),
		).toBe(false);
	});

	it("rejects mutations from another origin", () => {
		expect(
			isRpcRequestAllowed(
				request("POST", {
					Origin: "https://attacker.example",
					"Sec-Fetch-Site": "same-origin",
				}),
				CORS_ORIGIN,
			),
		).toBe(false);
	});

	it("rejects mutations with unsafe fetch metadata", () => {
		expect(
			isRpcRequestAllowed(
				request("POST", {
					Origin: CORS_ORIGIN,
					"Sec-Fetch-Site": "cross-site",
				}),
				CORS_ORIGIN,
			),
		).toBe(false);
	});

	it("does not require mutation headers for reads or CORS preflight", () => {
		expect(isRpcRequestAllowed(request("GET"), CORS_ORIGIN)).toBe(true);
		expect(isRpcRequestAllowed(request("OPTIONS"), CORS_ORIGIN)).toBe(true);
	});
});

describe("RPC rate limiting", () => {
	it("uses the connecting IP and user id as the bucket key", () => {
		const requestWithIp = request("POST", {
			"CF-Connecting-IP": "203.0.113.10",
		});
		expect(getRpcRateLimitKey(requestWithIp, "user-123")).toBe(
			"203.0.113.10:user-123",
		);
		expect(getRpcRateLimitKey(requestWithIp, null)).toBe(
			"203.0.113.10:anonymous",
		);
	});

	it("refills tokens over time and rejects bursts after the capacity", () => {
		const limiter = new InMemoryTokenBucket({
			capacity: 2,
			refillPerSecond: 1,
		});
		expect(limiter.consume("key", 0)).toBe(true);
		expect(limiter.consume("key", 0)).toBe(true);
		expect(limiter.consume("key", 0)).toBe(false);
		expect(limiter.consume("key", 1_000)).toBe(true);
	});
});

describe("API documentation and response headers", () => {
	it("keeps API docs disabled unless explicitly enabled", () => {
		expect(isApiDocsEnabled(undefined)).toBe(false);
		expect(isApiDocsEnabled("false")).toBe(false);
		expect(isApiDocsEnabled("true")).toBe(true);
	});

	it("publishes the required API security header policy", () => {
		expect(API_SECURITY_HEADERS).toEqual({
			"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
			"Referrer-Policy": "strict-origin-when-cross-origin",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
		});
	});
});
