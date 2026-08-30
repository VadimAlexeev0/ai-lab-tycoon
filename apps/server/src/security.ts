const SAFE_FETCH_SITES = new Set(["same-origin", "none"]);

export const MAX_RPC_BODY_BYTES = 2_500_000;
export const RPC_RATE_LIMIT_CAPACITY = 60;
export const RPC_RATE_LIMIT_REFILL_PER_SECOND = 1;

export const API_SECURITY_HEADERS = {
	"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

/** API docs are opt-in, including in production. */
export function isApiDocsEnabled(value: unknown): boolean {
	return value === "true";
}

type TokenBucket = {
	tokens: number;
	lastRefillMs: number;
};

export type InMemoryTokenBucketOptions = Readonly<{
	capacity: number;
	refillPerSecond: number;
}>;

/**
 * Small per-isolate token bucket used as a local/development fallback. The
 * configured Cloudflare RateLimit binding is preferred by the Worker when it
 * is available, so production enforcement is not limited to one isolate.
 */
export class InMemoryTokenBucket {
	private readonly buckets = new Map<string, TokenBucket>();
	private readonly capacity: number;
	private readonly refillPerSecond: number;

	constructor({ capacity, refillPerSecond }: InMemoryTokenBucketOptions) {
		if (!Number.isFinite(capacity) || capacity < 1) {
			throw new Error("Token bucket capacity must be positive");
		}
		if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
			throw new Error("Token bucket refill rate must be positive");
		}
		this.capacity = capacity;
		this.refillPerSecond = refillPerSecond;
	}

	consume(key: string, nowMs = Date.now()): boolean {
		const now = Number.isFinite(nowMs) ? nowMs : Date.now();
		const bucket = this.buckets.get(key) ?? {
			tokens: this.capacity,
			lastRefillMs: now,
		};
		const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
		bucket.tokens = Math.min(
			this.capacity,
			bucket.tokens + (elapsedMs / 1_000) * this.refillPerSecond,
		);
		bucket.lastRefillMs = now;
		if (bucket.tokens < 1) {
			this.buckets.set(key, bucket);
			return false;
		}
		bucket.tokens -= 1;
		this.buckets.set(key, bucket);
		return true;
	}
}

/** Build the rate-limit key from Cloudflare's client IP and auth identity. */
export function getRpcRateLimitKey(
	request: Request,
	userId: string | null | undefined,
): string {
	const ip = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
	return `${ip}:${userId ?? "anonymous"}`;
}

/**
 * Mutating RPC calls are cookie-authenticated and must carry both a trusted
 * exact origin and safe Fetch Metadata. Reads and CORS preflight are exempt.
 */
export function isRpcRequestAllowed(
	request: Request,
	expectedOrigin: string,
): boolean {
	const method = request.method.toUpperCase();
	if (method === "GET" || method === "OPTIONS") {
		return true;
	}

	return (
		request.headers.get("Origin") === expectedOrigin &&
		SAFE_FETCH_SITES.has(request.headers.get("Sec-Fetch-Site") ?? "")
	);
}
