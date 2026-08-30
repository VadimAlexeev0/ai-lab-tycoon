import { createDb } from "@ai-lab-tycoon/db";
import { env } from "@ai-lab-tycoon/env/server";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";

import { requireAuthSecret } from "./auth-config";

const betterAuthSecret = requireAuthSecret(env.BETTER_AUTH_SECRET);

/**
 * Single Better Auth instance for the whole worker. Drizzle adapter writes the
 * auth tables (user/session/account/verification) into the same D1 database as
 * the game saves; the anonymous plugin mints a stable userId on first load so
 * a save is keyed to a real owner without any signup UI.
 *
 * Better Auth derives its origin from each incoming Worker request when no
 * static base URL is configured. That keeps local and deployed Worker URLs
 * valid without introducing a second required environment variable.
 */
export const auth = betterAuth({
	secret: betterAuthSecret,
	database: drizzleAdapter(createDb(), {
		provider: "sqlite",
	}),
	plugins: [anonymous()],
	trustedOrigins: [env.CORS_ORIGIN],
	emailAndPassword: {
		enabled: false,
	},
});
