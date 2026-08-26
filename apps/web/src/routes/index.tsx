import {
	assertGameState,
	type GameState,
	selectNextObjective,
	selectPendingDecisions,
	selectVisibleState,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import AdvanceWeekButton from "@/game/components/advance-week-button";
import GameShell from "@/game/components/game-shell";
import ResourceBar from "@/game/components/resource-bar";
import StartRunForm from "@/game/components/start-run-form";
import {
	getOrCreateAnonymousSession,
	resetAnonymousSessionBootstrap,
} from "@/utils/auth-client";
import { type ActiveRunRecord, client } from "@/utils/orpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

type SessionState =
	| { status: "loading" }
	| { status: "ready"; session: { userId: string } }
	| { status: "error"; message: string };

type SaveState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "empty" }
	| { status: "ready"; record: ActiveRunRecord }
	| { status: "deleting"; record: ActiveRunRecord | null }
	| { status: "error"; message: string };

type ActiveRunSnapshot = {
	state: GameState;
	record: ActiveRunRecord;
};

type RunScreen = "selection" | "new" | "active";

function useAnonymousSession(): SessionState & { retry: () => void } {
	const [state, setState] = useState<SessionState>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let mounted = true;
		void getOrCreateAnonymousSession()
			.then((session) => {
				if (mounted) setState({ status: "ready", session });
			})
			.catch((cause: unknown) => {
				if (!mounted) return;
				setState({
					status: "error",
					message: toErrorMessage(
						cause,
						"The anonymous session could not be established.",
					),
				});
			});

		return () => {
			mounted = false;
		};
	}, [attempt]);

	function retry() {
		resetAnonymousSessionBootstrap();
		setState({ status: "loading" });
		setAttempt((current) => current + 1);
	}

	return { ...state, retry };
}

function useRunController(userId: string | null) {
	const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
	const [savedRun, setSavedRun] = useState<ActiveRunRecord | null>(null);
	const [activeRun, setActiveRun] = useState<ActiveRunSnapshot | null>(null);
	const [screen, setScreen] = useState<RunScreen>("selection");
	const [loadAttempt, setLoadAttempt] = useState(0);

	useEffect(() => {
		if (userId === null) {
			setSaveState({ status: "idle" });
			setSavedRun(null);
			setActiveRun(null);
			setScreen("selection");
			return;
		}

		let mounted = true;
		setSaveState({ status: "loading" });
		setSavedRun(null);
		setActiveRun(null);
		setScreen("selection");

		void client
			.getActiveRun()
			.then((payload) => {
				if (!mounted) return;
				const record = normalizeActiveRun(payload);
				if (record === null) {
					setSaveState({ status: "empty" });
					return;
				}
				setSavedRun(record);
				setSaveState({ status: "ready", record });
			})
			.catch((cause: unknown) => {
				if (!mounted) return;
				setSaveState({
					status: "error",
					message: toErrorMessage(cause, "The saved run could not be loaded."),
				});
			});

		return () => {
			mounted = false;
		};
	}, [userId, loadAttempt]);

	function retryLoad() {
		setLoadAttempt((current) => current + 1);
	}

	function resumeRun() {
		if (savedRun === null) return;
		setActiveRun({ state: savedRun.state, record: savedRun });
		setScreen("active");
	}

	function chooseNewRun() {
		setActiveRun(null);
		setScreen("new");
	}

	function handleStarted(result: ActiveRunSnapshot) {
		setSavedRun(result.record);
		setActiveRun(result);
		setSaveState({ status: "ready", record: result.record });
		setScreen("active");
	}

	function handleAdvanced(result: ActiveRunSnapshot) {
		setSavedRun(result.record);
		setActiveRun(result);
		setSaveState({ status: "ready", record: result.record });
	}

	async function deleteRun() {
		if (userId === null || savedRun === null) return;
		if (
			!window.confirm(
				"Delete this run? All progress for this anonymous player will be permanently removed.",
			)
		) {
			return;
		}

		setSaveState({ status: "deleting", record: savedRun });
		try {
			await client.deleteActiveRun();
			// Read back the same user's save so a successful response cannot leave
			// the UI claiming deletion while a row is still present.
			const remaining = normalizeActiveRun(await client.getActiveRun());
			if (remaining !== null) {
				throw new Error("The run still exists after the delete request.");
			}
			setSavedRun(null);
			setActiveRun(null);
			setScreen("selection");
			setSaveState({ status: "empty" });
		} catch (cause: unknown) {
			setSaveState({
				status: "error",
				message: toErrorMessage(cause, "The run could not be deleted."),
			});
		}
	}

	return {
		saveState,
		savedRun,
		activeRun,
		screen,
		retryLoad,
		resumeRun,
		chooseNewRun,
		handleStarted,
		handleAdvanced,
		deleteRun,
	};
}

function HomeComponent() {
	const session = useAnonymousSession();
	const userId = session.status === "ready" ? session.session.userId : null;
	const run = useRunController(userId);
	const activeState = run.activeRun?.state;
	const blockingDecisionId = activeState
		? (selectPendingDecisions(activeState).find((decision) => decision.blocking)
				?.id ?? null)
		: null;
	const sessionLabel =
		session.status === "ready"
			? `ANON / ${session.session.userId.slice(0, 8)}`
			: session.status === "error"
				? "SESSION ERROR"
				: "SESSION STARTING";

	return (
		<GameShell
			blockingDecisionId={blockingDecisionId}
			companyName={activeState?.company.name}
			hasActiveRun={activeState !== undefined}
			onRetrySession={session.retry}
			sessionError={session.status === "error" ? session.message : undefined}
			sessionLabel={sessionLabel}
			sessionStatus={session.status}
			week={activeState?.meta.week}
		>
			{session.status === "ready" ? <RunConsole controller={run} /> : null}
		</GameShell>
	);
}

function RunConsole({
	controller,
}: {
	controller: ReturnType<typeof useRunController>;
}) {
	const {
		activeRun,
		chooseNewRun,
		deleteRun,
		handleAdvanced,
		handleStarted,
		retryLoad,
		saveState,
		savedRun,
		resumeRun,
		screen,
	} = controller;
	const isDeleting = saveState.status === "deleting";

	if (saveState.status === "idle" || saveState.status === "loading") {
		return <SaveLoadingState />;
	}
	if (saveState.status === "error") {
		return <SaveErrorState message={saveState.message} onRetry={retryLoad} />;
	}

	if (activeRun !== null && screen === "active") {
		return (
			<ActiveRunView
				onAdvanced={handleAdvanced}
				onDelete={deleteRun}
				onNewRun={chooseNewRun}
				isDeleting={isDeleting}
				run={activeRun}
			/>
		);
	}

	if (screen === "selection" && savedRun !== null) {
		return (
			<ResumeRunState
				onDelete={deleteRun}
				onNewRun={chooseNewRun}
				onResume={resumeRun}
				run={savedRun}
			/>
		);
	}

	return (
		<StartRunForm
			hasExistingRun={savedRun !== null}
			onStarted={handleStarted}
		/>
	);
}

function ActiveRunView({
	onAdvanced,
	onDelete,
	onNewRun,
	isDeleting,
	run,
}: {
	onAdvanced: (result: ActiveRunSnapshot) => void;
	onDelete: () => void;
	onNewRun: () => void;
	isDeleting: boolean;
	run: ActiveRunSnapshot;
}) {
	const visibleState = selectVisibleState(run.state);
	const objective = selectNextObjective(run.state);
	const blockingDecision = selectPendingDecisions(run.state).find(
		(decision) => decision.blocking,
	);

	return (
		<section aria-labelledby="active-run-heading" className="space-y-4">
			<div className="flex flex-col gap-3 border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Active run
					</p>
					<h2
						id="active-run-heading"
						className="mt-1 truncate font-mono font-semibold text-base text-foreground uppercase tracking-[0.08em]"
					>
						{run.state.company.name}
					</h2>
					<p className="mt-1 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
						Seed {run.state.rng.seed} · Autosave revision {run.record.revision}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={isDeleting}
						onClick={onNewRun}
						size="sm"
						variant="outline"
					>
						<Play data-icon="inline-start" aria-hidden="true" />
						New run
					</Button>
					<Button
						disabled={isDeleting}
						onClick={onDelete}
						size="sm"
						variant="destructive"
					>
						<Trash2 data-icon="inline-start" aria-hidden="true" />
						{isDeleting ? "Deleting…" : "Delete run"}
					</Button>
				</div>
			</div>

			<ResourceBar state={run.state} />
			<AdvanceWeekButton
				onAdvanced={onAdvanced}
				revision={run.record.revision}
				state={run.state}
			/>

			<section
				aria-label="Next objective"
				className="border border-border/70 bg-card/50 px-4 py-3"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
						Next objective
					</p>
					<span className="font-mono text-[10px] text-primary uppercase tracking-[0.12em]">
						{objective.kind.replaceAll("_", " ")}
					</span>
				</div>
				<p className="mt-2 text-foreground text-sm leading-6">
					{objective.kind === "resolve_decision"
						? `Decision ${objective.decisionId} requires attention before time can move.`
						: objective.kind === "assign_project"
							? `Assign a project to ${objective.teamId} or advance when the lab is ready.`
							: objective.kind === "advance_week"
								? `Advance from week ${objective.week} when you are ready.`
								: objective.guidance}
				</p>
				{blockingDecision ? (
					<p className="mt-1 font-mono text-[10px] text-[var(--game-amber)] uppercase tracking-[0.12em]">
						Advance locked · resolve {blockingDecision.id}
					</p>
				) : null}
				<p className="mt-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
					Engine status: {visibleState.terminal.status} · week{" "}
					{run.state.meta.week}
				</p>
			</section>
		</section>
	);
}

function ResumeRunState({
	onDelete,
	onNewRun,
	onResume,
	run,
}: {
	onDelete: () => void;
	onNewRun: () => void;
	onResume: () => void;
	run: ActiveRunRecord;
}) {
	return (
		<section
			aria-labelledby="resume-run-heading"
			className="border border-primary/40 bg-primary/5 p-4 sm:p-5"
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Saved run found
					</p>
					<h2
						id="resume-run-heading"
						className="mt-2 font-mono font-semibold text-base text-foreground uppercase tracking-[0.08em]"
					>
						{run.state.company.name}
					</h2>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6">
						Your anonymous session has an autosaved run ready to resume. Nothing
						is loaded as a blank game.
					</p>
				</div>
				<Save className="size-5 text-primary/70" aria-hidden="true" />
			</div>
			<div className="mt-4 grid gap-2 border-border/70 border-y py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em] sm:grid-cols-3">
				<span>Week {run.currentWeek}</span>
				<span>Seed {run.seed}</span>
				<span>Revision {run.revision}</span>
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<Button onClick={onResume}>
					<Play data-icon="inline-start" aria-hidden="true" />
					Resume run
				</Button>
				<Button onClick={onNewRun} variant="outline">
					Start new run
				</Button>
				<Button onClick={onDelete} variant="destructive">
					<Trash2 data-icon="inline-start" aria-hidden="true" />
					Delete run
				</Button>
			</div>
		</section>
	);
}

function SaveLoadingState() {
	return (
		<section
			aria-live="polite"
			className="flex min-h-32 items-center gap-3 border border-border bg-card/70 px-4"
		>
			<Save className="size-4 animate-pulse text-primary" aria-hidden="true" />
			<div>
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.12em]">
					Reading autosave
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Checking this session for an active run.
				</p>
			</div>
		</section>
	);
}

function SaveErrorState({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<section
			role="alert"
			className="flex min-h-32 flex-col items-start gap-3 border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 px-4 py-4 sm:flex-row sm:items-center"
		>
			<AlertCircle
				className="size-5 shrink-0 text-[var(--game-negative)]"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1">
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.12em]">
					Autosave unavailable
				</h2>
				<p className="mt-1 text-muted-foreground text-sm leading-6">
					{message}
				</p>
			</div>
			<Button onClick={onRetry} size="sm" variant="outline">
				<RotateCcw data-icon="inline-start" aria-hidden="true" />
				Retry save read
			</Button>
		</section>
	);
}

function normalizeActiveRun(value: unknown): ActiveRunRecord | null {
	const record = unwrapRecord(value);
	if (record === null) return null;

	const rawState = record.state;
	const state = typeof rawState === "string" ? parseState(rawState) : rawState;
	if (state === null || state === undefined) {
		throw new Error("The saved run did not include an engine state.");
	}

	try {
		assertGameState(state);
	} catch (cause: unknown) {
		throw new Error(
			`The saved run is incompatible with this engine version: ${toErrorMessage(cause, "invalid state")}`,
		);
	}

	const id = asNonEmptyString(record.id) ?? state.meta.runId;
	const seed = asInteger(record.seed) ?? state.rng.seed;
	const schemaVersion =
		asInteger(record.schemaVersion) ?? state.meta.schemaVersion;
	const currentWeek = asInteger(record.currentWeek) ?? state.meta.week;
	const revision = asInteger(record.revision) ?? 0;
	const status =
		record.status === "terminal" || state.terminal.status === "lost"
			? "terminal"
			: "active";

	return {
		id,
		seed,
		schemaVersion,
		state,
		currentWeek,
		status,
		revision,
	};
}

function unwrapRecord(value: unknown): Record<string, unknown> | null {
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

function parseState(rawState: string): GameState {
	try {
		return JSON.parse(rawState) as GameState;
	} catch {
		throw new Error("The saved run contains malformed engine JSON.");
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function asInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value)
		? value
		: null;
}

function toErrorMessage(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message.length > 0
		? cause.message
		: fallback;
}
