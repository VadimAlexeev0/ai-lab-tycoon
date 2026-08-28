import type { GameState } from "@ai-lab-tycoon/engine";
import {
	type DecisionChoice,
	type FundingRound,
	type PendingDecision,
	selectPendingDecisions,
	selectVisibleModels,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import {
	Activity,
	AlertCircle,
	ArrowRight,
	BriefcaseBusiness,
	Loader2,
	RotateCcw,
	Settings2,
	X,
} from "lucide-react";
import { useEffect } from "react";

import DebugDrawer from "@/game/components/debug-drawer";
import GameRail from "@/game/components/game-rail";
import IncidentCard from "@/game/components/incident-card";
import LaunchDecision from "@/game/components/launch-decision";
import NewsTicker from "@/game/components/news-ticker";
import Pane from "@/game/components/pane";
import { useWeekDigest } from "@/game/derived/use-week-digest";
import { summarizeWeekDigest } from "@/game/derived/week-digest";
import { GameStateProvider, useRunState } from "@/game/game-state-context";

export type GameSearch = {
	decision?: string;
	node?: string;
	debug?: "1";
	quarter?: number;
	rivalProgress?: number;
	quarterly?: "1";
	pulse?: "1";
	chronicle?: "1";
	lineage?: "1";
	notebook?: "1";
	agiOverride?: number;
};

export const Route = createFileRoute("/game")({
	head: () => ({
		meta: [
			{ title: "Operations · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Manage a deterministic AI startup run, its resources, decisions, and route-by-route operations console.",
			},
		],
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
	const game = useRunState();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const pathname = useLocation().pathname;
	const state = game.state;
	const pendingDecisions = state === null ? [] : selectPendingDecisions(state);
	const blockingDecision = pendingDecisions.find(
		(decision) => decision.blocking,
	);
	const selectedDecision = pendingDecisions.find(
		(decision) => decision.id === search.decision,
	);
	const isActive = game.activeRun !== null && game.screen === "active";
	const { digest, deltas } = useWeekDigest(state, game.revision);
	const liveAnnouncement = isActive ? summarizeWeekDigest(digest, deltas) : "";

	// Route-change focus handoff: after SPA navigation between game pages,
	// move focus to the page heading so keyboard/AT users start at the top.
	const headingId = "game-page-heading";
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname intentionally retriggers focus after SPA navigation
	useEffect(() => {
		if (!isActive) return;
		const heading = document.getElementById(headingId);
		if (heading instanceof HTMLElement) {
			heading.focus({ preventScroll: true });
		}
	}, [isActive, pathname]);

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

	return (
		<div className="lab-void relative grid h-dvh min-h-0 min-w-0 grid-cols-[4rem_minmax(0,1fr)] overflow-hidden lg:grid-cols-[14rem_minmax(0,1fr)]">
			<GameRail />
			<main
				id="main-content"
				tabIndex={-1}
				className="game-shell h-full min-h-0 min-w-0 overflow-y-auto overflow-x-clip bg-background"
			>
				<div
					aria-atomic="true"
					aria-live="polite"
					className="sr-only"
					role="status"
				>
					{isActive ? liveAnnouncement : ""}
				</div>
				<div className="ailt-scroll-content mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-6 px-4 py-4 pb-8 sm:px-6 sm:py-5 lg:px-8 lg:py-7">
					{isActive && state !== null ? (
						<>
							<ActionFeedback
								actionError={game.actionError}
								conflictRecord={game.conflictRecord}
								onAdopt={game.adoptConflictRecord}
								onDismiss={game.clearActionError}
							/>
							{state.terminal.status === "lost" ? (
								<div
									aria-live="assertive"
									className="glass-pane flex flex-wrap items-center justify-between gap-3 bg-[var(--game-negative)]/10 px-4 py-3 ring-1 ring-[var(--game-negative)]/50"
									role="alert"
									tabIndex={-1}
								>
									<div className="min-w-0">
										<p className="font-semibold text-foreground text-sm">
											The sandbox has ended — this run is over.
										</p>
										<p className="mt-1 text-muted-foreground text-xs leading-5">
											Review the run result on the Products page, then start a
											new run to try a different strategy.
										</p>
									</div>
									<button
										className="shrink-0 rounded-md border border-[var(--game-negative)] px-3 py-2 text-xs hover:bg-[var(--game-negative)]/20"
										onClick={() => {
											void navigate({ to: "/game/products" });
										}}
										type="button"
									>
										View run result
									</button>
								</div>
							) : null}
							<Outlet />
						</>
					) : (
						<GameRouteState />
					)}
				</div>
			</main>
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
				onForceLineage={() => {
					void navigate({
						to: "/game/lineage",
						search: (current) => ({
							...current,
							chronicle: undefined,
							lineage: "1",
							quarterly: undefined,
							pulse: undefined,
						}),
					});
				}}
				onForceNotebook={() => {
					void navigate({
						to: "/game/notebook",
						search: (current) => ({
							...current,
							chronicle: undefined,
							lineage: undefined,
							notebook: "1",
							quarterly: undefined,
							pulse: undefined,
						}),
					});
				}}
				onForceAgiProgram={() => {
					void navigate({
						to: "/game/agiprogram",
						search: (current) => ({
							...current,
							agiOverride: current.agiOverride ?? 0,
							chronicle: undefined,
							lineage: undefined,
							notebook: undefined,
							quarterly: undefined,
							pulse: undefined,
						}),
					});
				}}
				agiOverride={search.agiOverride ?? 0}
				onAgiOverrideChange={(agiOverride) => {
					void navigate({
						to: "/game/agiprogram",
						search: (current) => ({
							...current,
							agiOverride,
							chronicle: undefined,
							lineage: undefined,
							notebook: undefined,
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

function ActionFeedback({
	actionError,
	conflictRecord,
	onAdopt,
	onDismiss,
}: {
	actionError: string | null;
	conflictRecord: ReturnType<typeof useRunState>["conflictRecord"];
	onAdopt: (
		record: NonNullable<ReturnType<typeof useRunState>["conflictRecord"]>,
	) => void;
	onDismiss: () => void;
}) {
	if (actionError === null) return null;
	return (
		<div
			className="glass-pane flex flex-wrap items-start gap-2 bg-[var(--game-negative)]/10 px-3 py-2 text-[var(--game-negative)] text-xs leading-5 ring-1 ring-[var(--game-negative)]/50"
			role="alert"
		>
			<AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1">{actionError}</span>
			{conflictRecord !== null ? (
				<button
					className="shrink-0 border border-[var(--game-negative)] px-2 py-1 text-xs hover:bg-[var(--game-negative)]/20"
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
	const game = useRunState();
	if (game.session.status === "loading") {
		return (
			<section
				aria-live="polite"
				className="glass-pane flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center"
			>
				<Loader2
					className="size-5 animate-spin text-primary"
					aria-hidden="true"
				/>
				<h2 className="font-semibold text-foreground text-sm">
					Establishing anonymous session
				</h2>
			</section>
		);
	}
	if (game.session.status === "error") {
		return (
			<section
				role="alert"
				className="glass-pane flex min-h-48 flex-col items-center justify-center gap-4 bg-[var(--game-negative)]/10 px-6 text-center ring-1 ring-[var(--game-negative)]/60"
			>
				<AlertCircle
					className="size-5 text-[var(--game-negative)]"
					aria-hidden="true"
				/>
				<h2 className="font-semibold text-foreground text-sm">
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
				className="glass-pane flex min-h-32 items-center gap-3 px-4"
			>
				<Loader2
					className="size-4 animate-spin text-primary"
					aria-hidden="true"
				/>
				<div>
					<h2 className="font-semibold text-foreground text-sm">
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
				className="glass-pane flex min-h-32 flex-col items-start gap-3 bg-[var(--game-negative)]/10 px-4 py-4 ring-1 ring-[var(--game-negative)]/60 sm:flex-row sm:items-center"
			>
				<AlertCircle
					className="size-5 shrink-0 text-[var(--game-negative)]"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<h2 className="font-semibold text-foreground text-sm">
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
		<section className="glass-pane px-4 py-5">
			<div className="flex items-center gap-2">
				<Settings2 className="size-4 text-primary" aria-hidden="true" />
				<h2 className="font-semibold text-foreground text-sm">No active run</h2>
			</div>
			<p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6">
				Start or resume a run from the command center before entering a game
				module.
			</p>
			<Link
				className="mt-4 inline-flex min-h-11 items-center gap-2 border border-primary bg-primary px-3 py-2 font-semibold text-primary-foreground text-xs"
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
					<p className="font-semibold text-[var(--game-amber)] text-xs">
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
					<p className="font-semibold text-primary text-xs">Funding offer</p>
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
		lineage: search.lineage === "1" ? "1" : undefined,
		notebook: search.notebook === "1" ? "1" : undefined,
		agiOverride: parseBoundedInteger(search.agiOverride, 0, 6),
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
