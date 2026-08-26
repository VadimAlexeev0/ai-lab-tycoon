import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import GameShell, { type SessionStatus } from "@/game/components/game-shell";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

type AnonymousSession = {
	userId: string;
};

type SessionState =
	| { status: "loading" }
	| { status: "ready"; session: AnonymousSession }
	| { status: "error"; message: string };

let sessionBootstrap: Promise<AnonymousSession> | null = null;

function useAnonymousSession(): SessionState & { retry: () => void } {
	const [state, setState] = useState<SessionState>({ status: "loading" });

	useEffect(() => {
		let mounted = true;
		void getOrCreateAnonymousSession()
			.then((session) => {
				if (mounted) setState({ status: "ready", session });
			})
			.catch((error: unknown) => {
				if (!mounted) return;
				setState({
					status: "error",
					message:
						error instanceof Error
							? error.message
							: "The anonymous session could not be established.",
				});
			});

		return () => {
			mounted = false;
		};
	}, []);

	const retry = () => {
		sessionBootstrap = null;
		setState({ status: "loading" });
		void getOrCreateAnonymousSession()
			.then((session) => setState({ status: "ready", session }))
			.catch((error: unknown) => {
				setState({
					status: "error",
					message:
						error instanceof Error
							? error.message
							: "The anonymous session could not be established.",
				});
			});
	};

	return { ...state, retry };
}

function getOrCreateAnonymousSession(): Promise<AnonymousSession> {
	if (sessionBootstrap === null) {
		sessionBootstrap = bootstrapAnonymousSession();
	}
	return sessionBootstrap;
}

async function bootstrapAnonymousSession(): Promise<AnonymousSession> {
	const existing = await requestAuth("/api/auth/get-session");
	const existingUserId = findUserId(existing);
	if (existingUserId !== null) return { userId: existingUserId };

	const created = await requestAuth("/api/auth/sign-in/anonymous", {
		method: "POST",
		body: "{}",
	});
	const createdUserId = findUserId(created);
	if (createdUserId !== null) return { userId: createdUserId };

	// Some Better Auth adapters return an empty sign-in body while setting the
	// cookie. Confirm the session before allowing save reads or writes.
	const confirmed = await requestAuth("/api/auth/get-session");
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

function HomeComponent() {
	const session = useAnonymousSession();
	const status: SessionStatus = session.status;
	const sessionLabel =
		session.status === "ready"
			? `ANON / ${session.session.userId.slice(0, 8)}`
			: session.status === "error"
				? "SESSION ERROR"
				: "SESSION STARTING";

	return (
		<GameShell
			sessionStatus={status}
			sessionError={session.status === "error" ? session.message : undefined}
			onRetrySession={session.retry}
			sessionLabel={sessionLabel}
		>
			{session.status === "ready" ? <NoActiveRunState /> : null}
		</GameShell>
	);
}

function NoActiveRunState() {
	return (
		<section className="flex flex-col gap-3 border border-primary/35 bg-primary/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
					Run control
				</p>
				<h2 className="mt-2 font-mono font-semibold text-base text-foreground uppercase tracking-[0.08em]">
					No active run loaded
				</h2>
				<p className="mt-1 text-muted-foreground text-sm leading-6">
					Your private session is ready. Start a new company or resume its saved
					run from this console.
				</p>
			</div>
		</section>
	);
}
