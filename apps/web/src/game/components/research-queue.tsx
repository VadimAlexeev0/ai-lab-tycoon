import {
	type GameState,
	selectResearchNodes,
	selectTeams,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from "@ai-lab-tycoon/ui/components/progress";
import { CheckCircle2, FlaskConical, Play, Users } from "lucide-react";
import { useState } from "react";

export type ResearchQueueProps = {
	disabled?: boolean;
	onAssignProject: (teamId: string, projectId: string) => Promise<boolean>;
	state: GameState;
};

type ResearchProject = Extract<
	GameState["projects"]["items"][number],
	{ kind: "research" }
>;

/** Show active research work and the next legal projects in one queue. */
export default function ResearchQueue({
	disabled = false,
	onAssignProject,
	state,
}: ResearchQueueProps) {
	const [teamSelections, setTeamSelections] = useState<Record<string, string>>(
		{},
	);
	const nodesById = new Map(
		selectResearchNodes(state).map((node) => [node.id, node]),
	);
	const teamsById = new Map(selectTeams(state).map((team) => [team.id, team]));
	const idleTeams = [...teamsById.values()].filter(
		(team) => team.status === "idle",
	);
	const researchProjects = state.projects.items.filter(
		(project): project is ResearchProject => project.kind === "research",
	);
	const activeProjects = researchProjects.filter(
		(project) => project.status === "active",
	);
	const availableProjects = researchProjects.filter(
		(project) => project.status === "available",
	);

	function projectLabel(project: ResearchProject): string {
		return nodesById.get(project.nodeId)?.label ?? humanize(project.nodeId);
	}

	function selectedTeamId(projectId: string): string {
		return teamSelections[projectId] ?? idleTeams[0]?.id ?? "";
	}

	return (
		<section aria-labelledby="research-queue-heading" className="space-y-5">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">Research / queue</p>
					<h2
						id="research-queue-heading"
						className="mt-1 font-display font-semibold text-foreground text-xl"
					>
						Projects in motion
					</h2>
				</div>
				<span className="text-muted-foreground text-xs">
					{activeProjects.length} active · {availableProjects.length} ready
				</span>
			</header>

			<section aria-labelledby="research-active-heading" className="space-y-3">
				<div className="flex items-center gap-2">
					<CheckCircle2
						className="size-4 text-[var(--game-positive)]"
						aria-hidden="true"
					/>
					<h3
						id="research-active-heading"
						className="font-semibold text-foreground text-sm"
					>
						Active research
					</h3>
				</div>
				{activeProjects.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{activeProjects.map((project) => {
							const percentage = progressPercent(project);
							const team =
								project.teamId === null
									? undefined
									: teamsById.get(project.teamId);
							return (
								<article
									aria-label={`${projectLabel(project)} active research project`}
									className="glass-pane space-y-3 p-3"
									key={project.id}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-muted-foreground text-xs">
												{project.id}
											</p>
											<h4 className="mt-1 truncate font-medium text-foreground text-sm">
												{projectLabel(project)}
											</h4>
										</div>
										<FlaskConical
											className="size-4 shrink-0 text-primary"
											aria-hidden="true"
										/>
									</div>
									<Progress
										aria-label={`${projectLabel(project)} research progress`}
										className="gap-1.5"
										value={percentage}
									>
										<ProgressLabel className="text-muted-foreground">
											Progress
										</ProgressLabel>
										<ProgressValue>{() => `${percentage}%`}</ProgressValue>
									</Progress>
									<p className="text-muted-foreground text-xs">
										{project.progress} / {project.duration} weeks
										{team ? ` · ${team.name}` : " · Team pending"}
									</p>
								</article>
							);
						})}
					</div>
				) : (
					<p className="border border-border/70 bg-background/35 px-3 py-3 text-muted-foreground text-xs">
						No research projects are active. Assign a ready project below to
						keep the frontier moving.
					</p>
				)}
			</section>

			<section aria-labelledby="research-ready-heading" className="space-y-3">
				<div className="flex items-center gap-2">
					<Play className="size-4 text-primary" aria-hidden="true" />
					<h3
						id="research-ready-heading"
						className="font-semibold text-foreground text-sm"
					>
						Ready to assign
					</h3>
				</div>
				{availableProjects.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{availableProjects.map((project) => {
							const label = projectLabel(project);
							const teamId = selectedTeamId(project.id);
							return (
								<article
									aria-label={`${label} available research project`}
									className="glass-pane space-y-3 p-3"
									key={project.id}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-muted-foreground text-xs">
												{project.id}
											</p>
											<h4 className="mt-1 truncate font-medium text-foreground text-sm">
												{label}
											</h4>
										</div>
										<span className="text-[var(--game-amber)] text-xs">
											Ready
										</span>
									</div>
									<p className="text-muted-foreground text-xs leading-5">
										Assign an idle team to start this research project.
									</p>
									<label
										className="flex items-center gap-2 text-muted-foreground text-xs"
										htmlFor={`research-queue-team-${project.id}`}
									>
										<Users className="size-3.5 shrink-0" aria-hidden="true" />
										<span className="sr-only">Assign {label} to</span>
										<select
											aria-label={`Assign ${label} to a team`}
											className="h-10 min-w-0 flex-1 border border-input bg-background px-2 text-foreground text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
											disabled={disabled || idleTeams.length === 0}
											id={`research-queue-team-${project.id}`}
											onChange={(event) =>
												setTeamSelections((current) => ({
													...current,
													[project.id]: event.target.value,
												}))
											}
											value={teamId}
										>
											<option value="">Choose an idle team…</option>
											{idleTeams.map((team) => (
												<option key={team.id} value={team.id}>
													{team.name}
												</option>
											))}
										</select>
									</label>
									<Button
										className="w-full"
										disabled={disabled || teamId.length === 0}
										onClick={() => {
											void onAssignProject(teamId, project.id);
										}}
										type="button"
									>
										Assign research project
									</Button>
								</article>
							);
						})}
					</div>
				) : (
					<p className="border border-border/70 bg-background/35 px-3 py-3 text-muted-foreground text-xs">
						No research projects are waiting for assignment.
					</p>
				)}
			</section>
		</section>
	);
}

function progressPercent(project: ResearchProject): number {
	if (project.duration <= 0) return 0;
	return Math.min(
		100,
		Math.max(0, Math.round((project.progress / project.duration) * 100)),
	);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
