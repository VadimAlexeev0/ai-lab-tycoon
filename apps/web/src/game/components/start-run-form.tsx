import { type GameState, type RunSetup, startRun } from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Input } from "@ai-lab-tycoon/ui/components/input";
import { Label } from "@ai-lab-tycoon/ui/components/label";
import { Loader2, Play, Shuffle } from "lucide-react";
import { useState } from "react";
import { type ActiveRunRecord, persistActiveRun } from "@/utils/orpc";

export type StartRunFormProps = {
	onStarted: (result: {
		state: GameState;
		record: ActiveRunRecord;
	}) => void | Promise<void>;
	hasExistingRun?: boolean;
};

const MAX_UNSIGNED_SEED = 4_294_967_295;

export default function StartRunForm({
	onStarted,
	hasExistingRun = false,
}: StartRunFormProps) {
	const [companyName, setCompanyName] = useState("");
	const [seedInput, setSeedInput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		if (
			hasExistingRun &&
			!window.confirm(
				"Start a new run? This replaces your current saved run and cannot be undone.",
			)
		) {
			return;
		}

		const setup: RunSetup = { companyName: companyName.trim() };
		const seedResult = parseSeed(seedInput);
		if (typeof seedResult === "string") {
			setError(seedResult);
			return;
		}

		setIsStarting(true);
		try {
			// Calling the engine command here keeps web validation identical to the
			// persisted command semantics instead of maintaining a second schema.
			const state = startRun(setup, seedResult);
			const record = await persistActiveRun(state);
			await onStarted({ state, record });
		} catch (cause: unknown) {
			setError(toErrorMessage(cause, "The new run could not be saved."));
		} finally {
			setIsStarting(false);
		}
	}

	return (
		<section
			aria-labelledby="new-run-heading"
			className="border border-primary/40 bg-primary/5 p-4 sm:p-5"
		>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Run initialization
					</p>
					<h2
						id="new-run-heading"
						className="mt-2 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
					>
						Start a new company
					</h2>
					<p className="mt-1 max-w-xl text-muted-foreground text-sm leading-6">
						Name your lab and choose a reproducible seed. Leave the seed blank
						to generate one automatically.
					</p>
				</div>
				<Shuffle
					className="hidden size-5 text-primary/70 sm:block"
					aria-hidden="true"
				/>
			</div>

			<form className="mt-5 space-y-4" onSubmit={handleSubmit}>
				<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
					<div className="space-y-2">
						<Label htmlFor="company-name">
							Company name{" "}
							<span className="text-[var(--game-negative)]">*</span>
						</Label>
						<Input
							autoComplete="organization"
							disabled={isStarting}
							id="company-name"
							maxLength={80}
							name="companyName"
							onChange={(event) => setCompanyName(event.target.value)}
							placeholder="e.g. Northstar Labs"
							required
							value={companyName}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="run-seed">Seed (optional)</Label>
						<Input
							disabled={isStarting}
							id="run-seed"
							inputMode="numeric"
							max={MAX_UNSIGNED_SEED}
							min={0}
							name="seed"
							onChange={(event) => setSeedInput(event.target.value)}
							placeholder="Auto"
							type="number"
							value={seedInput}
						/>
					</div>
				</div>

				{hasExistingRun ? (
					<p className="border border-[var(--game-amber)]/50 bg-[var(--game-amber)]/10 px-3 py-2 text-[var(--game-amber)] text-xs leading-5">
						A saved run already exists. Starting here will replace it after
						confirmation.
					</p>
				) : null}

				{error ? (
					<p
						role="alert"
						className="text-[var(--game-negative)] text-xs leading-5"
					>
						{error}
					</p>
				) : null}

				<Button disabled={isStarting} size="lg" type="submit">
					{isStarting ? (
						<Loader2
							data-icon="inline-start"
							className="animate-spin"
							aria-hidden="true"
						/>
					) : (
						<Play data-icon="inline-start" aria-hidden="true" />
					)}
					{isStarting ? "Initializing run…" : "Start run"}
				</Button>
			</form>
		</section>
	);
}

function parseSeed(input: string): number | string {
	const value = input.trim();
	if (value.length === 0) return createSeed();

	const seed = Number(value);
	if (
		!Number.isInteger(seed) ||
		!Number.isSafeInteger(seed) ||
		seed < 0 ||
		seed > MAX_UNSIGNED_SEED ||
		Object.is(seed, -0)
	) {
		return "Seed must be a non-negative integer from 0 to 4,294,967,295.";
	}
	return seed;
}

function createSeed(): number {
	const cryptoObject = globalThis.crypto;
	if (cryptoObject !== undefined) {
		const values = new Uint32Array(1);
		cryptoObject.getRandomValues(values);
		return values[0] ?? 0;
	}
	return Math.floor(Math.random() * (MAX_UNSIGNED_SEED + 1));
}

function toErrorMessage(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message.length > 0
		? cause.message
		: fallback;
}
