import {
	type GameState,
	selectAvailableProjects,
	selectTeams,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { CheckCircle2, CircleDashed, OctagonAlert } from "lucide-react";

import ProjectPicker from "@/game/components/project-picker";

export type TeamPanelProps = {
	state: GameState;
	disabled?: boolean;
	onAssign: (teamId: string, projectId: string) => void;
	onCancel: (teamId: string, projectId: string) => void;
};

/** Show each team's real assignment state and the next legal project action. */
export default function TeamPanel({
	state,
	disabled = false,
	onAssign,
	onCancel,
}: TeamPanelProps) {
	const teams = selectTeams(state);
	const availableProjects = selectAvailableProjects(state);
	const completedProjects = state.projects.items.filter(
		(project) => project.status === "completed",
	);

	return (
		<section aria-labelledby="teams-panel-heading" className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.2em]">
						Staffing / projects
					</p>
					<h2
						id="teams-panel-heading"
						className="mt-1 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.1em]"
					>
						Assign the lab's next move
					</h2>
				</div>
				<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
					{availableProjects.length} ready action
					{availableProjects.length === 1 ? "" : "s"}
				</span>
			</div>

			<div className="grid gap-3 xl:grid-cols-2">
				{teams.map((team) => {
					const activeProject = team.activeProjectId
						? state.projects.items.find(
								(project) => project.id === team.activeProjectId,
							)
						: undefined;
					return (
						<article
							className="border border-border bg-background/35 p-3"
							key={team.id}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
										{team.id}
									</p>
									<h3 className="mt-1 truncate font-medium text-foreground text-sm">
										{team.name}
									</h3>
								</div>
								<StatusLabel status={team.status} />
							</div>

							{activeProject ? (
								<ActiveProject
									disabled={disabled}
									onCancel={onCancel}
									project={activeProject}
									state={state}
									teamId={team.id}
								/>
							) : (
								<ProjectPicker
									disabled={disabled}
									onAssign={onAssign}
									state={state}
									teamId={team.id}
								/>
							)}
						</article>
					);
				})}
			</div>

			{completedProjects.length > 0 ? (
				<section
					aria-label="Completed projects"
					className="border-border/70 border-t pt-3"
				>
					<div className="flex items-center gap-2">
						<CheckCircle2
							className="size-3.5 text-[var(--game-positive)]"
							aria-hidden="true"
						/>
						<h3 className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
							Completed / report acknowledgment
						</h3>
					</div>
					<div className="mt-2 flex flex-wrap gap-2">
						{completedProjects.map((project) => (
							<span
								className="border border-[var(--game-positive)]/30 bg-[var(--game-positive)]/5 px-2 py-1 font-mono text-foreground text-xs"
								key={project.id}
							>
								{project.id} · {projectLabel(project.kind)}
							</span>
						))}
					</div>
					<p className="mt-2 text-muted-foreground text-xs leading-5">
						Effects are recorded in Reports. A completed project no longer
						occupies its team.
					</p>
				</section>
			) : null}
		</section>
	);
}

function ActiveProject({
	disabled,
	onCancel,
	project,
	state,
	teamId,
}: {
	disabled: boolean;
	onCancel: (teamId: string, projectId: string) => void;
	project: GameState["projects"]["items"][number];
	state: GameState;
	teamId: string;
}) {
	const remaining = Math.max(1, project.duration - project.progress);
	const completionWeek = state.meta.week + remaining;
	const progress = Math.round((project.progress / project.duration) * 100);
	return (
		<div className="mt-3 space-y-3 border-border/70 border-t pt-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.14em]">
						Active project
					</p>
					<p className="mt-1 font-medium text-foreground text-sm">
						{projectLabel(project.kind)}
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Estimated completion: week {completionWeek}
					</p>
				</div>
				<Button
					aria-label={`Cancel ${projectLabel(project.kind)} for ${teamId}`}
					disabled={disabled}
					onClick={() => onCancel(teamId, project.id)}
					size="xs"
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
			</div>
			<div
				aria-label={`${projectLabel(project.kind)} progress ${progress}%`}
				className="h-1.5 bg-muted"
				role="progressbar"
				aria-valuemax={100}
				aria-valuemin={0}
				aria-valuenow={progress}
			>
				<div
					className="h-full bg-primary transition-[width]"
					style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
				/>
			</div>
			<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.12em]">
				{project.progress} / {project.duration} weeks · {project.id}
			</p>
		</div>
	);
}

function StatusLabel({ status }: { status: "idle" | "working" }) {
	return (
		<span className="inline-flex items-center gap-1.5 border border-border/70 px-2 py-1 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.12em]">
			{status === "idle" ? (
				<CircleDashed
					className="size-3 text-muted-foreground"
					aria-hidden="true"
				/>
			) : (
				<OctagonAlert
					className="size-3 text-[var(--game-amber)]"
					aria-hidden="true"
				/>
			)}
			{status === "idle" ? "Idle" : "Working"}
		</span>
	);
}

function projectLabel(
	kind: GameState["projects"]["items"][number]["kind"],
): string {
	return kind === "infrastructure"
		? "Compute infrastructure"
		: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} work`;
}
