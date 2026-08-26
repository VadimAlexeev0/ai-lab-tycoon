import type { AppRouter } from "@ai-lab-tycoon/api/routers/index";
import type { GameState } from "@ai-lab-tycoon/engine";
import { env } from "@ai-lab-tycoon/env/web";
import type { Client } from "@orpc/client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				toast.error(`Error: ${error.message}`, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
		defaultOptions: { queries: { staleTime: 60 * 1000 } },
	});
}

function getServerUrl(url: string) {
	const processEnv = (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	if (typeof window === "undefined" && processEnv?.SERVER_URL) {
		return processEnv.SERVER_URL.endsWith("/")
			? processEnv.SERVER_URL.slice(0, -1)
			: processEnv.SERVER_URL;
	}

	const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

	if (!normalized.startsWith("/")) {
		return normalized;
	}

	if (typeof window !== "undefined") {
		return `${window.location.origin}${normalized}`;
	}

	const vercelUrl =
		processEnv?.VERCEL_ENV === "production"
			? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
			: (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
	if (vercelUrl) {
		const origin = vercelUrl.startsWith("http")
			? vercelUrl
			: `https://${vercelUrl}`;
		return `${origin}${normalized}`;
	}

	return `http://localhost:3000${normalized}`;
}

const link = new RPCLink({
	url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
	// The Task 8 auth middleware keys saves by the browser's session cookie.
	// Keep credentials on every RPC request, including mutations.
	fetch: (request, init) =>
		fetch(request, {
			...init,
			credentials: "include",
		}),
});

// TEMP TASK 10 TYPE STUB — reconcile this local game-save surface with the
// authenticated Task 8 AppRouter once that branch is merged. These types model
// the intended getActiveRun/upsertActiveRun/deleteActiveRun procedures without
// modifying packages/api, which is owned by the Task 8 worker.
export type ActiveRunRecord = {
	id: string;
	seed: number;
	schemaVersion: number;
	state: GameState;
	currentWeek: number;
	status: "active" | "terminal";
	revision: number;
};

export type UpsertActiveRunInput = {
	id: string;
	seed: number;
	schemaVersion: number;
	state: GameState;
	currentWeek: number;
	status: ActiveRunRecord["status"];
	revision?: number;
};

type NoInput = undefined;
type GameSaveClient = {
	getActiveRun: Client<
		Record<never, never>,
		NoInput,
		ActiveRunRecord | null,
		unknown
	>;
	upsertActiveRun: Client<
		Record<never, never>,
		UpsertActiveRunInput,
		ActiveRunRecord,
		unknown
	>;
	deleteActiveRun: Client<
		Record<never, never>,
		NoInput,
		{ deleted: boolean },
		unknown
	>;
};

export type WebRouterClient = RouterClient<AppRouter> & GameSaveClient;

const getORPCClient = () => {
	return createORPCClient(link) as WebRouterClient;
};

export const client: WebRouterClient = getORPCClient();

export const orpc = createTanstackQueryUtils(client);

export function toUpsertActiveRunInput(
	state: GameState,
	revision?: number,
): UpsertActiveRunInput {
	return {
		id: state.meta.runId,
		seed: state.rng.seed,
		schemaVersion: state.meta.schemaVersion,
		state,
		currentWeek: state.meta.week,
		status: state.terminal.status === "lost" ? "terminal" : "active",
		...(revision === undefined ? {} : { revision }),
	};
}

export async function persistActiveRun(
	state: GameState,
	revision?: number,
): Promise<ActiveRunRecord> {
	return client.upsertActiveRun(toUpsertActiveRunInput(state, revision));
}
