import type { GameState } from "@ai-lab-tycoon/engine";
import type { ReactNode } from "react";

import EraBadge, { getEraProgress } from "@/game/components/era-badge";

export default function GamePage({
	title,
	description,
	eraState,
	headerVisual,
	children,
	contentClassName = "",
}: {
	title: string;
	description: string;
	eraState?: Pick<GameState, "research">;
	headerVisual?: ReactNode;
	children: ReactNode;
	/** Layout override for the content region, e.g. prose measure on editorial pages. */
	contentClassName?: string;
}) {
	return (
		<section
			aria-labelledby="game-page-heading"
			className="space-y-6"
			tabIndex={-1}
		>
			<header className="flex flex-col gap-4 border-border/70 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="max-w-3xl space-y-2">
					<h1
						id="game-page-heading"
						className="font-display font-semibold text-3xl text-foreground sm:text-4xl"
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
			<div
				className={
					contentClassName.trim().length > 0 ? contentClassName : undefined
				}
			>
				{children}
			</div>
		</section>
	);
}
