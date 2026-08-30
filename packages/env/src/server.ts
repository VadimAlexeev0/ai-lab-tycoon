/// <reference types="@cloudflare/workers-types" />
/// <reference path="../env.d.ts" />
// For Cloudflare Workers, env is accessed via cloudflare:workers module
// Types are defined in env.d.ts based on your alchemy.run.ts bindings.
export { env } from "cloudflare:workers";

/**
 * Configuration bindings required by the server Worker. The concrete
 * Cloudflare binding types are inferred from `packages/infra/alchemy.run.ts`;
 * keeping the names here documents the server-side configuration contract.
 */
export type ServerEnvironment = {
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	API_DOCS_ENABLED: string;
};
