import {
	applyDecision,
	assertGameState,
	type DecisionChoice,
	type EngineResult,
	assignProject as engineAssignProject,
	cancelProject as engineCancelProject,
	designModel as engineDesignModel,
	type GameState,
	type ModelDesignSpec,
	runEvaluation,
	selectPendingDecisions,
} from "@ai-lab-tycoon/engine";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	getOrCreateAnonymousSession,
	resetAnonymousSessionBootstrap,
} from "@/utils/auth-client";
import {
	type ActiveRunRecord,
	client,
	persistActiveRun,
	SaveConflictError,
} from "@/utils/orpc";

export type SessionState =
	| { status: "loading" }
	| { status: "ready"; session: { userId: string } }
	| { status: "error"; message: string };

export type SaveState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "empty" }
	| { status: "ready"; record: ActiveRunRecord }
	| { status: "deleting"; record: ActiveRunRecord | null }
	| { status: "error"; message: string };

export type ActiveRunSnapshot = {
	state: GameState;
	record: ActiveRunRecord;
};

export type RunScreen = "selection" | "new" | "active";

export type UiDensity = "concise" | "detailed";

type EngineOperation = (state: GameState) => EngineResult;

export type RunContextValue = {
	session: SessionState;
	sessionLabel: string;
	saveState: SaveState;
	savedRun: ActiveRunRecord | null;
	activeRun: ActiveRunSnapshot | null;
	state: GameState | null;
	revision: number | undefined;
	screen: RunScreen;
	actionBusy: boolean;
	actionError: string | null;
	conflictRecord: ActiveRunRecord | null;
	retrySession: () => void;
	retryLoad: () => void;
	resumeRun: () => void;
	chooseNewRun: () => void;
	handleStarted: (result: ActiveRunSnapshot) => void;
	handleAdvanced: (result: ActiveRunSnapshot) => void;
	deleteRun: () => Promise<void>;
	executeEngineCommand: (operation: EngineOperation) => Promise<boolean>;
	assignProject: (teamId: string, projectId: string) => Promise<boolean>;
	cancelProject: (teamId: string, projectId: string) => Promise<boolean>;
	designModel: (spec: ModelDesignSpec) => Promise<boolean>;
	evaluateModel: (
		modelId: string,
		evaluation: "capability" | "safety_reliability",
	) => Promise<boolean>;
	resolveDecision: (choice: DecisionChoice) => Promise<boolean>;
	adoptConflictRecord: (record: ActiveRunRecord) => void;
	clearActionError: () => void;
};

export type UiStateContextValue = {
	acknowledgedReportIds: ReadonlySet<string>;
	milestoneDismissed: boolean;
	density: UiDensity;
	digestDismissed: boolean;
	setDensity: (density: UiDensity) => void;
	acknowledgeReport: (reportId: string) => void;
	continueSandbox: () => void;
	dismissDigest: () => void;
	restoreDigest: () => void;
};

export type GameStateContextValue = RunContextValue & UiStateContextValue;

const RunContext = createContext<RunContextValue | null>(null);
const UiStateContext = createContext<UiStateContextValue | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
	const session = useAnonymousSession();
	const userId = session.status === "ready" ? session.session.userId : null;
	const controller = useRunController(userId);
	const [acknowledgedReportIds, setAcknowledgedReportIds] = useState<
		ReadonlySet<string>
	>(new Set<string>());
	const [milestoneDismissed, setMilestoneDismissed] = useState(false);
	const [density, setDensity] = useState<UiDensity>("detailed");
	const [digestDismissed, setDigestDismissed] = useState(false);

	const runId =
		controller.activeRun?.state.meta.runId ??
		controller.savedRun?.state.meta.runId ??
		null;
	const uiRunIdRef = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		if (uiRunIdRef.current === runId) return;
		uiRunIdRef.current = runId;
		setAcknowledgedReportIds(new Set<string>());
		setMilestoneDismissed(false);
		setDigestDismissed(false);
	}, [runId]);

	const acknowledgeReport = useCallback((reportId: string) => {
		setAcknowledgedReportIds((current) => new Set([...current, reportId]));
	}, []);

	const continueSandbox = useCallback(() => {
		setMilestoneDismissed(true);
	}, []);

	const dismissDigest = useCallback(() => {
		setDigestDismissed(true);
	}, []);

	const restoreDigest = useCallback(() => {
		setDigestDismissed(false);
	}, []);

	const sessionLabel =
		session.status === "ready"
			? `ANON / ${session.session.userId.slice(0, 8)}`
			: session.status === "error"
				? "SESSION ERROR"
				: "SESSION STARTING";

	const runValue = useMemo<RunContextValue>(
		() => ({
			session,
			sessionLabel,
			saveState: controller.saveState,
			savedRun: controller.savedRun,
			activeRun: controller.activeRun,
			state: controller.activeRun?.state ?? null,
			revision: controller.activeRun?.record.revision,
			screen: controller.screen,
			actionBusy: controller.actionBusy,
			actionError: controller.actionError,
			conflictRecord: controller.conflictRecord,
			retryLoad: controller.retryLoad,
			resumeRun: controller.resumeRun,
			chooseNewRun: controller.chooseNewRun,
			handleStarted: controller.handleStarted,
			handleAdvanced: controller.handleAdvanced,
			deleteRun: controller.deleteRun,
			executeEngineCommand: controller.executeEngineCommand,
			assignProject: controller.assignProject,
			cancelProject: controller.cancelProject,
			designModel: controller.designModel,
			evaluateModel: controller.evaluateModel,
			resolveDecision: controller.resolveDecision,
			adoptConflictRecord: controller.adoptConflictRecord,
			clearActionError: controller.clearActionError,
			retrySession: session.retry,
		}),
		[controller, session, sessionLabel],
	);

	const uiValue = useMemo<UiStateContextValue>(
		() => ({
			acknowledgedReportIds,
			milestoneDismissed,
			density,
			digestDismissed,
			setDensity,
			acknowledgeReport,
			continueSandbox,
			dismissDigest,
			restoreDigest,
		}),
		[
			acknowledgeReport,
			acknowledgedReportIds,
			density,
			digestDismissed,
			dismissDigest,
			milestoneDismissed,
			continueSandbox,
			restoreDigest,
		],
	);

	return (
		<RunContext.Provider value={runValue}>
			<UiStateContext.Provider value={uiValue}>
				{children}
			</UiStateContext.Provider>
		</RunContext.Provider>
	);
}

export function useRunState(): RunContextValue {
	const value = useContext(RunContext);
	if (value === null) {
		throw new Error("useRunState must be used inside GameStateProvider");
	}
	return value;
}

export function useUiState(): UiStateContextValue {
	const value = useContext(UiStateContext);
	if (value === null) {
		throw new Error("useUiState must be used inside GameStateProvider");
	}
	return value;
}

/**
 * Compatibility selector for integrations that still need both slices.
 * Route components should prefer useRunState/useUiState to avoid broad
 * re-renders when UI-only state changes.
 */
export function useGameState(): GameStateContextValue {
	return { ...useRunState(), ...useUiState() };
}

function useAnonymousSession(): SessionState & { retry: () => void } {
	const [state, setState] = useState<SessionState>({ status: "loading" });
	const [_attempt, setAttempt] = useState(0);

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
	}, []);

	const retry = useCallback(() => {
		resetAnonymousSessionBootstrap();
		setState({ status: "loading" });
		setAttempt((current) => current + 1);
	}, []);

	return useMemo(() => ({ ...state, retry }), [retry, state]);
}

function useRunController(userId: string | null) {
	const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
	const [savedRun, setSavedRun] = useState<ActiveRunRecord | null>(null);
	const [activeRun, setActiveRun] = useState<ActiveRunSnapshot | null>(null);
	const [screen, setScreen] = useState<RunScreen>("selection");
	const [_loadAttempt, setLoadAttempt] = useState(0);
	const [actionBusy, setActionBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [conflictRecord, setConflictRecord] = useState<ActiveRunRecord | null>(
		null,
	);

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

		void client.gameSave
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
	}, [userId]);

	const retryLoad = useCallback(() => {
		setLoadAttempt((current) => current + 1);
	}, []);

	const resumeRun = useCallback(() => {
		setSavedRun((current) => {
			if (current === null) return current;
			setActiveRun({ state: current.state, record: current });
			setScreen("active");
			return current;
		});
	}, []);

	const chooseNewRun = useCallback(() => {
		setActiveRun(null);
		setScreen("new");
	}, []);

	const handleStarted = useCallback((result: ActiveRunSnapshot) => {
		setSavedRun(result.record);
		setActiveRun(result);
		setSaveState({ status: "ready", record: result.record });
		setScreen("active");
	}, []);

	const handleAdvanced = useCallback((result: ActiveRunSnapshot) => {
		setSavedRun(result.record);
		setActiveRun(result);
		setSaveState({ status: "ready", record: result.record });
	}, []);

	const deleteRun = useCallback(async () => {
		if (userId === null || savedRun === null) return;

		setSaveState({ status: "deleting", record: savedRun });
		try {
			await client.gameSave.deleteActiveRun();
			const remaining = normalizeActiveRun(
				await client.gameSave.getActiveRun(),
			);
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
	}, [savedRun, userId]);

	const executeEngineCommand = useCallback(
		async (operation: EngineOperation): Promise<boolean> => {
			if (activeRun === null || actionBusy) return false;
			setActionBusy(true);
			setActionError(null);
			setConflictRecord(null);
			try {
				const result = operation(activeRun.state);
				const record = await persistActiveRun(
					result.state,
					activeRun.record.revision,
				);
				handleAdvanced({ state: result.state, record });
				return true;
			} catch (cause: unknown) {
				if (cause instanceof SaveConflictError) {
					setConflictRecord(cause.storedRun);
					setActionError(cause.message);
				} else {
					setActionError(
						cause instanceof Error && cause.message.length > 0
							? cause.message
							: "The command could not be completed.",
					);
				}
				return false;
			} finally {
				setActionBusy(false);
			}
		},
		[actionBusy, activeRun, handleAdvanced],
	);

	const assignProject = useCallback(
		(teamId: string, projectId: string) =>
			executeEngineCommand((state) =>
				engineAssignProject(state, teamId, projectId),
			),
		[executeEngineCommand],
	);

	const cancelProject = useCallback(
		(teamId: string, projectId: string) =>
			executeEngineCommand((state) =>
				engineCancelProject(state, teamId, projectId),
			),
		[executeEngineCommand],
	);

	const designModel = useCallback(
		(spec: ModelDesignSpec) =>
			executeEngineCommand((state) => engineDesignModel(state, spec)),
		[executeEngineCommand],
	);

	const evaluateModel = useCallback(
		(modelId: string, evaluation: "capability" | "safety_reliability") =>
			executeEngineCommand((state) => {
				const pending = selectPendingDecisions(state).find(
					(decision) =>
						decision.kind === "evaluation" &&
						decision.modelId === modelId &&
						decision.evaluation === evaluation,
				);
				return pending
					? applyDecision(state, {
							kind: "evaluate",
							decisionId: pending.id,
							evaluation,
						})
					: runEvaluation(state, modelId, evaluation);
			}),
		[executeEngineCommand],
	);

	const resolveDecision = useCallback(
		(choice: DecisionChoice) =>
			executeEngineCommand((state) => applyDecision(state, choice)),
		[executeEngineCommand],
	);

	const adoptConflictRecord = useCallback((record: ActiveRunRecord) => {
		setConflictRecord(null);
		setActionError(null);
		setSavedRun(record);
		setActiveRun({ state: record.state, record });
		setSaveState({ status: "ready", record });
	}, []);

	const clearActionError = useCallback(() => {
		setActionError(null);
		setConflictRecord(null);
	}, []);

	return useMemo(
		() => ({
			saveState,
			savedRun,
			activeRun,
			screen,
			actionBusy,
			actionError,
			conflictRecord,
			retryLoad,
			resumeRun,
			chooseNewRun,
			handleStarted,
			handleAdvanced,
			deleteRun,
			executeEngineCommand,
			assignProject,
			cancelProject,
			designModel,
			evaluateModel,
			resolveDecision,
			adoptConflictRecord,
			clearActionError,
		}),
		[
			actionBusy,
			actionError,
			activeRun,
			adoptConflictRecord,
			assignProject,
			cancelProject,
			chooseNewRun,
			clearActionError,
			deleteRun,
			designModel,
			evaluateModel,
			executeEngineCommand,
			conflictRecord,
			handleAdvanced,
			handleStarted,
			resolveDecision,
			retryLoad,
			resumeRun,
			saveState,
			savedRun,
			screen,
		],
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
