import { createContext } from "@ai-lab-tycoon/api/context";
import { appRouter } from "@ai-lab-tycoon/api/routers/index";
import { createDb } from "@ai-lab-tycoon/db";
import { env } from "@ai-lab-tycoon/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { auth } from "./auth";
import { sessionMiddleware } from "./session-middleware";
import {
	getRpcRateLimitKey,
	InMemoryTokenBucket,
	isRpcRequestAllowed,
	MAX_RPC_BODY_BYTES,
	RPC_RATE_LIMIT_CAPACITY,
	RPC_RATE_LIMIT_REFILL_PER_SECOND,
} from "./security";

const app = new Hono();
const db = createDb();
const localRpcRateLimiter = new InMemoryTokenBucket({
	capacity: RPC_RATE_LIMIT_CAPACITY,
	refillPerSecond: RPC_RATE_LIMIT_REFILL_PER_SECOND,
});

type CloudflareRateLimitBinding = {
	limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

function getCloudflareRateLimiter(): CloudflareRateLimitBinding | undefined {
	const candidate = (
		env as unknown as { RPC_RATE_LIMITER?: CloudflareRateLimitBinding }
	).RPC_RATE_LIMITER;
	return candidate !== undefined && typeof candidate.limit === "function"
		? candidate
		: undefined;
}

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

// Better Auth must mount before the oRPC catch-all. It owns /api/auth/*.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Reject oversized request bodies before oRPC attempts to parse JSON. The
// streaming implementation also covers chunked requests without buffering an
// unbounded payload in application code.
app.use(
	"/rpc/*",
	bodyLimit({
		maxSize: MAX_RPC_BODY_BYTES,
		onError: (c) => c.text("Request body exceeds the 2.5 MB limit", 413),
	}),
);

// Cookie-authenticated RPC mutations must not be callable cross-site. CORS is
// deliberately not the only control: it governs reads, while this middleware
// rejects the state-changing request itself.
app.use("/rpc/*", async (c, next) => {
	if (!isRpcRequestAllowed(c.req.raw, env.CORS_ORIGIN)) {
		return c.text("Forbidden", 403);
	}
	return next();
});

// Resolve the authenticated session once per request for the oRPC/API routes.
app.use("/rpc/*", sessionMiddleware);

// Ponytail: the Cloudflare binding is the cross-isolate production guard;
// retain the in-memory bucket as a local/degraded-environment fallback.
app.use("/rpc/*", async (c, next) => {
	const user = c.get("user") as { id?: unknown } | null | undefined;
	const userId = typeof user?.id === "string" ? user.id : null;
	const key = getRpcRateLimitKey(c.req.raw, userId);
	const cloudflareRateLimiter = getCloudflareRateLimiter();
	let allowed: boolean;
	if (cloudflareRateLimiter !== undefined) {
		try {
			allowed = (await cloudflareRateLimiter.limit({ key })).success;
		} catch {
			allowed = localRpcRateLimiter.consume(key);
		}
	} else {
		allowed = localRpcRateLimiter.consume(key);
	}
	if (!allowed) {
		return c.text("Too many RPC requests", 429, {
			"Retry-After": "60",
		});
	}
	return next();
});
app.use("/api-reference/*", sessionMiddleware);

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const context = await createContext({
		context: c,
		auth,
		db,
	});

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context: context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
