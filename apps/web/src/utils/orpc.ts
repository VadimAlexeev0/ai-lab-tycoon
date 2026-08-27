import type { AppRouter } from "@ai-lab-tycoon/api/routers/index";
import type { GameState } from "@ai-lab-tycoon/engine";
import { env } from "@ai-lab-tycoon/env/web";
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
	// The auth middleware keys saves by the browser's session cookie; keep
	// credentials on every RPC request, including mutations.
	fetch: (request, init) =>
		fetch(request, {
			...init,
			credentials: "include",
		}),
});

const getORPCClient = () => {
	return createORPCClient(link) as RouterClient<AppRouter>;
};

export const client: RouterClient<AppRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);

// Convenience save helpers built on the real authenticated AppRouter.
export type ActiveRunRecord = {
	id: string;
	seed: number;
	schemaVersion: number;
	state: GameState;
	currentWeek: number;
	status: "active" | "terminal";
	revision: number;
};

export function toUpsertActiveRunInput(
	state: GameState,
	revision?: number,
): {
	seed: number;
	state: string;
	currentWeek: number;
	status: "active" | "terminal";
	schemaVersion: number;
	revision?: number;
} {
	const status: "active" | "terminal" =
		state.terminal.status === "lost" ? "terminal" : "active";
	return {
		seed: state.rng.seed,
		state: JSON.stringify(state),
		currentWeek: state.meta.week,
		status,
		schemaVersion: state.meta.schemaVersion,
		...(revision === undefined ? {} : { revision }),
	};
}

export async function persistActiveRun(
	state: GameState,
	revision?: number,
): Promise<ActiveRunRecord> {
	const input = toUpsertActiveRunInput(state, revision);
	try {
		const run = await client.gameSave.upsertActiveRun(input);
		return run as unknown as ActiveRunRecord;
	} catch (cause: unknown) {
		// Optimistic-concurrency loss: another tab saved this run first. Fetch
		// the stored winner so the UI can adopt it instead of losing the
		// session to a generic failure.
		if (!isORPCConflict(cause)) throw cause;
		const stored = await client.gameSave.getActiveRun();
		throw new SaveConflictError(
			stored === null ? null : (normalizeStoredRun(stored) as ActiveRunRecord),
		);
	}
}

/** True when the failure is the save API's optimistic-concurrency 409. */
function isORPCConflict(cause: unknown): boolean {
	return (
		typeof cause === "object" &&
		cause !== null &&
		(cause as { code?: unknown }).code === "CONFLICT"
	);
}

/**
 * Raised when a save lost an optimistic-concurrency race. `storedRun` is the
 * winning record fetched from the server (or null when it vanished); callers
 * should offer to reload it rather than keep local state.
 */
export class SaveConflictError extends Error {
	readonly storedRun: ActiveRunRecord | null;

	constructor(storedRun: ActiveRunRecord | null) {
		super(
			"This run was saved in another tab more recently. Reload the saved version to continue.",
		);
		this.name = "SaveConflictError";
		this.storedRun = storedRun;
	}
}

type UnknownRecord = Record<string, unknown>;

function normalizeStoredRun(value: unknown): UnknownRecord {
	return typeof value === "object" && value !== null
		? (value as UnknownRecord)
		: {};
}

/* Fetched on conflict; still passes through the same shape-guarded loader
   used by Resume, via the route's normalizeActiveRun. */
