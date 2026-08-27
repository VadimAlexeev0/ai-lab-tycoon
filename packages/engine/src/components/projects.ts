import {
	assertArray,
	assertEnum,
	assertExactObject,
	assertIdentifier,
	assertInteger,
	assertNullableString,
	assertObject,
} from "../validation.js";
import type { ProductChannel } from "./products.js";

export type ProjectStatus = "available" | "active" | "completed" | "cancelled";

export type ProjectKind =
	| "research"
	| "infrastructure"
	| "model"
	| "training"
	| "evaluation"
	| "product";

const PROJECT_KINDS = [
	"research",
	"infrastructure",
	"model",
	"training",
	"evaluation",
	"product",
] as const satisfies readonly ProjectKind[];
const PROJECT_STATUSES = [
	"available",
	"active",
	"completed",
	"cancelled",
] as const satisfies readonly ProjectStatus[];
const PRODUCT_CHANNELS = [
	"chat",
	"developer_api",
	"enterprise",
] as const satisfies readonly ProductChannel[];
const EVALUATION_KINDS = ["capability", "safety_reliability"] as const;

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

export function assertProjectsState(
	value: unknown,
): asserts value is ProjectsState {
	assertExactObject(value, ["items"], "projects");
	assertArray(value.items, "Projects items");

	const ids = new Set<string>();
	for (const item of value.items) {
		assertObject(item, "project");
		assertEnum(item.kind, PROJECT_KINDS, "Project kind");
		const kind = item.kind;

		switch (kind) {
			case "research":
				assertExactObject(
					item,
					["kind", "id", "teamId", "status", "progress", "duration", "nodeId"],
					"research project",
				);
				break;
			case "infrastructure":
				assertExactObject(
					item,
					["kind", "id", "teamId", "status", "progress", "duration", "target"],
					"infrastructure project",
				);
				break;
			case "model":
			case "training":
				assertExactObject(
					item,
					["kind", "id", "teamId", "status", "progress", "duration", "modelId"],
					`${kind} project`,
				);
				break;
			case "evaluation":
				assertExactObject(
					item,
					[
						"kind",
						"id",
						"teamId",
						"status",
						"progress",
						"duration",
						"modelId",
						"evaluation",
					],
					"evaluation project",
				);
				break;
			case "product":
				assertExactObject(
					item,
					[
						"kind",
						"id",
						"teamId",
						"status",
						"progress",
						"duration",
						"modelId",
						"channel",
					],
					"product project",
				);
				break;
		}

		assertProjectBase(item, ids);
		switch (kind) {
			case "research":
				assertIdentifier(item.nodeId, "Research project node id");
				break;
			case "infrastructure":
				assertEnum(item.target, ["compute"], "Infrastructure project target");
				break;
			case "model":
			case "training":
				assertIdentifier(item.modelId, `${kind} project model id`);
				break;
			case "evaluation":
				assertIdentifier(item.modelId, "Evaluation project model id");
				assertEnum(item.evaluation, EVALUATION_KINDS, "Evaluation kind");
				break;
			case "product":
				assertIdentifier(item.modelId, "Product project model id");
				assertEnum(item.channel, PRODUCT_CHANNELS, "Product project channel");
				break;
		}
	}
}

function assertProjectBase(
	value: Record<string, unknown>,
	ids: Set<string>,
): void {
	assertIdentifier(value.id, "Project id");
	if (ids.has(value.id)) {
		throw new Error(`Duplicate project id: ${value.id}`);
	}
	ids.add(value.id);

	assertNullableString(value.teamId, "Project team id");
	if (value.teamId !== null) {
		assertIdentifier(value.teamId, "Project team id");
	}
	assertEnum(value.status, PROJECT_STATUSES, "Project status");
	assertInteger(value.progress, `Project ${value.id} progress`);
	if (value.progress < 0) {
		throw new Error(`Project ${value.id} progress must be non-negative`);
	}
	assertInteger(value.duration, `Project ${value.id} duration`);
	if (value.duration < 1) {
		throw new Error(`Project ${value.id} duration must be positive`);
	}
	if (value.progress > value.duration) {
		throw new Error(`Project ${value.id} progress cannot exceed duration`);
	}

	if (value.status === "available" && value.teamId !== null) {
		throw new Error(`Available project ${value.id} cannot have a team`);
	}
	if (value.status === "active") {
		if (value.teamId === null || value.progress === value.duration) {
			throw new Error(
				`Active project ${value.id} must have an assigned team and unfinished progress`,
			);
		}
	}
	if (value.status === "completed" && value.progress !== value.duration) {
		throw new Error(`Completed project ${value.id} must reach its duration`);
	}
}
