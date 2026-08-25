import type { ProductChannel } from "./products.js";

export type ProjectStatus = "available" | "active" | "completed" | "cancelled";

export type ProjectBase = {
	id: string;
	teamId: string | null;
	status: ProjectStatus;
	progress: number;
	duration: number;
};

export type Project =
	| (ProjectBase & {
			kind: "research";
			nodeId: string;
	  })
	| (ProjectBase & {
			kind: "infrastructure";
			target: "compute";
	  })
	| (ProjectBase & {
			kind: "model";
			modelId: string;
	  })
	| (ProjectBase & {
			kind: "training";
			modelId: string;
	  })
	| (ProjectBase & {
			kind: "evaluation";
			modelId: string;
			evaluation: "capability" | "safety_reliability";
	  })
	| (ProjectBase & {
			kind: "product";
			modelId: string;
			channel: ProductChannel;
	  });

export type ProjectsState = {
	items: Project[];
};

export function createProjectsState(items: Project[] = []): ProjectsState {
	return {
		items: items.map((project) => ({ ...project })),
	};
}

export function assertProjectsState(state: ProjectsState): void {
	const ids: string[] = [];
	for (const project of state.items) {
		assertIdentifier(project.id, "project id");
		if (ids.includes(project.id)) {
			throw new Error(`Duplicate project id: ${project.id}`);
		}
		ids.push(project.id);

		if (project.teamId !== null) {
			assertIdentifier(project.teamId, "project team id");
		}
		if (!Number.isInteger(project.progress) || project.progress < 0) {
			throw new Error(
				`Project ${project.id} progress must be a non-negative integer`,
			);
		}
		if (!Number.isInteger(project.duration) || project.duration < 1) {
			throw new Error(
				`Project ${project.id} duration must be a positive integer`,
			);
		}
		if (project.progress > project.duration) {
			throw new Error(`Project ${project.id} progress cannot exceed duration`);
		}
		if (
			project.status === "active" &&
			(project.teamId === null || project.progress === project.duration)
		) {
			throw new Error(
				`Active project ${project.id} must have an assigned team and unfinished progress`,
			);
		}

		switch (project.kind) {
			case "research":
				assertIdentifier(project.nodeId, "research node id");
				break;
			case "infrastructure":
				break;
			case "model":
			case "training":
			case "evaluation":
			case "product":
				assertIdentifier(project.modelId, "project model id");
				break;
		}
	}
}

function assertIdentifier(value: string, name: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}
