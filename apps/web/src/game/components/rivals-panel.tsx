import { type GameState, selectRivals } from "@ai-lab-tycoon/engine";
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from "@ai-lab-tycoon/ui/components/progress";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Eye, Gauge } from "lucide-react";

import { rivalDoctrineForId } from "@/game/rival-doctrine";

export type RivalsPanelProps = {
	state: GameState;
};

const RIVAL_ART = {
	research_lab: {
		alt: "Rival: research hacker",
		src: "/art/rival-hacker.png",
	},
	platform: {
		alt: "Rival: consumer-app mogul",
		src: "/art/rival-mogul.png",
	},
	efficiency: {
		alt: "Rival: enterprise operator",
		src: "/art/rival-enterprise.png",
	},
} as const;

const GAUGE_RADIUS = 24;
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

export function getGaugeStrokeOffset(
	progress: number,
	circumference = GAUGE_CIRCUMFERENCE,
): number {
	const boundedProgress = Number.isFinite(progress)
		? Math.min(100, Math.max(0, progress))
		: 0;
	return circumference * (1 - boundedProgress / 100);
}

/** Show only the public rival clock and the launch pressure it creates. */
export default function RivalsPanel({ state }: RivalsPanelProps) {
	const rivals = selectRivals(state);
	const maximumProgress = rivals.reduce(
		(maximum, rival) => Math.max(maximum, rival.progress),
		0,
	);
	const leaderId =
		maximumProgress > 0
			? (rivals.find((rival) => rival.progress === maximumProgress)?.id ?? null)
			: null;
	const launchPressure = Math.floor(maximumProgress / 25);

	return (
		<section aria-label="Rivals" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Rivals / public clocks
					</p>
					<h3 className="mt-1 font-semibold text-foreground text-sm">
						Watch the market move
					</h3>
				</div>
				<Eye className="size-4 text-primary" aria-hidden="true" />
			</div>
			<p className="text-muted-foreground text-xs leading-5">
				{state.meta.era === "text"
					? "Two focused rivals are visible in the Text era. The third enters with the Assistant era."
					: "All three rivals are public in this era; only progress and launch pressure are shown."}
			</p>

			{rivals.length > 0 ? (
				<ul
					className="grid gap-2 md:grid-cols-3"
					aria-label="Public rival progress"
				>
					{rivals.map((rival) => {
						const doctrine = rivalDoctrineForId(rival.id);
						return (
							<li
								className="glass-pane bg-[var(--game-cyan)]/5 px-3 py-3 text-muted-foreground text-xs"
								key={rival.id}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 items-start gap-2">
										<img
											alt={RIVAL_ART[rival.archetype].alt}
											className="size-10 shrink-0 rounded-full border border-cyan-300/60 object-cover shadow-[0_0_14px_rgba(34,211,238,0.2)] ring-1 ring-cyan-300/35"
											decoding="async"
											loading="lazy"
											src={RIVAL_ART[rival.archetype].src}
										/>
										<div className="min-w-0">
											<p className="truncate font-medium text-foreground text-xs">
												{rival.name}
											</p>
											<p className="mt-1 text-muted-foreground text-xs">
												{rival.focus} focus
											</p>
										</div>
									</div>
									<RivalGauge
										leader={rival.id === leaderId}
										name={rival.name}
										progress={rival.progress}
									/>
								</div>
								<Progress
									aria-label={`${rival.name} public progress`}
									className="mt-3 gap-1.5"
									value={Math.min(100, Math.max(0, rival.progress))}
								>
									<ProgressLabel className="text-muted-foreground">
										Public progress
									</ProgressLabel>
									<ProgressValue>
										{() => `${Math.min(100, Math.max(0, rival.progress))}%`}
									</ProgressValue>
								</Progress>
								<div className="mt-2 space-y-1">
									<span
										className={cn(
											"inline-flex items-center gap-1.5 border px-1.5 py-1 text-xs",
											doctrine.id === "capability"
												? "border-primary/35 bg-primary/5 text-primary"
												: "border-[var(--game-amber)]/35 bg-[var(--game-amber)]/5 text-[var(--game-amber)]",
										)}
										data-doctrine-id={doctrine.id}
										title={doctrine.note}
									>
										Doctrine · {doctrine.label}
									</span>
									<p className="text-muted-foreground text-xs leading-4">
										{doctrine.note}
									</p>
								</div>
								<p className="mt-2 text-muted-foreground text-xs">
									Public progress only · {rival.id}
								</p>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="glass-pane bg-[var(--game-cyan)]/5 px-3 py-3 text-muted-foreground text-xs">
					No public rival clocks are active.
				</p>
			)}

			<div className="flex items-center gap-2 border-border/70 border-t pt-2 text-muted-foreground text-xs">
				<Gauge
					className="size-3.5 text-[var(--game-amber)]"
					aria-hidden="true"
				/>
				Launch pressure modifier: +{launchPressure} Hype requirement
			</div>
		</section>
	);
}

function RivalGauge({
	leader,
	name,
	progress,
}: {
	leader: boolean;
	name: string;
	progress: number;
}) {
	const boundedProgress = Number.isFinite(progress)
		? Math.min(100, Math.max(0, progress))
		: 0;
	return (
		<div
			aria-label={`${name} public progress ${boundedProgress}%`}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={boundedProgress}
			className={cn(
				"relative size-16 shrink-0 rounded-full",
				leader ? "anim-pulse-glow" : undefined,
			)}
			data-rival-leader={leader ? "true" : "false"}
			role="progressbar"
		>
			<svg
				aria-hidden="true"
				className="size-full -rotate-90"
				viewBox="0 0 56 56"
			>
				<circle
					className="text-muted-foreground/25"
					cx="28"
					cy="28"
					fill="none"
					r={GAUGE_RADIUS}
					stroke="currentColor"
					strokeWidth="4"
				/>
				<circle
					className={leader ? "text-primary" : "text-primary/70"}
					cx="28"
					cy="28"
					fill="none"
					r={GAUGE_RADIUS}
					stroke="currentColor"
					strokeDasharray={GAUGE_CIRCUMFERENCE}
					strokeDashoffset={getGaugeStrokeOffset(boundedProgress)}
					strokeLinecap="round"
					strokeWidth="4"
				/>
			</svg>
			<span className="absolute inset-0 flex items-center justify-center font-semibold text-foreground text-xs">
				{boundedProgress}%
			</span>
		</div>
	);
}
