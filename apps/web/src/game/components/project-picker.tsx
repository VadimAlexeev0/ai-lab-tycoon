import {
	type GameState,
	selectAvailableProjects,
	type VisibleAvailableProject,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

export type ProjectPickerProps = {
	state: GameState;
	teamId: string;
	disabled?: boolean;
	onAssign: (teamId: string, projectId: string) => void;
};

/** A compact, keyboard-friendly chooser for projects that are ready to start. */
export default function ProjectPicker({
	state,
	teamId,
	disabled = false,
	onAssign,
}: ProjectPickerProps) {
	const selectId = useId();
	const availableProjects = selectAvailableProjects(state);
	const [selectedProjectId, setSelectedProjectId] = useState(
		availableProjects[0]?.id ?? "",
	);
	const selectedProject = availableProjects.find(
		(project) => project.id === selectedProjectId,
	);

	if (availableProjects.length === 0) {
		return (
			<p className="border border-border/70 bg-background/40 px-3 py-2 text-muted-foreground text-xs leading-5">
				No projects are ready for assignment. Advance the week to reveal the
				next research action.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2 border-border/70 border-t pt-3 sm:flex-row sm:items-end">
			<div className="min-w-0 flex-1 space-y-1.5">
				<label
					className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]"
					htmlFor={selectId}
				>
					Assign a project
				</label>
				<select
					aria-label="Choose a project for this team"
					className="h-8 w-full min-w-0 border border-input bg-background px-2 text-foreground text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
					disabled={disabled}
					id={selectId}
					onChange={(event) => setSelectedProjectId(event.target.value)}
					required
					value={selectedProjectId}
				>
					{availableProjects.map((project) => (
						<option key={project.id} value={project.id}>
							{projectLabel(project)} · {project.duration} wk
						</option>
					))}
				</select>
				{selectedProject ? (
					<p className="text-muted-foreground text-xs leading-4">
						{projectDescription(selectedProject)}
					</p>
				) : null}
			</div>
			<Button
				aria-label={
					selectedProject
						? `Start ${projectLabel(selectedProject)} for ${teamId}`
						: "Start selected project"
				}
				disabled={disabled || selectedProject === undefined}
				onClick={() => {
					if (selectedProject !== undefined) {
						onAssign(teamId, selectedProject.id);
					}
				}}
				size="sm"
				type="button"
			>
				Start
				<ArrowRight data-icon="inline-end" aria-hidden="true" />
			</Button>
		</div>
	);
}

function projectLabel(project: VisibleAvailableProject): string {
	switch (project.kind) {
		case "research":
			return `Research · ${humanize(project.nodeId)}`;
		case "infrastructure":
			return "Infrastructure · Compute";
		case "model":
			return `Model project · ${humanize(project.modelId)}`;
		case "training":
			return `Training · ${humanize(project.modelId)}`;
		case "evaluation":
			return `Evaluation · ${humanize(project.modelId)}`;
		case "product":
			return `Product · ${channelLabel(project.channel)}`;
	}
}

function projectDescription(project: VisibleAvailableProject): string {
	switch (project.kind) {
		case "research":
			return `Costs Insight when assigned. ${project.duration} week project.`;
		case "infrastructure":
			return "Expands permanent compute capacity when completed.";
		case "model":
			return "Builds the selected model design.";
		case "training":
			return "Consumes training capacity while the team works.";
		case "evaluation":
			return `${project.evaluation === "capability" ? "Capability" : "Safety / reliability"} evaluation.`;
		case "product":
			return `${channelLabel(project.channel)} launch preparation.`;
	}
}

function channelLabel(
	channel: "chat" | "developer_api" | "enterprise",
): string {
	return channel === "developer_api"
		? "Developer API"
		: channel.charAt(0).toUpperCase() + channel.slice(1);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
