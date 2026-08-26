// TEMP TASK 10 AUTH STUB — reconcile with the Better Auth anonymousClient
// implementation from Task 8 when that branch is merged. This keeps the web
// route's session contract stable while the authenticated API is in flight.

export type AnonymousSession = {
	userId: string;
};

/**
 * The small auth-client-shaped surface consumed by the game route.
 *
 * Keeping the request code here (rather than in the route) makes it possible
 * to replace this with Better Auth's generated client without changing game
 * state or save ownership code.
 */
export const authClient = {
	getSession: () => requestAuth("/api/auth/get-session"),
	signIn: {
		anonymous: () =>
			requestAuth("/api/auth/sign-in/anonymous", {
				method: "POST",
				body: "{}",
			}),
	},
};

let sessionBootstrap: Promise<AnonymousSession> | null = null;

/** Ensure one anonymous session exists before any save request is made. */
export function getOrCreateAnonymousSession(): Promise<AnonymousSession> {
	if (sessionBootstrap === null) {
		sessionBootstrap = bootstrapAnonymousSession();
	}
	return sessionBootstrap;
}

export function resetAnonymousSessionBootstrap(): void {
	sessionBootstrap = null;
}

async function bootstrapAnonymousSession(): Promise<AnonymousSession> {
	const existing = await authClient.getSession();
	const existingUserId = findUserId(existing);
	if (existingUserId !== null) return { userId: existingUserId };

	// The module-level promise makes React StrictMode and route remounts share
	// this call, so signIn.anonymous runs at most once per bootstrap attempt.
	const created = await authClient.signIn.anonymous();
	const createdUserId = findUserId(created);
	if (createdUserId !== null) return { userId: createdUserId };

	// Better Auth may set the cookie and return an empty sign-in body. Confirm
	// the session before allowing the game route to read or write a save.
	const confirmed = await authClient.getSession();
	const confirmedUserId = findUserId(confirmed);
	if (confirmedUserId !== null) return { userId: confirmedUserId };

	throw new Error("The anonymous session response did not include a user.");
}

async function requestAuth(
	path: string,
	init: RequestInit = {},
): Promise<unknown> {
	const response = await fetch(path, {
		...init,
		credentials: "include",
		headers: {
			"content-type": "application/json",
			...(init.headers as Record<string, string> | undefined),
		},
	});
	const payload = await readResponsePayload(response);
	if (!response.ok) {
		throw new Error(`Authentication request failed (${response.status}).`);
	}
	return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text.trim().length === 0) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function findUserId(value: unknown): string | null {
	const record = asRecord(value);
	if (record === null) return null;

	const directUser = asRecord(record.user);
	if (typeof directUser?.id === "string" && directUser.id.length > 0) {
		return directUser.id;
	}

	const nestedData = asRecord(record.data);
	if (nestedData !== null) {
		const nestedUserId = findUserId(nestedData);
		if (nestedUserId !== null) return nestedUserId;
	}

	const session = asRecord(record.session);
	if (session !== null) {
		const sessionUser = asRecord(session.user);
		if (typeof sessionUser?.id === "string" && sessionUser.id.length > 0) {
			return sessionUser.id;
		}
	}

	return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
