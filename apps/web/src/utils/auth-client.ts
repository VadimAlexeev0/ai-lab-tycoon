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
	const created = await authClient.signIn.anonymous();
	const createdUserId = findUserId(created.data);
	if (createdUserId !== null) return { userId: createdUserId };

	const confirmed = await authClient.getSession();
	const confirmedUserId = findUserId(confirmed.data);
	if (confirmedUserId !== null) return { userId: confirmedUserId };

	throw new Error("The anonymous session response did not include a user.");
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
