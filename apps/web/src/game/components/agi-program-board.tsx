import type { GameState } from "@ai-lab-tycoon/engine";
import { Check, LockKeyhole, Sparkles } from "lucide-react";
import ArtFrame from "@/game/components/art-frame";

import {
	AGI_PROGRAM_SLOT_COUNT,
	type AgiProgramSlot,
	buildAgiProgramSlots,
} from "./agi-program-data";

export type AgiProgramBoardProps = {
	state: GameState;
	overrideSockets?: number;
};

const SOCKET_POSITIONS = [
	"left-[14%] top-[31%]",
	"left-[34%] top-[19%]",
	"left-[66%] top-[19%]",
	"left-[86%] top-[31%]",
	"left-[34%] top-[67%]",
	"left-[66%] top-[67%]",
] as const;

export default function AgiProgramBoard({
	overrideSockets = 0,
	state,
}: AgiProgramBoardProps) {
	const slots = buildAgiProgramSlots(state);
	const safeOverride = clamp(
		Math.floor(overrideSockets),
		0,
		AGI_PROGRAM_SLOT_COUNT,
	);
	const actualCompleteCount = slots.filter((slot) => slot.complete).length;

	return (
		<section aria-labelledby="agi-program-board-heading" className="space-y-5">
			<header className="flex flex-col gap-3 border-border/70 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="max-w-3xl">
					<div className="flex items-center gap-2 font-mono font-semibold text-[var(--game-cyan)] text-xs uppercase tracking-[0.18em]">
						<Sparkles className="size-4" aria-hidden="true" />
						<span>Endgame assembly / Eras IV–VI</span>
					</div>
					<h2
						className="mt-1 font-mono font-semibold text-2xl text-foreground uppercase tracking-tight sm:text-3xl"
						id="agi-program-board-heading"
					>
						AGI Program Vault
					</h2>
					<p className="mt-2 text-muted-foreground text-sm leading-6">
						A dramatic placeholder board for the program assembled across the
						late eras. Sockets light only from the mapped engine evidence below;
						future requirements remain visibly locked.
					</p>
				</div>
				<div className="shrink-0 border border-[var(--game-cyan)]/40 bg-[var(--game-cyan)]/5 px-3 py-2 font-mono text-xs uppercase tracking-[0.1em]">
					<p className="text-[var(--game-cyan)]">Engine evidence</p>
					<p className="mt-1 font-semibold text-foreground">
						{actualCompleteCount}/{AGI_PROGRAM_SLOT_COUNT} sockets lit
					</p>
				</div>
			</header>

			{safeOverride > 0 ? (
				<p className="border border-[var(--game-amber)]/40 border-dashed bg-[var(--game-amber)]/5 px-3 py-2 text-[var(--game-amber)] text-xs leading-5">
					Debug preview: {safeOverride} socket{safeOverride === 1 ? "" : "s"}{" "}
					opened visually. The engine evidence count above is unchanged.
				</p>
			) : null}

			<div className="relative isolate min-h-[40rem] overflow-hidden border border-[var(--game-cyan)]/45 bg-[var(--game-navy)] shadow-[0_24px_80px_rgba(0,0,0,0.4)] sm:min-h-[45rem]">
				<ArtFrame
					alt="Monumental vault door with six sockets for the AGI program"
					className="absolute inset-0 h-full w-full rounded-none ring-0"
					src="/art/agi-vault-door.png"
					tint="bg-[var(--game-navy)]/20"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--game-navy)]/75 via-transparent to-[var(--game-navy)]/85"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,var(--game-navy)_100%)] opacity-75"
				/>

				<div className="relative min-h-[40rem] sm:min-h-[45rem]">
					<div className="absolute inset-x-4 top-5 text-center sm:top-7">
						<p className="font-mono font-semibold text-[var(--game-cyan)] text-xs uppercase tracking-[0.2em]">
							Vault access / preview chamber
						</p>
						<p className="mt-1 font-serif text-foreground/80 text-sm italic">
							Six pieces. Three future eras. One unfinished door.
						</p>
					</div>
					{slots.map((slot, index) => (
						<SocketSlot
							debugOverride={index < safeOverride && !slot.complete}
							key={slot.id}
							position={SOCKET_POSITIONS[index] ?? SOCKET_POSITIONS[0]}
							slot={slot}
						/>
					))}
					<div className="absolute inset-x-4 bottom-5 text-center sm:bottom-7">
						<p className="font-mono text-foreground/75 text-xs uppercase tracking-[0.1em]">
							Mapped V1 evidence is advisory; this vault has no engine effect.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function SocketSlot({
	debugOverride,
	position,
	slot,
}: {
	debugOverride: boolean;
	position: string;
	slot: AgiProgramSlot;
}) {
	const active = slot.complete || debugOverride;
	return (
		<div
			aria-label={`${slot.label}: ${slot.complete ? "complete" : slot.requirement}`}
			className={`absolute flex w-32 -translate-x-1/2 flex-col items-center text-center sm:w-44 ${position}`}
			data-complete={slot.complete}
			data-debug-override={debugOverride}
			role="status"
		>
			<div
				className={`relative flex size-14 items-center justify-center rounded-full border-2 backdrop-blur-sm sm:size-16 ${
					active
						? "border-[var(--game-cyan)] bg-[var(--game-cyan)]/25 text-[var(--game-cyan)] shadow-[0_0_28px_color-mix(in_srgb,var(--game-cyan)_70%,transparent)] motion-safe:animate-pulse"
						: "border-slate-300/25 bg-slate-950/60 text-slate-300/55"
				}`}
			>
				{active ? (
					<Check className="size-6" aria-hidden="true" />
				) : (
					<LockKeyhole className="size-5" aria-hidden="true" />
				)}
				<span className="absolute -bottom-2 border border-current bg-[var(--game-navy)] px-1.5 py-0.5 font-mono text-xs uppercase tracking-[0.08em]">
					{slot.id.slice(0, 2)}
				</span>
			</div>
			<div
				className={`mt-3 border px-2 py-2 backdrop-blur-md ${
					active
						? "border-[var(--game-cyan)]/55 bg-[var(--game-navy)]/80"
						: "border-slate-300/25 bg-slate-950/75"
				}`}
			>
				<p className="font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
					{slot.label}
				</p>
				<p className="mt-1 text-foreground/70 text-xs leading-5">
					{debugOverride
						? "Debug preview override"
						: slot.complete
							? slot.concept
							: slot.requirement}
				</p>
				{slot.complete && slot.evidence !== null ? (
					<p className="mt-1 font-mono text-[var(--game-cyan)] text-xs uppercase tracking-[0.06em]">
						Evidence: {slot.evidence}
					</p>
				) : null}
			</div>
		</div>
	);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
