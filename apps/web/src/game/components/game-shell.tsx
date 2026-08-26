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

export type SessionStatus = "loading" | "ready" | "error";

export type DashboardPanel =
	| "overview"
	| "teams"
	| "research"
	| "models"
	| "products";

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
};

type PanelDefinition = {
	id: DashboardPanel;
	index: string;
	label: string;
	description: string;
	status: string;
};

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
}: GameShellProps) {
	const [activePanel, setActivePanel] = useState<DashboardPanel>("overview");
	const isReady = sessionStatus === "ready";

	useEffect(() => {
		if (blockingDecisionId === null) return;

		const target = document.getElementById(
			`decision-card-${blockingDecisionId}`,
		);
		target?.focus({ preventScroll: true });
	}, [blockingDecisionId]);

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
						<DashboardPanels
							activePanel={activePanel}
							onSelectPanel={setActivePanel}
						/>
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
	activePanel,
	onSelectPanel,
}: {
	activePanel: DashboardPanel;
	onSelectPanel: (panel: DashboardPanel) => void;
}) {
	const activeDefinition =
		PANELS.find((panel) => panel.id === activePanel) ?? PANELS[0];

	return (
		<section aria-label="Operations modules" className="min-h-0">
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
							"flex min-h-9 shrink-0 items-center gap-2 px-2.5 font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em] transition-colors",
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
					id={`mobile-panel-${activeDefinition.id}`}
					panel={activeDefinition}
					mobile
				/>
			</div>

			<div className="mt-3 hidden gap-3 lg:grid lg:grid-cols-12 lg:grid-rows-2">
				<PanelCard
					id="desktop-panel-overview"
					panel={PANELS[0]}
					className="lg:col-span-7 lg:row-span-2"
				/>
				<PanelCard
					id="desktop-panel-teams"
					panel={PANELS[1]}
					className="lg:col-span-5"
				/>
				<PanelCard
					id="desktop-panel-research"
					panel={PANELS[2]}
					className="lg:col-span-5"
				/>
				<PanelCard
					id="desktop-panel-models"
					panel={PANELS[3]}
					className="lg:col-span-6"
				/>
				<PanelCard
					id="desktop-panel-products"
					panel={PANELS[4]}
					className="lg:col-span-6"
				/>
			</div>
		</section>
	);
}

function PanelCard({
	id,
	panel,
	className,
	mobile = false,
}: {
	id: string;
	panel: PanelDefinition;
	className?: string;
	mobile?: boolean;
}) {
	return (
		<article
			id={id}
			className={cn(
				"group relative flex min-h-36 flex-col justify-between overflow-hidden border border-border bg-card p-4",
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
			<div className="space-y-3">
				<p className="max-w-md text-muted-foreground text-sm leading-6">
					{panel.description}
				</p>
				<div className="flex items-center gap-2 border-border/70 border-t pt-3 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
					<span
						className="size-1.5 rounded-full bg-muted-foreground/50"
						aria-hidden="true"
					/>
					Panel interface loads with the next module
				</div>
			</div>
		</article>
	);
}
