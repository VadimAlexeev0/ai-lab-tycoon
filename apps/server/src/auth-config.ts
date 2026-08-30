export const MIN_BETTER_AUTH_SECRET_LENGTH = 32;

/**
 * Better Auth defaults are intentionally not acceptable for a deployed Worker.
 * Keep this check separate from the Worker binding so it can be exercised
 * without importing Cloudflare's runtime-only `cloudflare:workers` module.
 */
export function requireAuthSecret(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length < MIN_BETTER_AUTH_SECRET_LENGTH
	) {
		throw new Error(
			`BETTER_AUTH_SECRET must be configured and at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters long`,
		);
	}
	return value;
}
