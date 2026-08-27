import { createAuthClient } from "better-auth/client";
import { anonymousClient } from "better-auth/client/plugins";

export type AnonymousSession = {
	userId: string;
};

/**
 * Better Auth anonymous client. The anonymous() server plugin + anonymousClient()
 * client plugin mint a stable userId on first sign-in, and the session cookie
 * travels on every credentialed request. The same client serves both the game
 * save and the auth bootstrap.
 */
export const authClient = createAuthClient({
	plugins: [anonymousClient()],
});

/** Better Auth error body for "already an anonymous user" (per plugin docs). */
type AuthFailure = {
	error?: {
		status?: number;
		statusText?: string;
		message?: string;
	};
};

let sessionBootstrap: Promise<AnonymousSession> | null = null;

/** Ensure one anonymous session exists before any save request is made. */
export async function getOrCreateAnonymousSession(): Promise<AnonymousSession> {
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
	const existingUserId = findUserId(existing.data);
	if (existingUserId !== null) return { userId: existingUserId };

	// The module-level promise makes React StrictMode and route remounts share
	// this call, so signIn.anonymous runs at most once per bootstrap attempt.
	//
	// Per the plugin docs: calling signIn.anonymous() while ALREADY holding an
	// anonymous session is an error (it refuses to mint a second anonymous
	// user). That happens when getSession() and the cookie disagree — e.g. an
	// expired-but-present session cookie. Recover by clearing the stale
	// session and retrying once instead of surfacing an error to the player.
	const created = await authClient.signIn.anonymous();
	const createdUserId = findUserId(created.data);
	if (createdUserId !== null) return { userId: createdUserId };

	if (isAnonymousReSignError(created.error)) {
		await authClient.signOut();
		const retry = await authClient.signIn.anonymous();
		const retryUserId = findUserId(retry.data);
		if (retryUserId !== null) return { userId: retryUserId };
	}

	const confirmed = await authClient.getSession();
	const confirmedUserId = findUserId(confirmed.data);
	if (confirmedUserId !== null) return { userId: confirmedUserId };

	throw new Error("The anonymous session response did not include a user.");
}

/**
 * Matches the plugin's "already anonymous" rejection so a stale anonymous
 * cookie can be cleared and a fresh session minted.
 */
function isAnonymousReSignError(error: unknown): boolean {
	const failure = error as AuthFailure | null | undefined;
	if (typeof failure !== "object" || failure === null) return false;
	const detail = failure.error;
	if (typeof detail !== "object" || detail === null) return false;
	if (detail.status !== 400 && detail.statusText !== "BAD_REQUEST") {
		return false;
	}
	const message = detail.message ?? "";
	return (
		message.toLowerCase().includes("anonymous") ||
		message.toLowerCase().includes("already")
	);
}

function findUserId(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.id === "string" && record.id.length > 0) return record.id;
	const user = record.user as Record<string, unknown> | undefined;
	if (user !== undefined && typeof user.id === "string" && user.id.length > 0) {
		return user.id;
	}
	return null;
}
