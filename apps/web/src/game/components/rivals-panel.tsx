import { type GameState, selectRivals } from "@ai-lab-tycoon/engine";
import { Eye, Gauge } from "lucide-react";

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

/** Show only the public rival clock and the launch pressure it creates. */
export default function RivalsPanel({ state }: RivalsPanelProps) {
	const rivals = selectRivals(state);
	const maximumProgress = rivals.reduce(
		(maximum, rival) => Math.max(maximum, rival.progress),
		0,
	);
	const launchPressure = Math.floor(maximumProgress / 25);

	return (
		<section aria-label="Rivals" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.2em]">
						Rivals / public clocks
					</p>
					<h3 className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]">
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
					{rivals.map((rival) => (
						<li
							className="border border-border/70 bg-background/35 p-2.5"
							key={rival.id}
						>
							<div className="flex items-start justify-between gap-2">
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
										<p className="mt-1 font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">
											{rival.focus} focus
										</p>
									</div>
								</div>
								<span className="font-mono font-semibold text-foreground text-xs">
									{rival.progress}%
								</span>
							</div>
							<div
								aria-label={`${rival.name} public progress ${rival.progress}%`}
								className="mt-2 h-1.5 bg-muted"
								role="progressbar"
								aria-valuemax={100}
								aria-valuemin={0}
								aria-valuenow={rival.progress}
							>
								<div
									className="h-full bg-primary"
									style={{ width: `${Math.min(100, rival.progress)}%` }}
								/>
							</div>
							<p className="mt-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">
								Public progress only · {rival.id}
							</p>
						</li>
					))}
				</ul>
			) : (
				<p className="border border-border/70 bg-background/35 px-3 py-3 text-muted-foreground text-xs">
					No public rival clocks are active.
				</p>
			)}

			<div className="flex items-center gap-2 border-border/70 border-t pt-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.1em]">
				<Gauge
					className="size-3.5 text-[var(--game-amber)]"
					aria-hidden="true"
				/>
				Launch pressure modifier: +{launchPressure} Hype requirement
			</div>
		</section>
	);
}
