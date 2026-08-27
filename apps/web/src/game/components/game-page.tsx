import type { ReactNode } from "react";

export default function GamePage({
	eyebrow,
	title,
	description,
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby="game-page-heading" className="space-y-5">
			<header className="max-w-3xl space-y-2">
				<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.24em]">
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
			</header>
			{children}
		</section>
	);
}
