import type {
	AuthClient,
	AuthSession,
	AuthUser,
} from "@ai-lab-tycoon/api/context";
import type { Context as HonoContext } from "hono";
import { createMiddleware } from "hono/factory";

import { auth } from "./auth";

export type SessionMiddlewareEnv = {
	Variables: {
		auth: AuthSession | null;
		session: AuthSession["session"] | null;
		user: AuthUser | null;
	};
};

const authClient: AuthClient = auth;

/** Resolve the Better Auth session attached to a Worker request. */
export async function getAuthSession(
	request: Request,
): Promise<AuthSession | null> {
	const session = await authClient.api.getSession({
		headers: request.headers,
	});
	return isAuthSession(session) ? session : null;
}

function isAuthSession(value: unknown): value is AuthSession {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as {
		session?: unknown;
		user?: unknown;
	};
	if (
		typeof candidate.session !== "object" ||
		candidate.session === null ||
		typeof candidate.user !== "object" ||
		candidate.user === null
	) {
		return false;
	}

	return (
		typeof (candidate.session as { userId?: unknown }).userId === "string" &&
		typeof (candidate.user as { id?: unknown }).id === "string"
	);
}

function setSessionVariables(
	context: HonoContext<SessionMiddlewareEnv>,
	authSession: AuthSession | null,
): void {
	context.set("auth", authSession);
	context.set("session", authSession?.session ?? null);
	context.set("user", authSession?.user ?? null);
}

/**
 * Populate optional auth variables for the oRPC and API-reference handlers.
 * Public procedures continue to work when the request has no session; protected
 * procedures enforce the 401 boundary themselves.
 */
export const sessionMiddleware = createMiddleware<SessionMiddlewareEnv>(
	async (context, next) => {
		const authSession = await getAuthSession(context.req.raw);
		setSessionVariables(context, authSession);
		await next();
	},
);

/**
 * Use this middleware on a route that must have an authenticated session.
 * It deliberately returns a real 401 response rather than allowing a missing
 * session to look like an empty save.
 */
export const requireSessionMiddleware = createMiddleware<SessionMiddlewareEnv>(
	async (context, next) => {
		const authSession = await getAuthSession(context.req.raw);
		if (authSession === null) {
			return context.json({ message: "Unauthorized" }, 401);
		}
		setSessionVariables(context, authSession);
		await next();
	},
);
