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
import { type ReactNode, useEffect, useState } from "react";
import ComputePanel from "@/game/components/compute-panel";
import FundingPanel from "@/game/components/funding-panel";
import IncidentCard from "@/game/components/incident-card";
import ModelCard from "@/game/components/model-card";
import ModelDesigner from "@/game/components/model-designer";
import ProductPanel from "@/game/components/product-panel";
import ResearchPanel from "@/game/components/research-panel";
import RivalsPanel from "@/game/components/rivals-panel";
import RunResult from "@/game/components/run-result";
import TeamPanel from "@/game/components/team-panel";
import { type ActiveRunRecord, persistActiveRun } from "@/utils/orpc";

export type SessionStatus = "loading" | "ready" | "error";

export type DashboardPanel =
	| "overview"
	| "teams"
	| "research"
	| "models"
	| "products";

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
	const isReady = sessionStatus === "ready";

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
			setActionError(
				cause instanceof Error && cause.message.length > 0
					? cause.message
					: "The command could not be completed.",
			);
		} finally {
			setActionBusy(false);
		}
	}

	return (
		<main className="min-h-0 overflow-y-auto bg-background">
			<div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:gap-6 lg:px-8 lg:py-7">
				<header className="flex flex-col gap-5 border-border/70 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-2">
						<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.28em]">
							Operations / command console
						</p>
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h1 className="font-mono font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
								AI Startup Lab Tycoon
							</h1>
							<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
								V1 / deterministic sandbox
							</span>
						</div>
						<p className="max-w-2xl text-muted-foreground text-sm leading-6">
							Build a durable AI company one week at a time. Every decision
							spends resources, moves the frontier, and leaves a mechanical
							record.
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-3 self-start lg:self-end">
						<div className="flex items-center gap-2 rounded-none border border-border bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
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
							<span>{sessionLabel}</span>
						</div>
						{hasActiveRun && week !== undefined ? (
							<div className="border border-primary/35 bg-primary/10 px-3 py-2 font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.16em]">
								Week {week}
							</div>
						) : null}
					</div>
				</header>

				{hasActiveRun && companyName ? (
					<div className="flex flex-wrap items-center justify-between gap-2 border border-border/70 bg-card/60 px-3 py-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
						<span>
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
								<div className="flex items-center gap-2 font-mono font-semibold text-[10px] text-[var(--game-amber)] uppercase tracking-[0.2em]">
									<Radio className="size-3.5" aria-hidden="true" />
									Decision required
								</div>
								<p className="font-medium text-foreground text-sm">
									Resolve the highlighted decision before advancing the week.
								</p>
								<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
									Queue reference: {blockingDecisionId}
								</p>
							</section>
						) : null}
						{gameState ? (
							<DashboardPanels
								actionBusy={actionBusy}
								actionError={actionError}
								activePanel={activePanel}
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
	const activeDefinition =
		PANELS.find((panel) => panel.id === activePanel) ?? PANELS[0];
	const [milestoneDismissed, setMilestoneDismissed] = useState(false);
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
		}
	};

	return (
		<section aria-label="Operations modules" className="min-h-0">
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
				</div>
			) : null}

			<div
				role="tablist"
				aria-label="Operations modules"
				className="flex gap-1 overflow-x-auto border-border/70 border-y py-1 lg:hidden"
			>
				{PANELS.map((panel) => (
					<button
						key={panel.id}
						type="button"
						role="tab"
						aria-selected={activePanel === panel.id}
						aria-controls={`mobile-panel-${panel.id}`}
						onClick={() => onSelectPanel(panel.id)}
						className={cn(
							"flex min-h-9 shrink-0 items-center gap-2 px-2.5 font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]",
							activePanel === panel.id
								? "bg-primary text-primary-foreground"
								: "hover:bg-muted hover:text-foreground",
						)}
					>
						<span className="text-[9px] opacity-70">{panel.index}</span>
						{panel.id === "overview" ? "Overview" : panel.label}
					</button>
				))}
			</div>

			<div className="mt-3 lg:hidden">
				<PanelCard
					body={bodyFor(activeDefinition.id)}
					id={`mobile-panel-${activeDefinition.id}`}
					panel={activeDefinition}
					mobile
				/>
			</div>

			<div className="mt-3 hidden gap-3 lg:grid lg:grid-cols-12">
				<PanelCard
					body={bodyFor("overview")}
					className="lg:col-span-7"
					id="desktop-panel-overview"
					panel={PANELS[0]}
				/>
				<PanelCard
					body={bodyFor("teams")}
					className="lg:col-span-5"
					id="desktop-panel-teams"
					panel={PANELS[1]}
				/>
				<PanelCard
					body={bodyFor("research")}
					className="lg:col-span-5"
					id="desktop-panel-research"
					panel={PANELS[2]}
				/>
				<PanelCard
					body={bodyFor("models")}
					className="lg:col-span-6"
					id="desktop-panel-models"
					panel={PANELS[3]}
				/>
				<PanelCard
					body={bodyFor("products")}
					className="lg:col-span-6"
					id="desktop-panel-products"
					panel={PANELS[4]}
				/>
			</div>
		</section>
	);
}

function PanelCard({
	body,
	className,
	id,
	panel,
	mobile = false,
}: {
	body: ReactNode;
	className?: string;
	id: string;
	panel: PanelDefinition;
	mobile?: boolean;
}) {
	return (
		<article
			id={id}
			className={cn(
				"group relative flex min-h-36 flex-col overflow-hidden border border-border bg-card p-4",
				mobile ? "min-h-52" : null,
				className,
			)}
		>
			<div
				className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/10 to-transparent"
				aria-hidden="true"
			/>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						{panel.status}
					</p>
					<h2 className="mt-2 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]">
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
			<div className="flex flex-wrap gap-x-4 gap-y-1 border-border/70 border-t pt-3 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
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
			<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
				{label}
			</p>
			<p className="mt-1 font-mono font-semibold text-foreground text-sm">
				{value}
			</p>
		</div>
	);
}
