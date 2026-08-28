import { Button } from "@ai-lab-tycoon/ui/components/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import ArtFrame from "@/game/components/art-frame";
import StartRunForm from "@/game/components/start-run-form";
import {
	type ActiveRunSnapshot,
	GameStateProvider,
	useRunState,
} from "@/game/game-state-context";
import type { ActiveRunRecord } from "@/utils/orpc";

export const Route = createFileRoute("/play")({
	head: () => ({
		meta: [
			{ title: "Play AI Startup Lab Tycoon · Start a run" },
			{
				name: "description",
				content:
					"Start a deterministic AI startup run or resume the anonymous autosave from the command floor.",
			},
		],
	}),
	component: HomeComponent,
});

function HomeComponent() {
	return (
		<GameStateProvider>
			<StartScreen />
		</GameStateProvider>
	);
}

function StartScreen() {
	const game = useRunState();
	const navigate = useNavigate();
	const isDeleting = game.saveState.status === "deleting";

	async function enterGame() {
		await navigate({ to: "/game" });
	}

	async function handleStarted(result: ActiveRunSnapshot) {
		game.handleStarted(result);
		await enterGame();
	}

	function resumeRun() {
		game.resumeRun();
		void enterGame();
	}

	if (game.session.status === "loading") return <SessionLoadingState />;
	if (game.session.status === "error") {
		return (
			<SessionErrorState
				error={game.session.message}
				onRetry={game.retrySession}
			/>
		);
	}
	if (game.saveState.status === "idle" || game.saveState.status === "loading") {
		return <SaveLoadingState />;
	}
	if (game.saveState.status === "error") {
		return (
			<SaveErrorState
				message={game.saveState.message}
				onRetry={game.retryLoad}
			/>
		);
	}

	return (
		<SelectionScreen>
			{game.screen === "selection" && game.savedRun !== null ? (
				<ResumeRunState
					disabled={isDeleting}
					onDelete={() => void game.deleteRun()}
					onNewRun={game.chooseNewRun}
					onResume={resumeRun}
					run={game.savedRun}
				/>
			) : game.screen === "new" ? (
				<StartRunForm
					hasExistingRun={game.savedRun !== null}
					onStarted={handleStarted}
				/>
			) : (
				<StartRunForm hasExistingRun={false} onStarted={handleStarted} />
			)}
		</SelectionScreen>
	);
}

function SelectionScreen({ children }: { children: ReactNode }) {
	return (
		<section
			aria-labelledby="run-selection-heading"
			className="surface-card relative isolate overflow-hidden p-4 sm:p-5"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-2 z-0 hidden sm:inset-3 dark:block"
			>
				<ArtFrame
					alt=""
					className="h-full w-full rounded-xl ring-white/10"
					loading="eager"
					src="/art-v2/hero-single-monolith.png"
					tint="bg-background/20"
				/>
			</div>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-2 z-0 sm:inset-3 dark:hidden"
			>
				<ArtFrame
					alt=""
					className="h-full w-full rounded-xl ring-white/10"
					src="/art-v2/fog-monolith-alt.png"
					tint="bg-background/10"
				/>
			</div>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/65 to-transparent"
			/>
			<div className="relative z-10 space-y-5">
				<div className="max-w-2xl">
					<p className="meta-label text-primary">
						Command center / run selection
					</p>
					<h1
						id="run-selection-heading"
						className="mt-2 font-display font-semibold text-3xl text-foreground sm:text-4xl"
					>
						Build the next AI lab
					</h1>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6">
						Enter the lab, resume an autosave, or initialize a deterministic
						sandbox from the command floor.
					</p>
				</div>
				{children}
			</div>
		</section>
	);
}

function ResumeRunState({
	disabled,
	onDelete,
	onNewRun,
	onResume,
	run,
}: {
	disabled: boolean;
	onDelete: () => void;
	onNewRun: () => void;
	onResume: () => void;
	run: ActiveRunRecord;
}) {
	return (
		<section
			aria-labelledby="resume-run-heading"
			className="surface-card bg-primary/5 p-4 ring-1 ring-primary/40 sm:p-5"
		>
			<div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="font-semibold text-[10px] text-primary">
						Saved run found
					</p>
					<h2
						id="resume-run-heading"
						className="mt-2 font-semibold text-base text-foreground"
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
			<div className="mt-4 grid gap-2 border-border/70 border-y py-3 text-[10px] text-muted-foreground sm:grid-cols-3">
				<span>Week {run.currentWeek}</span>
				<span>Seed {run.seed}</span>
				<span>Revision {run.revision}</span>
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<Button disabled={disabled} onClick={onResume} type="button">
					<Play data-icon="inline-start" aria-hidden="true" />
					Resume run
				</Button>
				<Button
					disabled={disabled}
					onClick={onNewRun}
					type="button"
					variant="outline"
				>
					Start new run
				</Button>
				<Button
					disabled={disabled}
					onClick={onDelete}
					type="button"
					variant="destructive"
				>
					<Trash2 data-icon="inline-start" aria-hidden="true" />
					{disabled ? "Deleting…" : "Delete run"}
				</Button>
			</div>
		</section>
	);
}

function SessionLoadingState() {
	return (
		<section
			aria-live="polite"
			className="surface-card flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center"
		>
			<Save className="size-5 animate-pulse text-primary" aria-hidden="true" />
			<div>
				<h2 className="font-semibold text-foreground text-sm">
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
	error: string;
	onRetry: () => void;
}) {
	return (
		<section
			role="alert"
			className="surface-card flex min-h-48 flex-col items-center justify-center gap-4 bg-[var(--game-negative)]/10 px-6 text-center ring-1 ring-[var(--game-negative)]/60"
		>
			<AlertCircle
				className="size-5 text-[var(--game-negative)]"
				aria-hidden="true"
			/>
			<div>
				<h2 className="font-semibold text-foreground text-sm">
					Session unavailable
				</h2>
				<p className="mt-1 max-w-lg text-muted-foreground text-sm leading-6">
					{error}
				</p>
			</div>
			<Button type="button" variant="outline" onClick={onRetry}>
				<RotateCcw data-icon="inline-start" aria-hidden="true" />
				Retry session
			</Button>
		</section>
	);
}

function SaveLoadingState() {
	return (
		<section
			aria-live="polite"
			className="surface-card flex min-h-32 items-center gap-3 px-4"
		>
			<Save className="size-4 animate-pulse text-primary" aria-hidden="true" />
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
			className="surface-card flex min-h-32 flex-col items-start gap-3 bg-[var(--game-negative)]/10 px-4 py-4 ring-1 ring-[var(--game-negative)]/60 sm:flex-row sm:items-center"
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
					{message}
				</p>
			</div>
			<Button onClick={onRetry} size="sm" type="button" variant="outline">
				<RotateCcw data-icon="inline-start" aria-hidden="true" />
				Retry save read
			</Button>
		</section>
	);
}
