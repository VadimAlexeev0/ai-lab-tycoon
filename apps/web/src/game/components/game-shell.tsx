import {
	applyDecision,
	assignProject,
	cancelProject,
	type DecisionChoice,
	designModel,
	type EngineResult,
	type GameState,
	type ModelDesignSpec,
	runEvaluation,
	selectNextObjective,
	selectPendingDecisions,
	selectVisibleState,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import {
	AlertCircle,
	ChevronRight,
	Loader2,
	Radio,
	RotateCcw,
} from "lucide-react";
import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import ComputePanel from "@/game/components/compute-panel";
import EraBadge from "@/game/components/era-badge";
import FundingPanel from "@/game/components/funding-panel";
import IncidentCard from "@/game/components/incident-card";
import ModelCard from "@/game/components/model-card";
import ModelDesigner from "@/game/components/model-designer";
import ProductPanel from "@/game/components/product-panel";
import ReportHistory from "@/game/components/report-history";
import ReportQueue from "@/game/components/report-queue";
import ResearchPanel from "@/game/components/research-panel";
import RivalsPanel from "@/game/components/rivals-panel";
import RunResult from "@/game/components/run-result";
import TeamPanel from "@/game/components/team-panel";
import {
	type ActiveRunRecord,
	persistActiveRun,
	SaveConflictError,
} from "@/utils/orpc";

export type SessionStatus = "loading" | "ready" | "error";

export type DashboardPanel =
	| "overview"
	| "teams"
	| "research"
	| "models"
	| "products"
	| "reports";

export type GameRunSnapshot = {
	state: GameState;
	record: ActiveRunRecord;
};

type GameShellProps = {
	children?: ReactNode;
	sessionStatus: SessionStatus;
	sessionError?: string;
	onRetrySession?: () => void;
	sessionLabel?: string;
	companyName?: string;
	week?: number;
	hasActiveRun?: boolean;
	blockingDecisionId?: string | null;
	gameState?: GameState;
	revision?: number;
	onRunUpdated?: (result: GameRunSnapshot) => void | Promise<void>;
	onRestartRun?: () => void;
};

type PanelDefinition = {
	id: DashboardPanel;
	index: string;
	label: string;
	description: string;
	status: string;
};

type EngineOperation = (state: GameState) => EngineResult;

const PANELS: readonly PanelDefinition[] = [
	{
		id: "overview",
		index: "00",
		label: "Command overview",
		description: "Run health, objectives, and the latest operating signal.",
		status: "CONTROL ROOM",
	},
	{
		id: "teams",
		index: "01",
		label: "Teams",
		description: "Staffing capacity and project assignments.",
		status: "MODULE 01",
	},
	{
		id: "research",
		index: "02",
		label: "Research",
		description: "Research era, available work, and insight production.",
		status: "MODULE 02",
	},
	{
		id: "models",
		index: "03",
		label: "Models",
		description: "Model progress, evaluations, and visible estimates.",
		status: "MODULE 03",
	},
	{
		id: "products",
		index: "04",
		label: "Products",
		description: "Launch readiness, users, and operating performance.",
		status: "MODULE 04",
	},
	{
		id: "reports",
		index: "05",
		label: "Reports",
		description: "Blocking warnings, mechanical facts, and run history.",
		status: "MODULE 05",
	},
];

export default function GameShell({
	children,
	sessionStatus,
	sessionError,
	onRetrySession,
	sessionLabel = "SESSION STARTING",
	companyName,
	week,
	hasActiveRun = false,
	blockingDecisionId = null,
	gameState,
	revision,
	onRunUpdated,
	onRestartRun,
}: GameShellProps) {
	const [activePanel, setActivePanel] = useState<DashboardPanel>("overview");
	const [actionBusy, setActionBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	// Set when a save lost an optimistic-concurrency race; offers adoption of
	// the stored winner instead of silently dropping the session.
	const [conflictRecord, setConflictRecord] = useState<ActiveRunRecord | null>(
		null,
	);
	const [liveAnnouncement, setLiveAnnouncement] = useState("");
	const isReady = sessionStatus === "ready";
	const liveWeek = gameState?.meta.week;
	const reportCountThisWeek =
		liveWeek === undefined
			? 0
			: (
					gameState?.reports.items.filter(
						(report) => report.fact.week === liveWeek,
					) ?? []
				).length;

	useEffect(() => {
		if (liveWeek === undefined) {
			setLiveAnnouncement("");
			return;
		}
		setLiveAnnouncement(
			`Week ${liveWeek}. ${reportCountThisWeek} new ${reportCountThisWeek === 1 ? "report" : "reports"}.`,
		);
	}, [liveWeek, reportCountThisWeek]);

	useEffect(() => {
		if (blockingDecisionId === null) return;

		const target = document.getElementById(
			`decision-card-${blockingDecisionId}`,
		);
		target?.focus({ preventScroll: true });
	}, [blockingDecisionId]);

	async function executeEngineCommand(
		operation: EngineOperation,
	): Promise<void> {
		if (gameState === undefined || actionBusy) return;
		setActionBusy(true);
		setActionError(null);
		try {
			const result = operation(gameState);
			const record = await persistActiveRun(result.state, revision);
			await onRunUpdated?.({ state: result.state, record });
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
		} finally {
			setActionBusy(false);
		}
	}

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="game-shell min-h-0 min-w-0 overflow-y-auto overflow-x-clip bg-background"
		>
			<div
				aria-atomic="true"
				aria-live="polite"
				className="sr-only"
				role="status"
			>
				{liveAnnouncement}
			</div>
			<div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:gap-6 lg:px-8 lg:py-7">
				<header className="flex flex-col gap-5 border-border/70 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-2">
						<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.28em]">
							Operations / command console
						</p>
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h1 className="font-mono font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
								AI Startup Lab Tycoon
							</h1>
							<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
								V1 / deterministic sandbox
							</span>
						</div>
						<p className="max-w-2xl text-muted-foreground text-sm leading-6">
							Build a durable AI company one week at a time. Every decision
							spends resources, moves the frontier, and leaves a mechanical
							record.
						</p>
					</div>

					<div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 self-start lg:self-end">
						<div className="flex min-w-0 max-w-full items-center gap-2 rounded-none border border-border bg-card px-3 py-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
							<span
								className={cn(
									"size-2 rounded-full",
									sessionStatus === "ready"
										? "bg-[var(--game-positive)] shadow-[0_0_12px_var(--game-positive)]"
										: sessionStatus === "error"
											? "bg-[var(--game-negative)]"
											: "animate-pulse bg-[var(--game-amber)]",
								)}
								aria-hidden="true"
							/>
							<span className="min-w-0 break-words">{sessionLabel}</span>
						</div>
						{hasActiveRun && gameState ? (
							<EraBadge era={gameState.research.currentEra} size="compact" />
						) : null}
						{hasActiveRun && week !== undefined ? (
							<div className="border border-primary/35 bg-primary/10 px-3 py-2 font-mono font-semibold text-primary text-xs uppercase tracking-[0.16em]">
								Week {week}
							</div>
						) : null}
					</div>
				</header>

				{hasActiveRun && companyName ? (
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border border-border/70 bg-card/60 px-3 py-2.5 font-mono text-muted-foreground text-xs uppercase tracking-[0.14em]">
						<span className="min-w-0 break-words">
							Company <strong className="text-foreground">{companyName}</strong>
						</span>
						<span className="text-primary">Live run / autosave enabled</span>
					</div>
				) : null}

				{sessionStatus === "loading" ? <SessionLoadingState /> : null}
				{sessionStatus === "error" ? (
					<SessionErrorState error={sessionError} onRetry={onRetrySession} />
				) : null}

				{isReady ? (
					<>
						{children}
						{blockingDecisionId !== null ? (
							<section
								id={`decision-card-${blockingDecisionId}`}
								tabIndex={-1}
								aria-live="assertive"
								aria-label="Required decision"
								className="flex scroll-mt-6 flex-col gap-2 border border-[var(--game-amber)]/60 bg-[var(--game-amber)]/10 px-4 py-3 outline-none focus-visible:ring-1 focus-visible:ring-[var(--game-amber)]"
							>
								<div className="flex items-center gap-2 font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.2em]">
									<Radio className="size-3.5" aria-hidden="true" />
									<h2>Decision required</h2>
								</div>
								<p className="font-medium text-foreground text-sm">
									Resolve the highlighted decision before advancing the week.
								</p>
								<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
									Queue reference: {blockingDecisionId}
								</p>
							</section>
						) : null}
						{gameState ? (
							<DashboardPanels
								actionBusy={actionBusy}
								actionError={actionError}
								activePanel={activePanel}
								conflictRecord={conflictRecord}
								onAdoptConflictRecord={(stored) => {
									setConflictRecord(null);
									setActionError(null);
									void onRunUpdated?.({
										state: stored.state,
										record: stored,
									});
								}}
								onAssignProject={(teamId, projectId) => {
									void executeEngineCommand((state) =>
										assignProject(state, teamId, projectId),
									);
								}}
								onCancelProject={(teamId, projectId) => {
									void executeEngineCommand((state) =>
										cancelProject(state, teamId, projectId),
									);
								}}
								onDesignModel={(spec) => {
									void executeEngineCommand((state) =>
										designModel(state, spec),
									);
								}}
								onEvaluateModel={(modelId, evaluation) => {
									const pending = selectPendingDecisions(gameState).find(
										(decision) =>
											decision.kind === "evaluation" &&
											decision.modelId === modelId &&
											decision.evaluation === evaluation,
									);
									void executeEngineCommand((state) =>
										pending
											? applyDecision(state, {
													kind: "evaluate",
													decisionId: pending.id,
													evaluation,
												})
											: runEvaluation(state, modelId, evaluation),
									);
								}}
								onResolveDecision={(choice) => {
									void executeEngineCommand((state) =>
										applyDecision(state, choice),
									);
								}}
								onSelectPanel={setActivePanel}
								onRestartRun={onRestartRun}
								state={gameState}
							/>
						) : null}
					</>
				) : null}
			</div>
		</main>
	);
}

function SessionLoadingState() {
	return (
		<section
			aria-live="polite"
			className="flex min-h-48 flex-col items-center justify-center gap-3 border border-border bg-card/70 px-6 text-center"
		>
			<Loader2
				className="size-5 animate-spin text-primary"
				aria-hidden="true"
			/>
			<div>
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.16em]">
					Establishing anonymous session
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Connecting your private sandbox before reading any run data.
				</p>
			</div>
		</section>
	);
}

function SessionErrorState({
	error,
	onRetry,
}: {
	error?: string;
	onRetry?: () => void;
}) {
	return (
		<section
			role="alert"
			className="flex min-h-48 flex-col items-center justify-center gap-4 border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 px-6 text-center"
		>
			<AlertCircle
				className="size-5 text-[var(--game-negative)]"
				aria-hidden="true"
			/>
			<div>
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.16em]">
					Session unavailable
				</h2>
				<p className="mt-1 max-w-lg text-muted-foreground text-sm leading-6">
					{error ??
						"We could not establish your anonymous session. Your save has not been treated as empty."}
				</p>
			</div>
			{onRetry ? (
				<Button type="button" variant="outline" onClick={onRetry}>
					<RotateCcw data-icon="inline-start" aria-hidden="true" />
					Retry session
				</Button>
			) : null}
		</section>
	);
}

function DashboardPanels({
	actionBusy,
	actionError,
	activePanel,
	conflictRecord,
	onAdoptConflictRecord,
	onAssignProject,
	onCancelProject,
	onDesignModel,
	onEvaluateModel,
	onResolveDecision,
	onRestartRun,
	onSelectPanel,
	state,
}: {
	actionBusy: boolean;
	actionError: string | null;
	activePanel: DashboardPanel;
	conflictRecord: ActiveRunRecord | null;
	onAdoptConflictRecord: (record: ActiveRunRecord) => void;
	onAssignProject: (teamId: string, projectId: string) => void;
	onCancelProject: (teamId: string, projectId: string) => void;
	onDesignModel: (spec: ModelDesignSpec) => void;
	onEvaluateModel: (
		modelId: string,
		evaluation: "capability" | "safety_reliability",
	) => void;
	onResolveDecision: (choice: DecisionChoice) => void;
	onRestartRun?: () => void;
	onSelectPanel: (panel: DashboardPanel) => void;
	state: GameState;
}) {
	const [milestoneDismissed, setMilestoneDismissed] = useState(false);
	const [acknowledgedReportIds, setAcknowledgedReportIds] = useState<
		ReadonlySet<string>
	>(new Set<string>());
	const panelTabRefs = useRef<
		Partial<Record<DashboardPanel, HTMLButtonElement | null>>
	>({});
	// The run id is an intentional trigger for resetting panel-local state.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset local state when a new run loads
	useEffect(() => {
		setAcknowledgedReportIds(new Set<string>());
		setMilestoneDismissed(false);
	}, [state.meta.runId]);

	function acknowledgeReport(reportId: string) {
		setAcknowledgedReportIds((current) => new Set([...current, reportId]));
	}

	function handlePanelKeyDown(
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) {
		const { key } = event;
		if (
			key !== "ArrowRight" &&
			key !== "ArrowLeft" &&
			key !== "Home" &&
			key !== "End"
		) {
			return;
		}
		event.preventDefault();
		const nextIndex =
			key === "Home"
				? 0
				: key === "End"
					? PANELS.length - 1
					: (index + (key === "ArrowRight" ? 1 : -1) + PANELS.length) %
						PANELS.length;
		const nextPanel = PANELS[nextIndex];
		if (nextPanel === undefined) return;
		onSelectPanel(nextPanel.id);
		panelTabRefs.current[nextPanel.id]?.focus();
	}

	const bodyFor = (panel: DashboardPanel): ReactNode => {
		switch (panel) {
			case "overview":
				return <OverviewPanel state={state} />;
			case "teams":
				return (
					<TeamPanel
						disabled={actionBusy}
						onAssign={onAssignProject}
						onCancel={onCancelProject}
						state={state}
					/>
				);
			case "research":
				return <ResearchPanel state={state} />;
			case "models":
				return (
					<div className="space-y-6">
						<ModelDesigner
							disabled={actionBusy}
							onDesign={onDesignModel}
							state={state}
						/>
						<ModelCard
							disabled={actionBusy}
							onEvaluate={onEvaluateModel}
							state={state}
						/>
					</div>
				);
			case "products":
				return (
					<div className="space-y-6">
						<ProductPanel
							disabled={actionBusy}
							onResolveDecision={onResolveDecision}
							state={state}
						/>
						<ComputePanel state={state} />
						<RivalsPanel state={state} />
						<FundingPanel
							disabled={actionBusy}
							onResolveDecision={onResolveDecision}
							state={state}
						/>
						<IncidentCard
							disabled={actionBusy}
							onResolveDecision={onResolveDecision}
							state={state}
						/>
						<RunResult
							disabled={actionBusy}
							milestoneDismissed={milestoneDismissed}
							onContinueSandbox={() => setMilestoneDismissed(true)}
							onRestartRun={onRestartRun}
							state={state}
						/>
					</div>
				);
			case "reports":
				return (
					<div className="space-y-6">
						<ReportQueue
							acknowledgedIds={acknowledgedReportIds}
							onAcknowledge={acknowledgeReport}
							state={state}
						/>
						<ReportHistory
							acknowledgedIds={acknowledgedReportIds}
							state={state}
						/>
					</div>
				);
		}
	};

	return (
		<section aria-labelledby="operations-modules-heading" className="min-h-0">
			<h2 id="operations-modules-heading" className="sr-only">
				Operations modules
			</h2>
			{actionError ? (
				<div
					className="mb-3 flex items-start gap-2 border border-[var(--game-negative)]/50 bg-[var(--game-negative)]/10 px-3 py-2 text-[var(--game-negative)] text-xs leading-5"
					role="alert"
				>
					<AlertCircle
						className="mt-0.5 size-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span>{actionError}</span>
					{conflictRecord !== null ? (
						<button
							type="button"
							className="shrink-0 border border-[var(--game-negative)] px-2 py-1 font-mono text-xs uppercase tracking-wider hover:bg-[var(--game-negative)]/20"
							onClick={() => {
								onAdoptConflictRecord(conflictRecord);
							}}
						>
							Reload saved version
						</button>
					) : null}
				</div>
			) : null}

			<div
				role="tablist"
				aria-label="Operations modules"
				aria-orientation="horizontal"
				className="flex gap-1 overflow-x-auto border-border/70 border-y py-1 lg:hidden"
			>
				{PANELS.map((panel, index) => (
					<button
						id={`panel-tab-${panel.id}`}
						key={panel.id}
						type="button"
						role="tab"
						tabIndex={activePanel === panel.id ? 0 : -1}
						aria-selected={activePanel === panel.id}
						aria-controls={`panel-${panel.id}`}
						onClick={() => onSelectPanel(panel.id)}
						onKeyDown={(event) => handlePanelKeyDown(event, index)}
						ref={(element) => {
							panelTabRefs.current[panel.id] = element;
						}}
						className={cn(
							"flex min-h-9 shrink-0 items-center gap-2 px-2.5 font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]",
							activePanel === panel.id
								? "bg-primary text-primary-foreground"
								: "hover:bg-muted hover:text-foreground",
						)}
					>
						<span className="text-xs opacity-70">{panel.index}</span>
						{panel.id === "overview" ? "Overview" : panel.label}
					</button>
				))}
			</div>

			<div className="mt-3 grid gap-3 lg:grid-cols-12">
				{PANELS.map((panel) => (
					<PanelCard
						body={bodyFor(panel.id)}
						className={cn(
							activePanel === panel.id ? "flex" : "hidden lg:flex",
							panelGridClass(panel.id),
						)}
						id={`panel-${panel.id}`}
						key={panel.id}
						panel={panel}
					/>
				))}
			</div>
		</section>
	);
}

function PanelCard({
	body,
	className,
	id,
	panel,
}: {
	body: ReactNode;
	className?: string;
	id: string;
	panel: PanelDefinition;
}) {
	return (
		<article
			aria-labelledby={`panel-heading-${panel.id}`}
			id={id}
			role="tabpanel"
			className={cn(
				"group relative flex min-h-52 min-w-0 flex-col overflow-hidden border border-border bg-card p-4 lg:min-h-36",
				className,
			)}
		>
			{panel.id === "overview" ? (
				<div
					className="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden"
					aria-hidden="true"
				>
					<img
						alt=""
						className="h-full w-full object-cover opacity-[0.12]"
						decoding="async"
						loading="lazy"
						src="/art/key-art-command-center.png"
						style={{
							maskImage:
								"linear-gradient(to bottom, black 0%, transparent 100%)",
							WebkitMaskImage:
								"linear-gradient(to bottom, black 0%, transparent 100%)",
						}}
					/>
				</div>
			) : null}
			<div
				className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/10 to-transparent"
				aria-hidden="true"
			/>
			<div className="relative z-10 flex items-start justify-between gap-3">
				<div>
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.2em]">
						{panel.status}
					</p>
					<h2
						id={`panel-heading-${panel.id}`}
						className="mt-2 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
					>
						{panel.label}
					</h2>
				</div>
				<ChevronRight
					className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
					aria-hidden="true"
				/>
			</div>
			<div className="mt-4 min-w-0">{body}</div>
		</article>
	);
}

function panelGridClass(panel: DashboardPanel): string {
	switch (panel) {
		case "overview":
			return "lg:col-span-7";
		case "teams":
		case "research":
			return "lg:col-span-5";
		case "models":
		case "products":
		case "reports":
			return "lg:col-span-6";
	}
}

function OverviewPanel({ state }: { state: GameState }) {
	const visible = selectVisibleState(state);
	const objective = selectNextObjective(state);
	return (
		<div className="space-y-4">
			<p className="max-w-2xl text-muted-foreground text-sm leading-6">
				{objective.kind === "assign_project"
					? `Assign work to ${objective.teamId} to keep the frontier moving.`
					: objective.kind === "resolve_decision"
						? `Resolve decision ${objective.decisionId} before the next week.`
						: objective.kind === "advance_week"
							? `Advance from week ${objective.week} when the lab is ready.`
							: objective.guidance}
			</p>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Metric label="Cash" value={`$${visible.resourceBar.cash}`} />
				<Metric label="Insight" value={`${visible.resourceBar.insight}`} />
				<Metric label="Trust" value={`${visible.resourceBar.trust}`} />
				<Metric label="Hype" value={`${visible.resourceBar.hype}`} />
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 border-border/70 border-t pt-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
				<span>Era {state.meta.era}</span>
				<span>Teams {visible.teams.length}</span>
				<span>Models {visible.models.length}</span>
				<span>Reports {visible.recentReports.length}</span>
			</div>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="border border-border/70 bg-background/35 px-2.5 py-2">
			<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
				{label}
			</p>
			<p className="mt-1 font-mono font-semibold text-foreground text-sm">
				{value}
			</p>
		</div>
	);
}
