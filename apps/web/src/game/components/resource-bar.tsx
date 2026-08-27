import type { GameState } from "@ai-lab-tycoon/engine";
import { selectResourceBar, selectVisibleState } from "@ai-lab-tycoon/engine";
import {
	Cpu,
	Flame,
	Gauge,
	Lightbulb,
	ShieldCheck,
	WalletCards,
} from "lucide-react";

export type ResourceBarProps = {
	state: GameState;
};

type ResourceItem = {
	label: string;
	value: string;
	detail?: string;
	icon: typeof WalletCards;
	progress?: number;
	accent: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export default function ResourceBar({ state }: ResourceBarProps) {
	const visibleState = selectVisibleState(state);
	const resources = selectResourceBar(state);
	const computeAvailable =
		resources.compute.capacity - resources.compute.allocated;
	const items: ResourceItem[] = [
		{
			label: "Cash",
			value: `$${formatNumber(resources.cash)}`,
			detail: "operating balance",
			icon: WalletCards,
			accent: "text-[var(--game-positive)]",
		},
		{
			label: "Compute",
			value: `${formatNumber(resources.compute.allocated)} / ${formatNumber(resources.compute.capacity)}`,
			detail: `${formatSignedNumber(computeAvailable)} available · ${formatNumber(resources.compute.trainingDemand)} training · ${formatNumber(resources.compute.servingDemand)} serving`,
			icon: Cpu,
			accent: "text-primary",
		},
		{
			label: "Insight",
			value: formatNumber(resources.insight),
			detail: "research reserve",
			icon: Lightbulb,
			accent: "text-[var(--game-amber)]",
		},
		{
			label: "Trust",
			value: formatNumber(resources.trust),
			detail: "stakeholder confidence",
			icon: ShieldCheck,
			progress: resources.trust,
			accent: "text-[var(--game-positive)]",
		},
		{
			label: "Hype",
			value: formatNumber(resources.hype),
			detail: "market attention",
			icon: Flame,
			progress: resources.hype,
			accent: "text-[var(--game-negative)]",
		},
	];

	return (
		<section
			aria-labelledby="resource-bar-heading"
			className="surface-card"
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
					<ResourceCell key={item.label} item={item} />
				))}
			</div>
		</section>
	);
}

function ResourceCell({ item }: { item: ResourceItem }) {
	const Icon = item.icon;
	return (
		<div
			className="relative min-h-24 border-border px-3 py-3 first:border-t-0 sm:min-h-20 sm:px-4 lg:border-t-0"
			data-resource={item.label.toLowerCase()}
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
				<Icon className={`size-4 ${item.accent}`} aria-hidden="true" />
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

function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

function formatSignedNumber(value: number): string {
	return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}
