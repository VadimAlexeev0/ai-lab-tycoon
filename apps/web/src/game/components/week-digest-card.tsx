import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ai-lab-tycoon/ui/components/accordion";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	ArrowUpRight,
	CircleAlert,
	FlaskConical,
	RefreshCw,
	Rocket,
	WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";

import {
	type ResourceDeltas,
	summarizeWeekDigest,
	type WeekDigest,
} from "@/game/derived/week-digest";

export type WeekDigestCardProps = {
	advanceControl?: ReactNode;
	digest: WeekDigest;
	deltas?: ResourceDeltas;
	marketPulse?: ReactNode;
	className?: string;
};

type DigestRoute = "/game/models" | "/game/products" | "/game/teams";

type DigestRow = {
	icon: LucideIcon;
	id: string;
	label: string;
	to: DigestRoute;
};

/** A quiet, expandable record of the latest engine-backed week events. */
export default function WeekDigestCard({
	advanceControl,
	className,
	deltas,
	digest,
	marketPulse,
}: WeekDigestCardProps) {
	const rows = createDigestRows(digest);
	const summary = summarizeWeekDigest(digest, deltas);

	return (
		<section
			aria-labelledby="week-digest-heading"
			className={cn("glass-pane glass-edge px-3", className)}
		>
			<h2 id="week-digest-heading" className="sr-only">
				Week digest
			</h2>
			<Accordion>
				<AccordionItem value="week-digest">
					<AccordionTrigger>
						<div className="flex min-w-0 flex-1 items-center gap-3 pr-3">
							<div className="min-w-0 flex-1">
								<span className="meta-label block text-primary">
									Latest record
								</span>
								<span className="mt-1 block truncate text-foreground text-sm">
									{summary}
								</span>
							</div>
							{marketPulse ? (
								<div className="hidden min-w-0 flex-1 sm:block">
									{marketPulse}
								</div>
							) : null}
						</div>
					</AccordionTrigger>
					<AccordionContent>
						{rows.length > 0 ? (
							<ul aria-label="Week digest events" className="space-y-1">
								{rows.map((row) => {
									const Icon = row.icon;
									return (
										<li key={row.id}>
											<Link
												className="flex min-h-11 items-center gap-2 border border-transparent px-2 text-muted-foreground text-xs hover:border-border hover:bg-muted/40 hover:text-foreground"
												to={row.to}
											>
												<Icon
													className="size-3.5 shrink-0 text-primary"
													aria-hidden="true"
												/>
												<span className="min-w-0 flex-1">{row.label}</span>
												<ArrowUpRight
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
											</Link>
										</li>
									);
								})}
							</ul>
						) : (
							<p className="px-2 pb-1 text-muted-foreground text-xs leading-5">
								No categorized events were recorded for this revision.
							</p>
						)}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
			{advanceControl ? (
				<div className="border-[var(--game-hairline)] border-t px-3 py-3">
					{advanceControl}
				</div>
			) : null}
		</section>
	);
}

function createDigestRows(digest: WeekDigest): DigestRow[] {
	return [
		...digest.launches.map((fact) => ({
			icon: Rocket,
			id: `launch-${fact.productId}`,
			label: `${fact.productId} launched on ${fact.channel.replaceAll("_", " ")}`,
			to: "/game/products" as const,
		})),
		...digest.resumes.map((fact) => ({
			icon: RefreshCw,
			id: `resume-${fact.productId}-${fact.week}`,
			label: `${fact.productId} resumed on ${fact.channel.replaceAll("_", " ")}`,
			to: "/game/products" as const,
		})),
		...digest.incidents.map((fact) => ({
			icon: CircleAlert,
			id:
				fact.kind === "incident_resolved"
					? `incident-resolved-${fact.incidentId}`
					: `incident-${fact.incident}-${fact.week}`,
			label:
				fact.kind === "incident_resolved"
					? `${humanize(fact.incident)} contained`
					: `${humanize(fact.incident)} incident reported`,
			to: "/game/products" as const,
		})),
		...digest.trainingCompletions.map((fact) => ({
			icon: FlaskConical,
			id: `training-${fact.modelId}`,
			label: `${fact.modelId} training completed`,
			to: "/game/models" as const,
		})),
		...digest.evaluations.map((fact) => ({
			icon: FlaskConical,
			id: `evaluation-${fact.modelId}-${fact.evaluation}`,
			label: `${fact.modelId} ${fact.evaluation.replaceAll("_", " ")} evaluation completed`,
			to: "/game/models" as const,
		})),
		...digest.fundingEvents.map((fact) => ({
			icon: WalletCards,
			id: `funding-${fact.round}`,
			label: `${fact.round === "series_a" ? "Series A" : "Seed"} funding ${fact.outcome}`,
			to: "/game/products" as const,
		})),
		...digest.projectCompletions.map((fact) => ({
			icon: FlaskConical,
			id: `project-${fact.projectId}`,
			label: `${fact.projectId} completed`,
			to: "/game/teams" as const,
		})),
	];
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
