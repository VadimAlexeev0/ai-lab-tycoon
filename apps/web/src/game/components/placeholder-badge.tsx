import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Sparkles } from "lucide-react";

export const PLACEHOLDER_BADGE_LABEL =
	"Preview · coming online in a later era" as const;

/** A deliberately unmistakable marker for surfaces that are not engine-backed yet. */
export default function PlaceholderBadge({
	className,
}: {
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 border border-[var(--game-amber)]/70 bg-[var(--game-amber)]/10 px-2 py-1 font-mono font-semibold text-[var(--game-amber)] text-xs uppercase tracking-[0.1em]",
				className,
			)}
			title={PLACEHOLDER_BADGE_LABEL}
		>
			<Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="truncate">{PLACEHOLDER_BADGE_LABEL}</span>
		</span>
	);
}
