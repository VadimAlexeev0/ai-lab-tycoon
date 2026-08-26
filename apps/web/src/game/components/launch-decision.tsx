import type {
	DecisionChoice,
	PendingDecision,
	ProductChannel,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Rocket } from "lucide-react";

export type LaunchDecisionProps = {
	decision: Extract<PendingDecision, { kind: "launch" }>;
	modelName: string;
	disabled?: boolean;
	onResolve: (choice: DecisionChoice) => void;
};

const CHANNELS: readonly ProductChannel[] = [
	"chat",
	"developer_api",
	"enterprise",
];

/** Resolve a launch offer using the engine's exact decision id and channel. */
export default function LaunchDecision({
	decision,
	disabled = false,
	modelName,
	onResolve,
}: LaunchDecisionProps) {
	const channels =
		decision.channel === undefined ? CHANNELS : [decision.channel];
	return (
		<article
			className="border border-[var(--game-amber)]/60 bg-[var(--game-amber)]/10 p-3"
			id={`launch-decision-${decision.id}`}
		>
			<div className="flex items-start gap-2">
				<Rocket
					className="mt-0.5 size-4 shrink-0 text-[var(--game-amber)]"
					aria-hidden="true"
				/>
				<div>
					<p className="font-mono font-semibold text-[10px] text-[var(--game-amber)] uppercase tracking-[0.14em]">
						Launch decision required
					</p>
					<h4 className="mt-1 font-medium text-foreground text-sm">
						{modelName}
					</h4>
					<p className="mt-1 text-muted-foreground text-xs leading-5">
						Choose the product channel. Each channel has a different demand,
						quality requirement, and launch cost.
					</p>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{channels.map((channel) => (
					<Button
						disabled={disabled}
						key={channel}
						onClick={() =>
							onResolve({
								kind: "launch",
								decisionId: decision.id,
								channel,
							})
						}
						size="sm"
						type="button"
						variant="outline"
					>
						{channelLabel(channel)}
					</Button>
				))}
			</div>
			<p className="mt-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
				Queue reference: {decision.id}
			</p>
		</article>
	);
}

function channelLabel(channel: ProductChannel): string {
	return channel === "developer_api"
		? "Launch Developer API"
		: `Launch ${channel.charAt(0).toUpperCase()}${channel.slice(1)}`;
}
