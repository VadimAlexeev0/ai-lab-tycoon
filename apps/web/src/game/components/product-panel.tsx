import {
	type DecisionChoice,
	type GameState,
	type ProductChannel,
	selectPendingDecisions,
	selectProducts,
	selectVisibleModels,
} from "@ai-lab-tycoon/engine";
import { BadgeCheck, Boxes, Rocket } from "lucide-react";

import LaunchDecision from "@/game/components/launch-decision";

const CHANNELS: readonly ProductChannel[] = [
	"chat",
	"developer_api",
	"enterprise",
];
const CHANNEL_FORECASTS: Record<
	ProductChannel,
	{
		label: string;
		era: string;
		trust: number;
		hype: number;
		users: number;
		compute: number;
		revenue: number;
		cost: number;
	}
> = {
	chat: {
		label: "Chat",
		era: "Text",
		trust: 30,
		hype: 5,
		users: 10,
		compute: 1,
		revenue: 100,
		cost: 20,
	},
	developer_api: {
		label: "Developer API",
		era: "Text",
		trust: 35,
		hype: 15,
		users: 8,
		compute: 2,
		revenue: 180,
		cost: 40,
	},
	enterprise: {
		label: "Enterprise",
		era: "Assistant",
		trust: 50,
		hype: 25,
		users: 3,
		compute: 3,
		revenue: 350,
		cost: 80,
	},
};

export type ProductPanelProps = {
	state: GameState;
	disabled?: boolean;
	onResolveDecision: (choice: DecisionChoice) => void;
	showLaunchDecisions?: boolean;
};

/** Product catalogue, launch offers, and the operational forecast per channel. */
export default function ProductPanel({
	disabled = false,
	onResolveDecision,
	showLaunchDecisions = true,
	state,
}: ProductPanelProps) {
	const products = selectProducts(state);
	const visibleModels = selectVisibleModels(state);
	const modelNames = new Map(
		visibleModels.map((model) => [model.id, model.name]),
	);
	const launchDecisions = selectPendingDecisions(state).filter(
		(decision): decision is Extract<typeof decision, { kind: "launch" }> =>
			decision.kind === "launch",
	);

	return (
		<section aria-label="Products and launch decisions" className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<p className="font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.2em]">
						Products / market
					</p>
					<h3 className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]">
						Launch and watch demand
					</h3>
				</div>
				<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
					{products.length} active record{products.length === 1 ? "" : "s"}
				</span>
			</div>

			{showLaunchDecisions && launchDecisions.length > 0 ? (
				<div className="space-y-2">
					{launchDecisions.map((decision) => (
						<LaunchDecision
							decision={decision}
							disabled={disabled}
							key={decision.id}
							modelName={modelNames.get(decision.modelId) ?? decision.modelId}
							onResolve={onResolveDecision}
						/>
					))}
				</div>
			) : null}

			{products.length > 0 ? (
				<ul
					className="grid gap-3 xl:grid-cols-2"
					aria-label="Operating products"
				>
					{products.map((product) => (
						<li key={product.id}>
							<ProductRecord
								modelName={modelNames.get(product.modelId) ?? product.modelId}
								product={product}
							/>
						</li>
					))}
				</ul>
			) : (
				<div className="border border-border/70 bg-background/35 px-3 py-4">
					<div className="flex items-center gap-2">
						<Boxes
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						<p className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
							No products launched
						</p>
					</div>
					<p className="mt-2 text-muted-foreground text-xs leading-5">
						Train a ready model, then resolve its launch decision to create a
						market channel.
					</p>
				</div>
			)}

			<div className="space-y-2 border-border/70 border-t pt-3">
				<div className="flex items-center gap-2">
					<Rocket className="size-3.5 text-primary" aria-hidden="true" />
					<h4 className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
						Channel forecasts and requirements
					</h4>
				</div>
				<ul
					className="grid gap-2 md:grid-cols-3"
					aria-label="Product channel forecasts"
				>
					{CHANNELS.map((channel) => {
						const forecast = CHANNEL_FORECASTS[channel];
						return (
							<li className="border border-border/70 px-2.5 py-2" key={channel}>
								<p className="font-medium text-foreground text-xs">
									{forecast.label}
								</p>
								<p className="mt-1 text-[10px] text-muted-foreground">
									{forecast.era} era · Trust {forecast.trust} · Hype{" "}
									{forecast.hype}
								</p>
								<p className="mt-1 font-mono text-[10px] text-muted-foreground">
									${forecast.cost} launch · {forecast.users} starting users ·{" "}
									{forecast.compute} compute/user · ${forecast.revenue}/wk base
								</p>
							</li>
						);
					})}
				</ul>
			</div>
		</section>
	);
}

function ProductRecord({
	modelName,
	product,
}: {
	modelName: string;
	product: ReturnType<typeof selectProducts>[number];
}) {
	return (
		<article className="border border-border bg-background/35 p-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
						{product.id}
					</p>
					<h4 className="mt-1 font-medium text-foreground text-sm">
						{channelLabel(product.channel)} · {modelName}
					</h4>
				</div>
				<span className="inline-flex items-center gap-1 border border-border/70 px-2 py-1 font-mono text-[10px] text-foreground uppercase tracking-[0.1em]">
					<BadgeCheck
						className="size-3 text-[var(--game-positive)]"
						aria-hidden="true"
					/>
					{product.status}
				</span>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Metric label="Users" value={formatOptional(product.users)} />
				<Metric
					label="Last revenue"
					value={`$${formatOptional(product.lastRevenue)}`}
				/>
				<Metric
					label="Serving demand"
					value={formatOptional(product.servingDemand)}
				/>
				<Metric
					label="Quality"
					value={formatOptional(product.effectiveQuality)}
				/>
			</div>
		</article>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="border border-border/70 px-2 py-1.5">
			<p className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.08em]">
				{label}
			</p>
			<p className="mt-1 font-mono font-semibold text-foreground text-xs">
				{value}
			</p>
		</div>
	);
}

function channelLabel(channel: ProductChannel): string {
	return CHANNEL_FORECASTS[channel].label;
}

function formatOptional(value: number | undefined): string {
	return value === undefined
		? "—"
		: new Intl.NumberFormat("en-US").format(value);
}
