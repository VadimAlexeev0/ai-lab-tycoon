import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

if (process.env.NODE_ENV === "production") {
	config({ path: "../../apps/web/.env.prod", override: true });
	config({ path: "../../apps/server/.env.prod", override: true });
}

export const db = Cloudflare.D1.Database("database", {
	migrationsDir: "../../packages/db/src/migrations",
});

// Cloudflare's native binding keeps the RPC quota coherent across Worker
// isolates; the server still has an in-memory fallback for local/degraded runs.
export const rpcRateLimiter = Cloudflare.RateLimit("rpc-rate-limiter", {
	namespaceId: "ai-lab-tycoon-rpc",
	simple: { limit: 60, period: 60 },
});

export const server = Cloudflare.Worker("server", {
	main: "../../apps/server/src/index.ts",
	compatibility: {
		flags: ["nodejs_compat"],
	},
	env: {
		DB: db,
		// Config.redacted is emitted as a Cloudflare secret_text binding. Set
		// BETTER_AUTH_SECRET in the environment used by `alchemy deploy`.
		BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
		CORS_ORIGIN: Config.string("CORS_ORIGIN"),
		RPC_RATE_LIMITER: rpcRateLimiter,
	},
	dev: {
		port: 3000,
	},
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
	"ai-lab-tycoon",
	{
		providers: Cloudflare.providers(),
		state: Cloudflare.state(),
	},
	Effect.gen(function* () {
		const serverWorker = yield* server;
		const webWorker = yield* Cloudflare.Website.Vite("web", {
			rootDir: "../../apps/web",
			compatibility: {
				flags: ["nodejs_compat"],
			},
			env: {
				VITE_SERVER_URL: serverWorker.url.as<string>(),
			},
			dev: {
				port: 3001,
			},
		});

		return {
			web: webWorker.url,
			server: serverWorker.url,
		};
	}),
);
