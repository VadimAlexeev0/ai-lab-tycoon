import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import type { CSSProperties } from "react";

const EDGE_MASK_STYLE: CSSProperties = {
	maskImage: "radial-gradient(ellipse at center, transparent 52%, black 100%)",
	WebkitMaskImage:
		"radial-gradient(ellipse at center, transparent 52%, black 100%)",
};

export type ArtFrameProps = {
	src: string;
	alt: string;
	/** Aspect ratio or size utilities for the frame itself. */
	className?: string;
	tint?: string;
	loading?: "lazy" | "eager";
};

/** Render gallery art with a soft, theme-safe edge melt instead of a hard cut. */
export default function ArtFrame({
	alt,
	className,
	loading = "lazy",
	src,
	tint,
}: ArtFrameProps) {
	const decorative = alt.length === 0;

	return (
		<div
			className={cn(
				"relative isolate overflow-hidden rounded-lg bg-background/10 ring-1 ring-border/40",
				className,
			)}
		>
			<img
				alt={alt}
				aria-hidden={decorative}
				className="block h-full w-full object-cover"
				decoding="async"
				loading={loading}
				src={src}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 rounded-[inherit] backdrop-blur-[2px]"
				style={EDGE_MASK_STYLE}
			/>
			<div
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_1rem_rgba(255,255,255,0.12),inset_0_0_2rem_rgba(0,0,0,0.24)]",
					tint,
				)}
			/>
		</div>
	);
}
