import {
	type DecisionChoice,
	type FundingRound,
	type GameState,
	selectFunding,
	selectPendingDecisions,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Banknote, CheckCircle2, CircleAlert, LockKeyhole } from "lucide-react";

const ROUND_INFO: Record<
	FundingRound,
	{
		label: string;
		grant: number;
		thresholds: Record<keyof FundingFactors, number>;
	}
> = {
	seed: {
		label: "Seed",
		grant: 500,
		thresholds: {
			hype: 20,
			trust: 45,
			modelScore: 35,
			operatingProducts: 0,
			cumulativeRevenue: 0,
		},
	},
	series_a: {
		label: "Series A",
		grant: 1500,
		thresholds: {
			hype: 45,
			trust: 60,
			modelScore: 55,
			operatingProducts: 1,
			cumulativeRevenue: 250,
		},
	},
};

type FundingFactors = {
	hype: number;
	trust: number;
	modelScore: number;
	operatingProducts: number;
	cumulativeRevenue: number;
};

export type FundingPanelProps = {
	state: GameState;
	disabled?: boolean;
	onResolveDecision: (choice: DecisionChoice) => void;
};

/** Seed then Series A are the complete V1 financing path. */
export default function FundingPanel({
	disabled = false,
	onResolveDecision,
	state,
}: FundingPanelProps) {
	const funding = selectFunding(state);
	const pending = selectPendingDecisions(state).filter(
		(decision): decision is Extract<typeof decision, { kind: "funding" }> =>
			decision.kind === "funding",
	);
	const pendingByRound = new Map(
		pending.map((decision) => [decision.round, decision]),
	);

	return (
		<section aria-label="Funding" className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Capital / eligibility
					</p>
					<h3 className="mt-1 font-semibold text-foreground text-sm">
						Funding path
					</h3>
				</div>
				<Banknote className="size-4 text-primary" aria-hidden="true" />
			</div>
			<p className="text-muted-foreground text-xs leading-5">
				Eligibility is measured against live public factors. V1 exposes Seed and
				Series A only; there are no later rounds.
			</p>

			<div className="grid gap-3 md:grid-cols-2">
				<RoundCard
					decision={pendingByRound.get("seed")}
					factors={funding.factors}
					disabled={disabled}
					round="seed"
					status={funding.seed.status}
					onResolveDecision={onResolveDecision}
				/>
				<RoundCard
					decision={pendingByRound.get("series_a")}
					factors={funding.factors}
					disabled={disabled}
					round="series_a"
					status={funding.seriesA.status}
					onResolveDecision={onResolveDecision}
				/>
			</div>
		</section>
	);
}

function RoundCard({
	decision,
	factors,
	disabled,
	round,
	status,
	onResolveDecision,
}: {
	decision:
		| Extract<
				ReturnType<typeof selectPendingDecisions>[number],
				{ kind: "funding" }
		  >
		| undefined;
	factors: FundingFactors;
	disabled: boolean;
	round: FundingRound;
	status: "locked" | "available" | "accepted" | "declined";
	onResolveDecision: (choice: DecisionChoice) => void;
}) {
	const info = ROUND_INFO[round];
	const entries = Object.entries(info.thresholds) as Array<
		[keyof FundingFactors, number]
	>;
	const metCount = entries.filter(
		([factor, threshold]) => factors[factor] >= threshold,
	).length;
	const locked = status === "locked";
	return (
		<article className="surface-card p-3">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="font-medium text-foreground text-sm">{info.label}</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Grant ${info.grant} · {status}
					</p>
				</div>
				{locked ? (
					<LockKeyhole
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>
				) : (
					<CheckCircle2
						className={
							status === "accepted"
								? "size-4 text-[var(--game-positive)]"
								: "size-4 text-primary"
						}
						aria-hidden="true"
					/>
				)}
			</div>
			<p className="mt-3 text-muted-foreground text-xs">
				Eligibility odds: {metCount} / {entries.length} factors met
			</p>
			<ul
				className="mt-2 space-y-1 text-muted-foreground text-xs"
				aria-label={`${info.label} eligibility factors`}
			>
				{entries.map(([factor, threshold]) => {
					const met = factors[factor] >= threshold;
					const StatusIcon = met ? CheckCircle2 : CircleAlert;
					return (
						<li
							className="flex items-center justify-between gap-2"
							key={factor}
						>
							<span>{factorLabel(factor)}</span>
							<span
								className={
									met
										? "inline-flex items-center gap-1 text-[var(--game-positive)]"
										: "inline-flex items-center gap-1 text-[var(--game-amber)]"
								}
							>
								<StatusIcon className="size-3" aria-hidden="true" />
								<span>{met ? "Met" : "Needs"}</span>
								{factors[factor]} / {threshold}
							</span>
						</li>
					);
				})}
			</ul>
			{decision ? (
				<div className="mt-3 flex flex-wrap gap-2 border-border/70 border-t pt-3">
					<Button
						disabled={disabled}
						onClick={() =>
							onResolveDecision({
								kind: "funding",
								decisionId: decision.id,
								round,
								accept: true,
							})
						}
						size="sm"
						type="button"
					>
						Accept {info.label}
					</Button>
					<Button
						aria-label={`Decline ${info.label}`}
						disabled={disabled}
						onClick={() =>
							onResolveDecision({
								kind: "funding",
								decisionId: decision.id,
								round,
								accept: false,
							})
						}
						size="sm"
						type="button"
						variant="outline"
					>
						Decline
					</Button>
				</div>
			) : null}
		</article>
	);
}

function factorLabel(factor: keyof FundingFactors): string {
	return factor === "modelScore"
		? "Best model score"
		: factor === "operatingProducts"
			? "Operating products"
			: factor === "cumulativeRevenue"
				? "Cumulative revenue"
				: factor.charAt(0).toUpperCase() + factor.slice(1);
}
