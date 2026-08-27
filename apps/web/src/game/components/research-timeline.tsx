import type { GameState } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";

import { ERA_LABELS, ERA_ORDER, type Era } from "./era-badge";

export type ResearchTimelinePoint = {
	completed: number;
	era: Era;
	isCurrent: boolean;
	isNext: boolean;
	total: number;
};

export function getResearchTimeline(
	state: Pick<GameState, "research">,
): ResearchTimelinePoint[] {
	const currentIndex = ERA_ORDER.indexOf(state.research.currentEra);
	return ERA_ORDER.map((era, index) => {
		const eraNodes = state.research.nodes.filter((node) => node.era === era);
		return {
			completed: eraNodes.filter((node) => node.status === "completed").length,
			era,
			isCurrent: index === currentIndex,
			isNext: index === currentIndex + 1,
			total: eraNodes.length,
		};
	});
}

export default function ResearchTimeline({
	state,
}: {
	state: Pick<GameState, "research">;
}) {
	const points = getResearchTimeline(state);
	const currentIndex = points.findIndex((point) => point.isCurrent);
	const label = points
		.map(
			(point) =>
				`${ERA_LABELS[point.era]}: ${point.completed} of ${point.total} completed`,
		)
		.join(". ");

	return (
		<figure
			aria-label={`Research timeline. ${label}`}
			className="w-56 shrink-0"
		>
			<svg
				aria-hidden="true"
				className="h-8 w-full overflow-visible"
				viewBox="0 0 240 32"
			>
				<line
					className="text-border"
					x1="20"
					x2="220"
					y1="12"
					y2="12"
					stroke="currentColor"
					strokeWidth="1"
				/>
				{points.map((point, index) => {
					const x = 20 + index * 100;
					const tickCount = Math.min(point.completed, 8);
					const tickStart = x - ((tickCount - 1) * 7) / 2;
					return (
						<g key={point.era}>
							{Array.from({ length: tickCount }, (_, tickIndex) => (
								<line
									className={cn(
										point.isCurrent
											? "text-primary"
											: "text-[var(--game-positive)]",
									)}
									x1={tickStart + tickIndex * 7}
									x2={tickStart + tickIndex * 7}
									y1="21"
									y2="27"
									key={`${point.era}-tick-${tickIndex}`}
									stroke="currentColor"
									strokeLinecap="round"
									strokeWidth="2"
								/>
							))}
							<circle
								className={cn(
									point.isCurrent
										? "text-primary"
										: point.isNext
											? "text-muted-foreground"
											: "text-[var(--game-positive)]",
								)}
								cx={x}
								cy="12"
								fill="currentColor"
								r={point.isCurrent ? 5 : 4}
								stroke="currentColor"
								strokeWidth={point.isCurrent ? 2 : 1}
							/>
						</g>
					);
				})}
			</svg>
			<div
				aria-hidden="true"
				className="flex justify-between gap-2 font-mono text-xs uppercase tracking-[0.06em]"
			>
				{points.map((point, index) => (
					<span
						className={cn(
							"truncate",
							point.isCurrent
								? "font-semibold text-primary"
								: point.isNext
									? "text-muted-foreground"
									: "text-[var(--game-positive)]",
						)}
						key={point.era}
						title={`${ERA_LABELS[point.era]} · ${point.completed}/${point.total} completed`}
					>
						{index === currentIndex
							? "Current"
							: index === currentIndex + 1
								? "Next"
								: ERA_LABELS[point.era].replace(" era", "")}
					</span>
				))}
			</div>
			<figcaption className="sr-only">{label}.</figcaption>
		</figure>
	);
}
