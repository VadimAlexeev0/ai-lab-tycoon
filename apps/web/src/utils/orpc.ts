import type { ApplyCommand } from "@ai-lab-tycoon/api/routers/game-save-command";
import type { AppRouter } from "@ai-lab-tycoon/api/routers/index";
import {
	deserializeGameStateWithMetadata,
	type GameState,
	type GameStateUpgradeResult,
	upgradeGameStateWithMetadata,
} from "@ai-lab-tycoon/engine";
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

export type ActiveRunRecord = {
	id: string;
	seed: number;
	schemaVersion: number;
	state: GameState;
	currentWeek: number;
	status: "active" | "terminal";
	revision: number;
};

/** One opaque key per user action; callers retain it when retrying. */
export function createRequestId(): string {
	return crypto.randomUUID();
}

/** Apply a typed command and install only the server-returned snapshot. */
export async function applyServerCommand(
	command: ApplyCommand,
	expectedRevision: number,
	requestId: string,
): Promise<ActiveRunRecord> {
	try {
		const response = await client.gameSave.applyCommand({
			requestId,
			expectedRevision,
			command,
		});
		const record = normalizeActiveRun(response);
		if (record === null) {
			throw new Error("The command response did not include a run.");
		}
		return record;
	} catch (cause: unknown) {
		// Optimistic-concurrency loss: fetch the stored winner so the UI can
		// adopt it instead of losing the session to a generic failure.
		if (!isORPCConflict(cause)) throw cause;
		const stored = await client.gameSave.getActiveRun();
		throw new SaveConflictError(
			stored === null ? null : normalizeActiveRun(stored),
		);
	}
}

/** Normalize either a raw RPC response or the existing getActiveRun row. */
export function normalizeActiveRun(value: unknown): ActiveRunRecord | null {
	const record = unwrapRecord(value);
	if (record === null) return null;

	const rawState = record.state;
	if (rawState === null || rawState === undefined) {
		throw new Error("The saved run did not include an engine state.");
	}

	const parsed = parseState(rawState);
	const { state } = parsed;

	const envelopeSchemaVersion = readOptionalInteger(
		record,
		"schemaVersion",
		"Saved run schema version",
	);
	if (
		envelopeSchemaVersion !== undefined &&
		envelopeSchemaVersion !== parsed.sourceSchemaVersion
	) {
		throw new Error(
			"The saved run schema version does not match its raw engine state",
		);
	}

	const envelopeSeed = readOptionalInteger(record, "seed", "Saved run seed");
	if (envelopeSeed !== undefined && envelopeSeed !== state.rng.seed) {
		throw new Error("The saved run seed does not match its engine state");
	}
	const envelopeWeek = readOptionalInteger(
		record,
		"currentWeek",
		"Saved run week",
	);
	if (envelopeWeek !== undefined && envelopeWeek !== state.meta.week) {
		throw new Error("The saved run week does not match its engine state");
	}
	const stateStatus = state.terminal.status === "lost" ? "terminal" : "active";
	const envelopeStatus = readOptionalStatus(record);
	if (envelopeStatus !== undefined && envelopeStatus !== stateStatus) {
		throw new Error("The saved run status does not match its engine state");
	}

	const id = asNonEmptyString(record.id) ?? state.meta.runId;
	const seed = envelopeSeed ?? state.rng.seed;
	const currentWeek = envelopeWeek ?? state.meta.week;
	const revision =
		readOptionalInteger(record, "revision", "Saved run revision") ?? 0;

	return {
		id,
		seed,
		schemaVersion: parsed.currentSchemaVersion,
		state,
		currentWeek,
		status: envelopeStatus ?? stateStatus,
		revision,
	};
}

/** True when the failure is the command API's optimistic-concurrency 409. */
function isORPCConflict(cause: unknown): boolean {
	return (
		typeof cause === "object" &&
		cause !== null &&
		(cause as { code?: unknown }).code === "CONFLICT"
	);
}

/**
 * Raised when a command lost an optimistic-concurrency race. `storedRun` is
 * the winning record fetched from the server; callers should offer to adopt it.
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

function unwrapRecord(value: unknown): UnknownRecord | null {
	if (value === null || value === undefined) return null;
	let record = asRecord(value);
	if (record === null) return null;

	if (Object.hasOwn(record, "data")) {
		const data = record.data;
		if (data === null || data === undefined) return null;
		const nested = asRecord(data);
		if (nested !== null) record = nested;
	}
	if (Object.hasOwn(record, "run")) {
		const nested = record.run;
		if (nested === null || nested === undefined) return null;
		const nestedRecord = asRecord(nested);
		if (nestedRecord !== null) record = nestedRecord;
	}
	return record;
}

function parseState(rawState: unknown): GameStateUpgradeResult {
	try {
		return typeof rawState === "string"
			? deserializeGameStateWithMetadata(rawState)
			: upgradeGameStateWithMetadata(rawState);
	} catch (cause: unknown) {
		if (
			typeof rawState === "string" &&
			cause instanceof Error &&
			cause.message === "Serialized game state is not valid JSON"
		) {
			throw new Error("The saved run contains malformed engine JSON.");
		}
		throw new Error(
			`The saved run is incompatible with this engine version: ${toErrorMessage(cause, "invalid state")}`,
		);
	}
}

function asRecord(value: unknown): UnknownRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as UnknownRecord)
		: null;
}

function asNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalInteger(
	record: UnknownRecord,
	key: string,
	label: string,
): number | undefined {
	if (!Object.hasOwn(record, key)) return undefined;
	const value = record[key];
	if (typeof value !== "number" || !Number.isSafeInteger(value)) {
		throw new Error(`${label} must be a safe integer`);
	}
	return value;
}

function readOptionalStatus(
	record: UnknownRecord,
): ActiveRunRecord["status"] | undefined {
	if (!Object.hasOwn(record, "status")) return undefined;
	const value = record.status;
	if (value !== "active" && value !== "terminal") {
		throw new Error("Saved run status must be active or terminal");
	}
	return value;
}

function toErrorMessage(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message.length > 0
		? cause.message
		: fallback;
}
