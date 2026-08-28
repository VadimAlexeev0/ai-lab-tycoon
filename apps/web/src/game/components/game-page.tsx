import type { GameState } from "@ai-lab-tycoon/engine";
import type { ReactNode } from "react";

export default function GamePage({
	title,
	description,
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
			<header className="flex items-baseline justify-between gap-3 pb-4">
				<h1
					aria-describedby="game-page-description"
					tabIndex={-1}
					id="game-page-heading"
					className="min-w-0 font-display font-semibold text-2xl text-foreground sm:text-3xl"
				>
					{title}
				</h1>
				{headerVisual ? (
					<div className="flex min-w-0 shrink-0 items-center gap-3">
						{headerVisual}
					</div>
				) : null}
				<span id="game-page-description" className="sr-only">
					{description}
				</span>
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
