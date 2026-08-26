import type { AppDatabase } from "@ai-lab-tycoon/db";
import type { Context as HonoContext } from "hono";

/** The minimum Better Auth user shape needed by server procedures. */
export type AuthUser = Readonly<{
	id: string;
}>;

/** The minimum Better Auth session-row shape needed by server procedures. */
export type AuthSessionRecord = Readonly<{
	userId: string;
}>;

/** The `{ session, user }` value returned by `auth.api.getSession`. */
export type AuthSession = Readonly<{
	session: AuthSessionRecord;
	user: AuthUser;
}>;

/** Runtime shape accepted from the Better Auth instance in the server app. */
export type AuthClient = Readonly<{
	api: Readonly<{
		getSession: (options: { headers: Headers }) => Promise<unknown>;
	}>;
}>;

export type CreateContextOptions = {
	context: HonoContext;
	auth?: AuthClient;
	/** A session already resolved by the Hono session middleware. */
	session?: AuthSession | null;
	db?: AppDatabase;
};

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

export async function createContext({
	context,
	auth,
	session,
	db,
}: CreateContextOptions) {
	const resolvedSession =
		session !== undefined
			? session
			: auth === undefined
				? null
				: await auth.api.getSession({
						headers: context.req.raw.headers,
					});
	const authSession = isAuthSession(resolvedSession) ? resolvedSession : null;

	return {
		auth: authSession,
		session: authSession?.session ?? null,
		user: authSession?.user ?? null,
		db,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
