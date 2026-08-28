import type { GameState } from "@ai-lab-tycoon/engine";
import { selectResourceBar, selectVisibleState } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import {
	Cpu,
	Flame,
	Gauge,
	Lightbulb,
	ShieldCheck,
	WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useWeekDigest } from "@/game/derived/use-week-digest";

export type ResourceBarProps = {
	revision?: number;
	state: GameState;
};

type ResourceItem = {
	accent: string;
	delta?: number;
	detail?: string;
	icon: typeof WalletCards;
	label: string;
	progress?: number;
	value: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export default function ResourceBar({ revision, state }: ResourceBarProps) {
	const visibleState = selectVisibleState(state);
	const resources = selectResourceBar(state);
	const { deltas } = useWeekDigest(state, revision);
	const computeAvailable =
		resources.compute.capacity - resources.compute.allocated;
	const items: ResourceItem[] = [
		{
			accent: "text-[var(--game-positive)]",
			delta: deltas.cash,
			detail: "operating balance",
			icon: WalletCards,
			label: "Cash",
			value: `$${formatNumber(resources.cash)}`,
		},
		{
			accent: "text-primary",
			delta: deltas.compute.allocated,
			detail: `${formatSignedNumber(computeAvailable)} available · ${formatNumber(resources.compute.trainingDemand)} training · ${formatNumber(resources.compute.servingDemand)} serving`,
			icon: Cpu,
			label: "Compute",
			value: `${formatNumber(resources.compute.allocated)} / ${formatNumber(resources.compute.capacity)}`,
		},
		{
			accent: "text-[var(--game-amber)]",
			delta: deltas.insight,
			detail: "research reserve",
			icon: Lightbulb,
			label: "Insight",
			value: formatNumber(resources.insight),
		},
		{
			accent: "text-[var(--game-positive)]",
			delta: deltas.trust,
			detail: "stakeholder confidence",
			icon: ShieldCheck,
			label: "Trust",
			progress: resources.trust,
			value: formatNumber(resources.trust),
		},
		{
			accent: "text-[var(--game-negative)]",
			delta: deltas.hype,
			detail: "market attention",
			icon: Flame,
			label: "Hype",
			progress: resources.hype,
			value: formatNumber(resources.hype),
		},
	];

	return (
		<section
			aria-labelledby="resource-bar-heading"
			className="glass-pane glass-edge"
			data-next-objective={visibleState.nextObjective.kind}
		>
			<h2 id="resource-bar-heading" className="sr-only">
				Run resources
			</h2>
			<div className="grid grid-cols-2 divide-border border-b sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
				<div className="col-span-2 flex items-center gap-3 border-border border-b px-3 py-3 sm:col-span-3 lg:col-span-1 lg:border-b-0">
					<div className="flex size-8 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 text-primary">
						<Gauge className="size-4" aria-hidden="true" />
					</div>
					<div>
						<p className="meta-label text-muted-foreground">Time</p>
						<p className="numeric-value mt-1 font-semibold text-foreground text-lg leading-none">
							Week {state.meta.week}
						</p>
					</div>
				</div>

				{items.map((item) => (
					<ResourceCell item={item} key={item.label} revision={revision} />
				))}
			</div>
		</section>
	);
}

function ResourceCell({
	item,
	revision,
}: {
	item: ResourceItem;
	revision: number | undefined;
}) {
	const Icon = item.icon;
	return (
		<div
			className="relative min-h-24 border-border px-3 py-3 first:border-t-0 sm:min-h-20 sm:px-4 lg:border-t-0"
			data-resource={item.label.toLowerCase()}
			title={`${item.label}: ${item.detail ?? item.value}`}
		>
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="meta-label text-muted-foreground">{item.label}</p>
					<p
						className={`numeric-value mt-1 font-semibold text-base ${item.accent}`}
					>
						{item.value}
					</p>
				</div>
				<div className="flex items-start gap-2">
					<DeltaChip
						delta={item.delta ?? 0}
						key={`${item.label}-${revision ?? "initial"}`}
					/>
					<Icon className={`size-4 ${item.accent}`} aria-hidden="true" />
				</div>
			</div>
			{item.detail ? (
				<p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-4">
					{item.detail}
				</p>
			) : null}
			{item.progress !== undefined ? (
				<div
					className="absolute inset-x-3 bottom-0 h-0.5 bg-muted sm:inset-x-4"
					aria-hidden="true"
				>
					<div
						className={`h-full bg-current ${item.accent}`}
						style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
					/>
				</div>
			) : null}
		</div>
	);
}

function DeltaChip({ delta }: { delta: number }) {
	const [visible, setVisible] = useState(delta !== 0);
	useEffect(() => {
		setVisible(delta !== 0);
		if (delta === 0) return;
		const timeout = window.setTimeout(() => setVisible(false), 2_000);
		return () => window.clearTimeout(timeout);
	}, [delta]);

	if (!visible || delta === 0) return null;
	return (
		<span
			aria-hidden="true"
			className={cn(
				"numeric-value inline-flex animate-[ailt-delta-fade_2s_ease-out_forwards] items-center rounded-full px-1.5 py-0.5 font-semibold text-[10px] leading-none",
				delta > 0
					? "bg-[var(--game-positive)]/15 text-[var(--game-positive)]"
					: "bg-[var(--game-negative)]/15 text-[var(--game-negative)]",
			)}
			data-delta={delta}
		>
			{delta > 0 ? "+" : "−"}
			{formatNumber(Math.abs(delta))}
		</span>
	);
}

function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

function formatSignedNumber(value: number): string {
	return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}
