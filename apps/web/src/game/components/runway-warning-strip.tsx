import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";

import type {
	RunwayWarning,
	RunwayWarningSeverity,
} from "@/game/derived/runway";

const SEVERITY_RANK: Record<RunwayWarningSeverity, number> = {
	info: 0,
	warning: 1,
	critical: 2,
};

export type RunwayWarningStripProps = {
	className?: string;
	warnings: readonly RunwayWarning[];
};

/** Surface the single most urgent runway warning beside time controls. */
export default function RunwayWarningStrip({
	className,
	warnings,
}: RunwayWarningStripProps) {
	const warning = mostSevereWarning(warnings);
	if (warning === undefined) return null;
	const Icon = warningIcon(warning.severity);

	return (
		<section
			aria-label="Highest-priority run warning"
			className={cn(
				"flex items-start gap-3 rounded-lg border px-3 py-3",
				warningSurface(warning.severity),
				className,
			)}
			data-warning-severity={warning.severity}
			role="alert"
		>
			<Icon
				aria-hidden="true"
				className={cn(
					"mt-0.5 size-4 shrink-0",
					warningIconColor(warning.severity),
				)}
			/>
			<div className="min-w-0">
				<p className={cn("meta-label", warningIconColor(warning.severity))}>
					{severityLabel(warning.severity)}
				</p>
				<p className="mt-1 text-foreground text-sm leading-5">
					{warning.message}
				</p>
			</div>
		</section>
	);
}

/** Render all derived warnings in a compact dashboard rail. */
export function RunwayWarningList({
	warnings,
}: {
	warnings: readonly RunwayWarning[];
}) {
	if (warnings.length === 0) return null;

	return (
		<section
			aria-label="Runway warnings"
			className="glass-pane border-[var(--game-hairline)] bg-background/20 px-3 py-3"
			role="status"
		>
			<p className="meta-label text-primary">Runway watch</p>
			<ul className="mt-2 space-y-2">
				{warnings.map((warning) => (
					<li
						className="flex items-start gap-2 text-muted-foreground text-xs leading-5"
						key={warning.code}
					>
						<span
							aria-hidden="true"
							className={cn(
								"mt-1.5 size-1.5 shrink-0 rounded-full",
								warningDotColor(warning.severity),
							)}
						/>
						<span className="min-w-0">
							<span className="mr-1 font-medium text-foreground">
								{severityLabel(warning.severity)}:
							</span>
							{warning.message}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

export function mostSevereWarning(
	warnings: readonly RunwayWarning[],
): RunwayWarning | undefined {
	return warnings.reduce<RunwayWarning | undefined>(
		(current, warning) =>
			current === undefined ||
			SEVERITY_RANK[warning.severity] > SEVERITY_RANK[current.severity]
				? warning
				: current,
		undefined,
	);
}

function warningIcon(severity: RunwayWarningSeverity) {
	return severity === "critical"
		? AlertTriangle
		: severity === "warning"
			? CircleAlert
			: Info;
}

function warningSurface(severity: RunwayWarningSeverity): string {
	return severity === "critical"
		? "border-[var(--game-negative)]/50 bg-[var(--game-negative)]/10"
		: severity === "warning"
			? "border-[var(--game-amber)]/50 bg-[var(--game-amber)]/10"
			: "border-primary/35 bg-primary/8";
}

function warningIconColor(severity: RunwayWarningSeverity): string {
	return severity === "critical"
		? "text-[var(--game-negative)]"
		: severity === "warning"
			? "text-[var(--game-amber)]"
			: "text-primary";
}

function warningDotColor(severity: RunwayWarningSeverity): string {
	return severity === "critical"
		? "bg-[var(--game-negative)]"
		: severity === "warning"
			? "bg-[var(--game-amber)]"
			: "bg-primary";
}

function severityLabel(severity: RunwayWarningSeverity): string {
	return severity.charAt(0).toUpperCase() + severity.slice(1);
}
