import type { GameState } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";

import ArtFrame from "@/game/components/art-frame";

export const ERA_ORDER = ["text", "assistant", "multimodal"] as const;
export type Era = (typeof ERA_ORDER)[number];

export const ERA_LABELS: Record<Era, string> = {
	text: "Text era",
	assistant: "Assistant era",
	multimodal: "Multimodal era",
};

export type EraProgress = {
	completed: number;
	era: Era;
	nextEra: Era | null;
	percent: number;
	total: number;
};

export function getEraProgress(
	state: Pick<GameState, "research">,
): EraProgress {
	const era = state.research.currentEra;
	const eraIndex = ERA_ORDER.indexOf(era);
	const currentNodes = state.research.nodes.filter((node) => node.era === era);
	const completed = currentNodes.filter(
		(node) => node.status === "completed",
	).length;
	const total = currentNodes.length;
	const nextEra = ERA_ORDER[eraIndex + 1] ?? null;

	return {
		completed,
		era,
		nextEra,
		percent: total === 0 ? 0 : Math.round((completed / total) * 100),
		total,
	};
}

export default function EraBadge({
	era,
	progress,
	size = "compact",
}: {
	era: Era;
	progress?: EraProgress;
	size?: "compact" | "header";
}) {
	const isHeader = size === "header";
	const nextLabel = progress?.nextEra
		? ERA_LABELS[progress.nextEra]
		: "frontier";
	const progressLabel = progress
		? `${progress.completed}/${progress.total} nodes to ${nextLabel}`
		: undefined;

	return (
		<span
			aria-label={`${ERA_LABELS[era]}${progressLabel ? `, ${progressLabel}` : ""}`}
			className={cn(
				"inline-flex min-w-0 items-center gap-2 border border-primary/40 bg-primary/10 px-2 text-primary",
				isHeader ? "h-10 max-w-full" : "h-8",
			)}
			data-era={era}
			data-era-size={size}
			role="status"
		>
			<ArtFrame
				alt=""
				className={cn("shrink-0", isHeader ? "size-8" : "size-6")}
				src="/art-v2/torus-ice.png"
				tint="bg-primary/10"
			/>
			<span className="min-w-0">
				<span className="block truncate font-semibold text-xs">
					{ERA_LABELS[era]}
				</span>
				{isHeader && progress ? (
					<>
						<span className="mt-0.5 block truncate text-muted-foreground text-xs normal-case">
							{progressLabel}
						</span>
						<span
							aria-hidden="true"
							className="mt-0.5 block h-0.5 w-full min-w-20 bg-muted"
						>
							<span
								className="block h-full bg-primary transition-[width] duration-300"
								style={{ width: `${progress.percent}%` }}
							/>
						</span>
					</>
				) : null}
			</span>
		</span>
	);
}
