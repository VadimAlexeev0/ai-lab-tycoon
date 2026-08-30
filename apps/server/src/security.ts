const SAFE_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * Mutating RPC calls are cookie-authenticated and must carry both a trusted
 * exact origin and safe Fetch Metadata. Reads and CORS preflight are exempt.
 */
export function isRpcRequestAllowed(
	request: Request,
	expectedOrigin: string,
): boolean {
	if (request.method === "GET" || request.method === "OPTIONS") {
		return true;
	}

	return (
		request.headers.get("Origin") === expectedOrigin &&
		SAFE_FETCH_SITES.has(request.headers.get("Sec-Fetch-Site") ?? "")
	);
}
