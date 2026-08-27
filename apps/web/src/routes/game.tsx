import {
	type DecisionChoice,
	type FundingRound,
	type GameState,
	type PendingDecision,
	selectPendingDecisions,
	selectVisibleModels,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import {
	Activity,
	AlertCircle,
	Archive,
	ArrowRight,
	BookOpen,
	BrainCircuit,
	BriefcaseBusiness,
	ChartNoAxesCombined,
	FlaskConical,
	House,
	Loader2,
	Newspaper,
	PanelTop,
	RotateCcw,
	Settings2,
	X,
} from "lucide-react";
import { useEffect } from "react";

import AdvanceWeekButton from "@/game/components/advance-week-button";
import DebugDrawer from "@/game/components/debug-drawer";
import EraBadge from "@/game/components/era-badge";
import IncidentCard from "@/game/components/incident-card";
import LaunchDecision from "@/game/components/launch-decision";
import NewsTicker from "@/game/components/news-ticker";
import Pane from "@/game/components/pane";
import ResourceBar from "@/game/components/resource-bar";
import { GameStateProvider, useGameState } from "@/game/game-state-context";

export type GameSearch = {
	decision?: string;
	node?: string;
	debug?: "1";
	quarter?: number;
	rivalProgress?: number;
	quarterly?: "1";
	pulse?: "1";
	chronicle?: "1";
};

export const Route = createFileRoute("/game")({
	head: () => ({
		meta: [{ title: "Operations · AI Startup Lab Tycoon" }],
	}),
	validateSearch: validateGameSearch,
	component: GameRoute,
});

function GameRoute() {
	return (
		<GameStateProvider>
			<GameLayout />
		</GameStateProvider>
	);
}

function GameLayout() {
	const game = useGameState();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const state = game.state;
	const pendingDecisions = state === null ? [] : selectPendingDecisions(state);
	const blockingDecision = pendingDecisions.find(
		(decision) => decision.blocking,
	);
	const selectedDecision = pendingDecisions.find(
		(decision) => decision.id === search.decision,
	);
	const isActive = game.activeRun !== null && game.screen === "active";
	const reportCountThisWeek =
		state === null
			? 0
			: state.reports.items.filter(
					(report) => report.fact.week === state.meta.week,
				).length;
	const liveAnnouncement =
		state === null
			? ""
			: `Week ${state.meta.week}. ${reportCountThisWeek} new ${reportCountThisWeek === 1 ? "report" : "reports"}.`;

	useEffect(() => {
		if (
			game.session.status !== "ready" ||
			game.saveState.status !== "ready" ||
			game.activeRun !== null ||
			game.savedRun === null
		) {
			return;
		}
		game.resumeRun();
	}, [
		game.activeRun,
		game.resumeRun,
		game.saveState.status,
		game.savedRun,
		game.session.status,
	]);

	useEffect(() => {
		if (!isActive) return;
		if (blockingDecision !== undefined) {
			if (search.decision === blockingDecision.id) return;
			void navigate({
				replace: true,
				search: (current) => ({
					...current,
					decision: blockingDecision.id,
				}),
			});
			return;
		}
		if (search.decision !== undefined && selectedDecision === undefined) {
			void navigate({
				replace: true,
				search: (current) => ({ ...current, decision: undefined }),
			});
		}
	}, [blockingDecision, isActive, navigate, search.decision, selectedDecision]);

	function closeDecision() {
		void navigate({
			replace: true,
			search: (current) => ({ ...current, decision: undefined }),
		});
	}

	function startNewRun() {
		game.chooseNewRun();
		void navigate({ to: "/" });
	}

	return (
		<div className="relative min-h-0 min-w-0 overflow-hidden">
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
					{isActive ? liveAnnouncement : ""}
				</div>
				<div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4 px-4 py-4 pb-24 sm:gap-5 sm:px-6 sm:py-5 sm:pb-24 lg:px-8 lg:py-7 lg:pb-8">
					<header className="flex flex-col gap-3 border-border/70 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="min-w-0 space-y-1.5">
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
							{isActive && state !== null ? (
								<p className="max-w-2xl text-muted-foreground text-sm leading-6">
									{state.company.name} · Every decision spends resources, moves
									the frontier, and leaves a mechanical record.
								</p>
							) : (
								<p className="max-w-2xl text-muted-foreground text-sm leading-6">
									A route-per-element command center for deterministic AI
									company operations.
								</p>
							)}
						</div>
						<div className="flex max-w-full flex-wrap items-center gap-2 self-start lg:self-end">
							<SessionBadge
								label={game.sessionLabel}
								status={game.session.status}
							/>
							{isActive && state !== null ? (
								<EraBadge era={state.research.currentEra} size="compact" />
							) : null}
							{isActive ? (
								<>
									<Button
										onClick={startNewRun}
										size="sm"
										type="button"
										variant="outline"
									>
										<ArrowRight data-icon="inline-start" aria-hidden="true" />
										New run
									</Button>
									<Button
										disabled={game.saveState.status === "deleting"}
										onClick={() => void game.deleteRun()}
										size="sm"
										type="button"
										variant="destructive"
									>
										<X data-icon="inline-start" aria-hidden="true" />
										Delete
									</Button>
								</>
							) : null}
						</div>
					</header>

					{isActive && state !== null ? (
						<>
							<div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.38fr)]">
								<ResourceBar state={state} />
								<div className="flex min-w-0 items-center justify-between gap-3 border border-primary/35 bg-primary/10 px-3 py-2">
									<div className="min-w-0">
										<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.18em]">
											Current week
										</p>
										<p className="mt-1 font-mono font-semibold text-foreground text-lg leading-none">
											Week {state.meta.week}
										</p>
									</div>
									<span className="hidden font-mono text-muted-foreground text-xs uppercase tracking-[0.12em] sm:block">
										Era {state.meta.era}
									</span>
								</div>
							</div>
							<AdvanceWeekButton
								onAdvanced={game.handleAdvanced}
								revision={game.revision}
								state={state}
							/>
							<Navigation />
							<ActionFeedback
								actionError={game.actionError}
								conflictRecord={game.conflictRecord}
								onAdopt={game.adoptConflictRecord}
								onDismiss={game.clearActionError}
							/>
							<Outlet />
						</>
					) : (
						<GameRouteState />
					)}
				</div>
			</main>
			<MobileNavigation />
			<NewsTicker
				forceVisible={search.debug === "1" || search.pulse === "1"}
				rivalProgressPct={search.rivalProgress}
				state={state}
			/>
			<DebugDrawer
				debugForced={search.debug === "1"}
				quarter={search.quarter ?? 1}
				rivalProgress={search.rivalProgress ?? 0}
				onForceIndustryPulse={() => {
					void navigate({
						to: "/game/pulse",
						search: (current) => ({
							...current,
							pulse: "1",
							quarterly: undefined,
						}),
					});
				}}
				onForceChronicle={() => {
					void navigate({
						to: "/game/chronicle",
						search: (current) => ({
							...current,
							chronicle: "1",
							quarterly: undefined,
							pulse: undefined,
						}),
					});
				}}
				onForceQuarterlyReview={() => {
					void navigate({
						to: "/game/quarterly",
						search: (current) => ({
							...current,
							quarterly: "1",
							pulse: undefined,
						}),
					});
				}}
				onQuarterChange={(quarter) => {
					void navigate({
						search: (current) => ({ ...current, quarter }),
					});
				}}
				onRivalProgressChange={(rivalProgress) => {
					void navigate({
						search: (current) => ({ ...current, rivalProgress }),
					});
				}}
			/>
			{isActive && state !== null && selectedDecision !== undefined ? (
				<DecisionOverlay
					decision={selectedDecision}
					onClose={closeDecision}
					onResolve={game.resolveDecision}
					state={state}
				/>
			) : null}
		</div>
	);
}

function Navigation() {
	const location = useLocation();
	return (
		<div className="hidden min-w-0 lg:block">
			<nav
				aria-label="Desktop game destinations"
				className="flex min-w-0 items-center gap-1 overflow-x-auto border-border/70 border-y py-1"
			>
				{DESTINATIONS.map((destination) => {
					const active = isDestinationActive(location.pathname, destination.to);
					const Icon = destination.icon;
					return (
						<Link
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex min-h-9 shrink-0 items-center gap-2 px-3 font-mono font-semibold text-xs uppercase tracking-[0.12em]",
								active
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
							key={destination.to}
							to={destination.to}
						>
							<Icon className="size-3.5" aria-hidden="true" />
							{destination.label}
						</Link>
					);
				})}
			</nav>
			<nav
				aria-label="Archive destinations"
				className="mt-2 flex min-w-0 items-center gap-1 overflow-x-auto border-border/50 border-b border-dashed pb-1"
			>
				<div className="flex shrink-0 items-center gap-1.5 px-2 font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
					<Archive className="size-3.5" aria-hidden="true" />
					<span>Archive</span>
				</div>
				{ARCHIVE_DESTINATIONS.map((destination) => {
					const active = isDestinationActive(location.pathname, destination.to);
					const Icon = destination.icon;
					return (
						<Link
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex min-h-8 shrink-0 items-center gap-1.5 px-2 font-mono text-xs uppercase tracking-[0.1em]",
								active
									? "bg-[var(--game-amber)]/15 text-[var(--game-amber)]"
									: "text-muted-foreground/80 hover:bg-muted hover:text-foreground",
							)}
							key={destination.to}
							to={destination.to}
						>
							<Icon className="size-3.5" aria-hidden="true" />
							{destination.label}
							<span className="border border-[var(--game-amber)]/50 px-1 py-0.5 font-mono text-[10px] text-[var(--game-amber)] leading-none">
								Preview
							</span>
						</Link>
					);
				})}
			</nav>
		</div>
	);
}

function MobileNavigation() {
	const location = useLocation();
	return (
		<nav
			aria-label="Game destinations"
			className="fixed inset-x-0 bottom-0 z-40 overflow-hidden border-border border-t bg-card/95 pt-1 backdrop-blur-sm lg:hidden"
			style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
		>
			<div className="flex min-w-max items-stretch overflow-x-auto px-1">
				{DESTINATIONS.map((destination) => {
					const active = isDestinationActive(location.pathname, destination.to);
					const Icon = destination.icon;
					return (
						<Link
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex min-h-11 min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 px-1 font-mono text-xs uppercase tracking-[0.04em]",
								active
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
							key={destination.to}
							to={destination.to}
						>
							<Icon className="size-4" aria-hidden="true" />
							<span className="max-w-full truncate">
								{destination.shortLabel}
							</span>
						</Link>
					);
				})}
				<div
					aria-hidden="true"
					className="mx-1 my-1 w-px shrink-0 bg-border/70"
				/>
				<div className="flex min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 px-1 font-mono text-muted-foreground text-xs uppercase tracking-[0.04em]">
					<Archive className="size-4" aria-hidden="true" />
					<span>Archive</span>
				</div>
				{ARCHIVE_DESTINATIONS.map((destination) => {
					const active = isDestinationActive(location.pathname, destination.to);
					const Icon = destination.icon;
					return (
						<Link
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex min-h-11 min-w-[5.5rem] shrink-0 flex-col items-center justify-center gap-0.5 px-1 font-mono text-xs uppercase tracking-[0.04em]",
								active
									? "bg-[var(--game-amber)]/15 text-[var(--game-amber)]"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
							key={destination.to}
							to={destination.to}
						>
							<Icon className="size-4" aria-hidden="true" />
							<span className="max-w-full truncate">
								{destination.shortLabel}
							</span>
							<span className="font-mono text-[10px] leading-none">
								Preview
							</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}

const DESTINATIONS = [
	{
		to: "/game",
		label: "Overview",
		shortLabel: "Home",
		icon: House,
	},
	{
		to: "/game/teams",
		label: "Teams",
		shortLabel: "Teams",
		icon: BriefcaseBusiness,
	},
	{
		to: "/game/research",
		label: "Research",
		shortLabel: "Research",
		icon: FlaskConical,
	},
	{
		to: "/game/models",
		label: "Models",
		shortLabel: "Models",
		icon: BrainCircuit,
	},
	{
		to: "/game/products",
		label: "Products",
		shortLabel: "Products",
		icon: ChartNoAxesCombined,
	},
	{
		to: "/game/reports",
		label: "Reports",
		shortLabel: "Reports",
		icon: PanelTop,
	},
] as const;

const ARCHIVE_DESTINATIONS = [
	{
		to: "/game/quarterly",
		label: "Quarterly Review",
		shortLabel: "Quarterly",
		icon: PanelTop,
	},
	{
		to: "/game/pulse",
		label: "Industry Pulse",
		shortLabel: "Pulse",
		icon: Newspaper,
	},
	{
		to: "/game/chronicle",
		label: "Company Chronicle",
		shortLabel: "Chronicle",
		icon: BookOpen,
	},
] as const;

function isDestinationActive(pathname: string, destination: string): boolean {
	return destination === "/game"
		? pathname === "/game" || pathname === "/game/"
		: pathname.startsWith(destination);
}

function SessionBadge({
	label,
	status,
}: {
	label: string;
	status: "loading" | "ready" | "error";
}) {
	return (
		<div className="flex min-w-0 max-w-full items-center gap-2 border border-border bg-card px-3 py-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
			<span
				aria-hidden="true"
				className={cn(
					"size-2 shrink-0 rounded-full",
					status === "ready"
						? "bg-[var(--game-positive)] shadow-[0_0_12px_var(--game-positive)]"
						: status === "error"
							? "bg-[var(--game-negative)]"
							: "animate-pulse bg-[var(--game-amber)]",
				)}
			/>
			<span className="min-w-0 break-words">{label}</span>
		</div>
	);
}

function ActionFeedback({
	actionError,
	conflictRecord,
	onAdopt,
	onDismiss,
}: {
	actionError: string | null;
	conflictRecord: ReturnType<typeof useGameState>["conflictRecord"];
	onAdopt: (
		record: NonNullable<ReturnType<typeof useGameState>["conflictRecord"]>,
	) => void;
	onDismiss: () => void;
}) {
	if (actionError === null) return null;
	return (
		<div
			className="flex flex-wrap items-start gap-2 border border-[var(--game-negative)]/50 bg-[var(--game-negative)]/10 px-3 py-2 text-[var(--game-negative)] text-xs leading-5"
			role="alert"
		>
			<AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1">{actionError}</span>
			{conflictRecord !== null ? (
				<button
					className="shrink-0 border border-[var(--game-negative)] px-2 py-1 font-mono text-xs uppercase tracking-wider hover:bg-[var(--game-negative)]/20"
					onClick={() => onAdopt(conflictRecord)}
					type="button"
				>
					Reload saved version
				</button>
			) : null}
			<button
				aria-label="Dismiss command error"
				className="flex min-h-8 min-w-8 items-center justify-center text-[var(--game-negative)] hover:bg-[var(--game-negative)]/20"
				onClick={onDismiss}
				type="button"
			>
				<X className="size-3.5" aria-hidden="true" />
			</button>
		</div>
	);
}

function GameRouteState() {
	const game = useGameState();
	if (game.session.status === "loading") {
		return (
			<section
				aria-live="polite"
				className="flex min-h-48 flex-col items-center justify-center gap-3 border border-border bg-card/70 px-6 text-center"
			>
				<Loader2
					className="size-5 animate-spin text-primary"
					aria-hidden="true"
				/>
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.16em]">
					Establishing anonymous session
				</h2>
			</section>
		);
	}
	if (game.session.status === "error") {
		return (
			<section
				role="alert"
				className="flex min-h-48 flex-col items-center justify-center gap-4 border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 px-6 text-center"
			>
				<AlertCircle
					className="size-5 text-[var(--game-negative)]"
					aria-hidden="true"
				/>
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.16em]">
					Session unavailable
				</h2>
				<p className="max-w-lg text-muted-foreground text-sm leading-6">
					{game.session.message}
				</p>
				<Button onClick={game.retrySession} type="button" variant="outline">
					<RotateCcw data-icon="inline-start" aria-hidden="true" />
					Retry session
				</Button>
			</section>
		);
	}
	if (game.saveState.status === "loading" || game.saveState.status === "idle") {
		return (
			<section
				aria-live="polite"
				className="flex min-h-32 items-center gap-3 border border-border bg-card/70 px-4"
			>
				<Loader2
					className="size-4 animate-spin text-primary"
					aria-hidden="true"
				/>
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
	if (game.saveState.status === "error") {
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
						{game.saveState.message}
					</p>
				</div>
				<Button
					onClick={game.retryLoad}
					size="sm"
					type="button"
					variant="outline"
				>
					<RotateCcw data-icon="inline-start" aria-hidden="true" />
					Retry save read
				</Button>
			</section>
		);
	}
	return (
		<section className="border border-border bg-card/70 px-4 py-5">
			<div className="flex items-center gap-2">
				<Settings2 className="size-4 text-primary" aria-hidden="true" />
				<h2 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.12em]">
					No active run
				</h2>
			</div>
			<p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6">
				Start or resume a run from the command center before entering a game
				module.
			</p>
			<Link
				className="mt-4 inline-flex min-h-11 items-center gap-2 border border-primary bg-primary px-3 py-2 font-mono font-semibold text-primary-foreground text-xs uppercase tracking-[0.1em]"
				to="/"
			>
				<ArrowRight className="size-3.5" aria-hidden="true" />
				Open command center
			</Link>
		</section>
	);
}

function DecisionOverlay({
	decision,
	onClose,
	onResolve,
	state,
}: {
	decision: PendingDecision;
	onClose: () => void;
	onResolve: (choice: DecisionChoice) => Promise<boolean>;
	state: GameState;
}) {
	const modelName =
		decision.kind === "launch" || decision.kind === "evaluation"
			? (selectVisibleModels(state).find(
					(model) => model.id === decision.modelId,
				)?.name ?? decision.modelId)
			: undefined;

	async function resolve(choice: DecisionChoice) {
		const succeeded = await onResolve(choice);
		if (succeeded) onClose();
	}

	return (
		<Pane
			blocking={decision.blocking}
			description={`Queue reference: ${decision.id}`}
			onClose={onClose}
			title={decisionTitle(decision, modelName)}
		>
			{decision.kind === "incident" ? (
				<IncidentCard
					decisionId={decision.id}
					disabled={false}
					onResolveDecision={(choice) => void resolve(choice)}
					state={state}
				/>
			) : decision.kind === "launch" ? (
				<LaunchDecision
					decision={decision}
					disabled={false}
					modelName={modelName ?? decision.modelId}
					onResolve={(choice) => void resolve(choice)}
				/>
			) : decision.kind === "evaluation" ? (
				<EvaluationDecision
					decision={decision}
					disabled={false}
					modelName={modelName ?? decision.modelId}
					onResolve={(choice) => void resolve(choice)}
				/>
			) : (
				<FundingDecision
					decision={decision}
					disabled={false}
					onResolve={(choice) => void resolve(choice)}
				/>
			)}
		</Pane>
	);
}

function EvaluationDecision({
	decision,
	disabled,
	modelName,
	onResolve,
}: {
	decision: Extract<PendingDecision, { kind: "evaluation" }>;
	disabled: boolean;
	modelName: string;
	onResolve: (choice: DecisionChoice) => void;
}) {
	return (
		<section aria-label="Evaluation decision" className="space-y-4">
			<div className="flex items-start gap-2">
				<Activity
					className="mt-0.5 size-4 text-[var(--game-amber)]"
					aria-hidden="true"
				/>
				<div>
					<p className="font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.14em]">
						Evaluation decision required
					</p>
					<h3 className="mt-1 font-medium text-foreground text-sm">
						{modelName}
					</h3>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						Choose the evaluation path to narrow the model's public uncertainty
						band. The choice is recorded against the exact engine decision.
					</p>
				</div>
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				<DecisionChoiceButton
					disabled={disabled}
					label="Capability evaluation"
					onClick={() =>
						onResolve({
							kind: "evaluate",
							decisionId: decision.id,
							evaluation: "capability",
						})
					}
				/>
				<DecisionChoiceButton
					disabled={disabled}
					label="Safety / reliability evaluation"
					onClick={() =>
						onResolve({
							kind: "evaluate",
							decisionId: decision.id,
							evaluation: "safety_reliability",
						})
					}
				/>
			</div>
		</section>
	);
}

function FundingDecision({
	decision,
	disabled,
	onResolve,
}: {
	decision: Extract<PendingDecision, { kind: "funding" }>;
	disabled: boolean;
	onResolve: (choice: DecisionChoice) => void;
}) {
	const label = decision.round === "series_a" ? "Series A" : "Seed";
	return (
		<section aria-label="Funding decision" className="space-y-4">
			<div className="flex items-start gap-2">
				<BriefcaseBusiness
					className="mt-0.5 size-4 text-primary"
					aria-hidden="true"
				/>
				<div>
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.14em]">
						Funding offer
					</p>
					<h3 className="mt-1 font-medium text-foreground text-sm">{label}</h3>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						This offer is non-blocking. Accepting adds the round's grant;
						declining keeps the run self-funded.
					</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<DecisionChoiceButton
					disabled={disabled}
					label={`Accept ${label}`}
					onClick={() =>
						onResolve({
							kind: "funding",
							decisionId: decision.id,
							round: decision.round as FundingRound,
							accept: true,
						})
					}
				/>
				<DecisionChoiceButton
					disabled={disabled}
					label="Decline offer"
					onClick={() =>
						onResolve({
							kind: "funding",
							decisionId: decision.id,
							round: decision.round as FundingRound,
							accept: false,
						})
					}
				/>
			</div>
		</section>
	);
}

function DecisionChoiceButton({
	disabled,
	label,
	onClick,
}: {
	disabled: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			disabled={disabled}
			onClick={onClick}
			size="sm"
			type="button"
			variant="outline"
		>
			{label}
		</Button>
	);
}

function decisionTitle(
	decision: PendingDecision,
	modelName: string | undefined,
): string {
	switch (decision.kind) {
		case "incident":
			return `Incident / ${humanize(decision.incident)}`;
		case "launch":
			return `Launch / ${modelName ?? decision.modelId}`;
		case "evaluation":
			return `Evaluation / ${modelName ?? decision.modelId}`;
		case "funding":
			return `Funding / ${decision.round === "series_a" ? "Series A" : "Seed"}`;
	}
}

function validateGameSearch(search: Record<string, unknown>): GameSearch {
	return {
		decision: typeof search.decision === "string" ? search.decision : undefined,
		node: typeof search.node === "string" ? search.node : undefined,
		debug: search.debug === "1" ? "1" : undefined,
		quarter: parseBoundedInteger(search.quarter, 1, 6),
		rivalProgress: parseBoundedInteger(search.rivalProgress, 0, 100),
		quarterly: search.quarterly === "1" ? "1" : undefined,
		pulse: search.pulse === "1" ? "1" : undefined,
		chronicle: search.chronicle === "1" ? "1" : undefined,
	};
}

function parseBoundedInteger(
	value: unknown,
	minimum: number,
	maximum: number,
): number | undefined {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim().length > 0
				? Number(value)
				: Number.NaN;
	if (!Number.isInteger(parsed)) return undefined;
	return Math.min(maximum, Math.max(minimum, parsed));
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
