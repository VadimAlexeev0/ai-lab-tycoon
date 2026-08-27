import type { GameState } from "@ai-lab-tycoon/engine";
import type { ReactNode } from "react";

import EraBadge, { getEraProgress } from "@/game/components/era-badge";

export default function GamePage({
	eyebrow,
	title,
	description,
	eraState,
	headerVisual,
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	eraState?: Pick<GameState, "research">;
	headerVisual?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby="game-page-heading" className="space-y-5">
			<header className="flex flex-col gap-4 border-border/70 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="max-w-3xl space-y-2">
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.24em]">
						{eyebrow}
					</p>
					<h1
						id="game-page-heading"
						className="font-mono font-semibold text-2xl text-foreground uppercase tracking-tight sm:text-3xl"
					>
						{title}
					</h1>
					<p className="max-w-2xl text-muted-foreground text-sm leading-6">
						{description}
					</p>
				</div>
				{eraState || headerVisual ? (
					<div className="flex min-w-0 flex-wrap items-center gap-3">
						{headerVisual}
						{eraState ? (
							<EraBadge
								era={eraState.research.currentEra}
								progress={getEraProgress(eraState)}
								size="header"
							/>
						) : null}
					</div>
				) : null}
			</header>
			{children}
		</section>
	);
}
