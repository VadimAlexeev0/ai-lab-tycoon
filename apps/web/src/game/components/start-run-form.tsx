import { type GameState, type RunSetup, startRun } from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ai-lab-tycoon/ui/components/dialog";
import { Input } from "@ai-lab-tycoon/ui/components/input";
import { Label } from "@ai-lab-tycoon/ui/components/label";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
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

const FOUNDER_ARCHETYPES = [
	{
		id: "purist",
		label: "The Purist",
		src: "/art/founder-purist.png",
	},
	{
		id: "hype",
		label: "The Hype Builder",
		src: "/art/founder-hype.png",
	},
	{
		id: "infra",
		label: "The Infrastructure Lead",
		src: "/art/founder-infra.png",
	},
	{
		id: "enterprise",
		label: "The Enterprise Operator",
		src: "/art/founder-enterprise.png",
	},
	{
		id: "safety",
		label: "The Safety Steward",
		src: "/art/founder-safety.png",
	},
	{
		id: "opensource",
		label: "The Open Source Builder",
		src: "/art/founder-opensource.png",
	},
] as const;

export default function StartRunForm({
	onStarted,
	hasExistingRun = false,
}: StartRunFormProps) {
	const [companyName, setCompanyName] = useState("");
	const [seedInput, setSeedInput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [selectedFounder, setSelectedFounder] = useState<
		(typeof FOUNDER_ARCHETYPES)[number]["id"] | null
	>(null);
	const [pendingStart, setPendingStart] = useState<{
		setup: RunSetup;
		seed: number;
	} | null>(null);
	const [confirmNewRunOpen, setConfirmNewRunOpen] = useState(false);

	async function startRunNow(setup: RunSetup, seed: number, replace = false) {
		setIsStarting(true);
		try {
			// Calling the engine command here keeps web validation identical to the
			// persisted command semantics instead of maintaining a second schema.
			const state = startRun(setup, seed);
			const record = await persistActiveRun(state, undefined, replace);
			await onStarted({ state, record });
		} catch (cause: unknown) {
			setError(toErrorMessage(cause, "The new run could not be saved."));
		} finally {
			setIsStarting(false);
		}
	}

	async function confirmNewRun() {
		if (pendingStart === null) return;
		setConfirmNewRunOpen(false);
		await startRunNow(pendingStart.setup, pendingStart.seed, true);
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const setup: RunSetup = { companyName: companyName.trim() };
		const seedResult = parseSeed(seedInput);
		if (typeof seedResult === "string") {
			setError(seedResult);
			return;
		}

		if (hasExistingRun) {
			setPendingStart({ setup, seed: seedResult });
			setConfirmNewRunOpen(true);
			return;
		}

		await startRunNow(setup, seedResult);
	}

	return (
		<section
			aria-labelledby="new-run-heading"
			className="pane-section rounded-lg bg-primary/5 ring-1 ring-primary/40 sm:p-5"
		>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="font-semibold text-primary text-xs">
						Run initialization
					</p>
					<h2
						id="new-run-heading"
						className="mt-2 font-semibold text-foreground text-sm"
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

				<fieldset className="space-y-2">
					<legend className="font-semibold text-muted-foreground text-xs">
						Founder archetype{" "}
						<span className="font-normal text-primary/80">(cosmetic)</span>
					</legend>
					<div className="flex gap-2 overflow-x-auto pb-1">
						{FOUNDER_ARCHETYPES.map((founder) => (
							<button
								aria-label={`Select ${founder.label}`}
								aria-pressed={selectedFounder === founder.id}
								className={cn(
									"size-12 shrink-0 rounded-full border border-cyan-300/60 bg-background/70 p-0.5 shadow-[0_0_14px_rgba(34,211,238,0.16)] transition-transform duration-150 hover:scale-105",
									selectedFounder === founder.id
										? "scale-105 shadow-[0_0_18px_rgba(34,211,238,0.38)] ring-2 ring-cyan-300"
										: "ring-1 ring-cyan-300/35",
								)}
								disabled={isStarting}
								onClick={() => setSelectedFounder(founder.id)}
								type="button"
							>
								<img
									alt={`Founder archetype: ${founder.label}`}
									className="size-full rounded-full object-cover"
									decoding="async"
									loading="lazy"
									src={founder.src}
								/>
								<span className="sr-only">{founder.label}</span>
							</button>
						))}
					</div>
					<p className="text-muted-foreground text-xs">
						Flavor only · does not affect the simulation.
					</p>
				</fieldset>

				{hasExistingRun ? (
					<p className="pane-section rounded-lg bg-[var(--game-amber)]/10 px-3 py-2 text-[var(--game-amber)] text-xs leading-5 ring-1 ring-[var(--game-amber)]/50">
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

			<Dialog onOpenChange={setConfirmNewRunOpen} open={confirmNewRunOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Replace the saved run?</DialogTitle>
						<DialogDescription>
							Starting a new run permanently replaces the current anonymous
							autosave. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose render={<Button type="button" variant="outline" />}>
							Cancel
						</DialogClose>
						<Button
							disabled={isStarting}
							onClick={() => void confirmNewRun()}
							type="button"
						>
							Replace and start
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
