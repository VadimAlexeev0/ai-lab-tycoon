import {
	type DecisionChoice,
	type GameState,
	selectPendingDecisions,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { AlertOctagon, ShieldAlert } from "lucide-react";

type IncidentType =
	| "outage"
	| "latency_degradation"
	| "quality_safety_scandal"
	| "compute_cost_overrun"
	| "enterprise_sla_breach"
	| "data_privacy_incident";
type IncidentResponse = "repair" | "reduce_scope" | "disclose";

type IncidentInfo = {
	condition: string;
	affectedEntity: string;
	metric: string;
	responses: Record<
		IncidentResponse,
		{ label: string; cash: number; trust: number; hype: number }
	>;
};

const INCIDENT_INFO: Record<IncidentType, IncidentInfo> = {
	outage: {
		condition: "Serving overload",
		affectedEntity: "product",
		metric: "serving demand",
		responses: {
			repair: { label: "Repair infrastructure", cash: 60, trust: -2, hype: 0 },
			reduce_scope: {
				label: "Reduce product scope",
				cash: 15,
				trust: -4,
				hype: -2,
			},
			disclose: { label: "Disclose the outage", cash: 10, trust: 0, hype: -5 },
		},
	},
	latency_degradation: {
		condition: "API overload",
		affectedEntity: "product",
		metric: "serving demand",
		responses: {
			repair: { label: "Repair API capacity", cash: 45, trust: -1, hype: 0 },
			reduce_scope: {
				label: "Reduce API scope",
				cash: 10,
				trust: -3,
				hype: -2,
			},
			disclose: { label: "Disclose latency", cash: 8, trust: 0, hype: -3 },
		},
	},
	quality_safety_scandal: {
		condition: "Low product quality",
		affectedEntity: "product",
		metric: "effective quality",
		responses: {
			repair: { label: "Repair the model", cash: 50, trust: -2, hype: -1 },
			reduce_scope: {
				label: "Reduce product scope",
				cash: 15,
				trust: -7,
				hype: -4,
			},
			disclose: { label: "Disclose the issue", cash: 10, trust: 2, hype: -6 },
		},
	},
	compute_cost_overrun: {
		condition: "Training overload",
		affectedEntity: "training project",
		metric: "training demand",
		responses: {
			repair: { label: "Repair the training run", cash: 70, trust: 0, hype: 0 },
			reduce_scope: {
				label: "Reduce training scope",
				cash: 20,
				trust: 0,
				hype: -2,
			},
			disclose: { label: "Disclose the overrun", cash: 15, trust: 0, hype: -3 },
		},
	},
	enterprise_sla_breach: {
		condition: "Enterprise reliability risk",
		affectedEntity: "product",
		metric: "reliability",
		responses: {
			repair: { label: "Repair the SLA path", cash: 80, trust: -2, hype: 0 },
			reduce_scope: {
				label: "Reduce enterprise scope",
				cash: 25,
				trust: -7,
				hype: -3,
			},
			disclose: { label: "Disclose the breach", cash: 15, trust: 1, hype: -5 },
		},
	},
	data_privacy_incident: {
		condition: "Privacy exposure",
		affectedEntity: "company",
		metric: "trust",
		responses: {
			repair: {
				label: "Repair privacy controls",
				cash: 65,
				trust: -5,
				hype: -2,
			},
			reduce_scope: {
				label: "Reduce data scope",
				cash: 20,
				trust: -8,
				hype: -5,
			},
			disclose: {
				label: "Disclose the exposure",
				cash: 25,
				trust: 2,
				hype: -7,
			},
		},
	},
};

const OPS_ADVISOR = {
	alt: "Advisor: Ops",
	src: "/art/advisor-ops.png",
} as const;

export type IncidentCardProps = {
	state: GameState;
	disabled?: boolean;
	onResolveDecision: (choice: DecisionChoice) => void;
};

/** Incident cards expose the mechanical trigger, effects, and valid responses. */
export default function IncidentCard({
	disabled = false,
	onResolveDecision,
	state,
}: IncidentCardProps) {
	const decisions = selectPendingDecisions(state).filter(
		(decision): decision is Extract<typeof decision, { kind: "incident" }> =>
			decision.kind === "incident",
	);
	if (decisions.length === 0) {
		return (
			<section
				aria-label="Incidents"
				className="border border-border/70 bg-background/35 px-3 py-3"
			>
				<div className="flex items-center gap-2">
					<ShieldAlert
						className="size-3.5 text-[var(--game-positive)]"
						aria-hidden="true"
					/>
					<h3 className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
						No incident response required
					</h3>
				</div>
				<p className="mt-1 text-muted-foreground text-xs leading-5">
					Mechanical incident checks run during weekly operations.
				</p>
			</section>
		);
	}

	return (
		<section aria-label="Incident responses" className="space-y-3">
			{decisions.map((decision) => (
				<IncidentDecision
					decision={decision}
					disabled={disabled}
					key={decision.id}
					onResolveDecision={onResolveDecision}
					state={state}
				/>
			))}
		</section>
	);
}

function IncidentDecision({
	decision,
	disabled,
	onResolveDecision,
	state,
}: {
	decision: Extract<
		ReturnType<typeof selectPendingDecisions>[number],
		{ kind: "incident" }
	>;
	disabled: boolean;
	onResolveDecision: (choice: DecisionChoice) => void;
	state: GameState;
}) {
	const info = INCIDENT_INFO[decision.incident];
	const evidence = [...state.reports.items]
		.reverse()
		.find(
			(report) =>
				report.fact.kind === "incident_occurred" &&
				report.fact.incident === decision.incident,
		);
	return (
		<article
			className="border border-[var(--game-negative)]/60 bg-[var(--game-negative)]/10 p-3"
			id={`incident-card-${decision.id}`}
		>
			<div className="flex items-start gap-2">
				<img
					alt={OPS_ADVISOR.alt}
					className="size-10 shrink-0 rounded-full border border-cyan-300/60 object-cover shadow-[0_0_14px_rgba(34,211,238,0.2)] ring-1 ring-cyan-300/35"
					decoding="async"
					loading="lazy"
					src={OPS_ADVISOR.src}
				/>
				<AlertOctagon
					className="mt-0.5 size-4 shrink-0 text-[var(--game-negative)]"
					aria-hidden="true"
				/>
				<div>
					<p className="font-mono font-semibold text-[10px] text-[var(--game-negative)] uppercase tracking-[0.14em]">
						Blocking incident
					</p>
					<h3 className="mt-1 font-medium text-foreground text-sm">
						{humanize(decision.incident)}
					</h3>
				</div>
			</div>

			<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-border/70 border-y py-2 text-[10px]">
				<Fact label="Cause" value={info.condition} />
				<Fact label="Affected" value={info.affectedEntity} />
				<Fact label="Metric" value={info.metric} />
				<Fact
					label="Evidence"
					value={
						evidence?.fact.kind === "incident_occurred"
							? `${evidence.fact.measurement} / threshold ${evidence.fact.threshold}`
							: "Recorded in report history"
					}
				/>
			</dl>
			{evidence?.fact.kind === "incident_occurred" ? (
				<p className="mt-2 text-[10px] text-muted-foreground leading-4">
					Immediate severity: {evidence.fact.severity} total resource units.
				</p>
			) : null}

			<div className="mt-3 space-y-2">
				<p className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
					Choose a mechanical response
				</p>
				<div className="grid gap-2 md:grid-cols-3">
					{(Object.keys(info.responses) as IncidentResponse[]).map(
						(response) => {
							const effect = info.responses[response];
							return (
								<div
									className="border border-border/70 bg-background/35 p-2"
									key={response}
								>
									<p className="font-medium text-foreground text-xs">
										{effect.label}
									</p>
									<p className="mt-1 text-[10px] text-muted-foreground">
										Cash -${effect.cash} · Trust {signed(effect.trust)} · Hype{" "}
										{signed(effect.hype)}
									</p>
									<Button
										aria-label={`Choose ${effect.label}`}
										disabled={disabled}
										className="mt-2 w-full"
										onClick={() =>
											onResolveDecision({
												kind: "incident",
												decisionId: decision.id,
												response,
											})
										}
										size="sm"
										type="button"
										variant="outline"
									>
										Choose
									</Button>
								</div>
							);
						},
					)}
				</div>
			</div>
			<p className="mt-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
				Queue reference: {decision.id}
			</p>
		</article>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="font-mono text-muted-foreground uppercase tracking-[0.08em]">
				{label}
			</dt>
			<dd className="mt-0.5 text-foreground">{value}</dd>
		</div>
	);
}

function signed(value: number): string {
	return value > 0 ? `+${value}` : `${value}`;
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
