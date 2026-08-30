import { describe, expect, it } from "vitest";

import { isRpcRequestAllowed } from "./security";

const CORS_ORIGIN = "https://lab.example";

function request(method: string, headers?: Record<string, string>): Request {
	return new Request("https://api.example/rpc/gameSave/upsertActiveRun", {
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
