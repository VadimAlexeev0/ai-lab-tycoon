import { startRun } from "@ai-lab-tycoon/engine";
import { describe, expect, it } from "vitest";

import {
	createResearchLayout,
	detectExclusiveGroups,
	type ResearchLayoutState,
} from "./research-layout";

type FixtureNode = ResearchLayoutState["research"]["nodes"][number];

function node(
	id: string,
	options: Partial<Omit<FixtureNode, "id">> = {},
): FixtureNode {
	return {
		branch: "models",
		era: "text",
		insightCost: 1,
		prerequisites: [],
		status: "locked",
		...options,
		id,
	};
}

function state(
	nodes: FixtureNode[],
	currentEra: ResearchLayoutState["research"]["currentEra"] = "text",
) {
	return { research: { currentEra, nodes } } satisfies ResearchLayoutState;
}

describe("research lattice layout", () => {
	it("places eras on x, branch lanes on y, and explicit topological depth on z", () => {
		const fixture = state([
			node("root", { branch: "models" }),
			node("infra", { branch: "infrastructure" }),
			node("child", { prerequisites: ["root"], branch: "models" }),
			node("future", {
				era: "assistant",
				branch: "products_safety",
				prerequisites: ["child"],
			}),
		]);

		const first = createResearchLayout(fixture, {
			depthStep: 10,
			eraStep: 100,
			laneStep: 20,
		});
		const second = createResearchLayout(fixture, {
			depthStep: 10,
			eraStep: 100,
			laneStep: 20,
		});
		const byId = new Map(
			first.nodes.map((positioned) => [positioned.id, positioned]),
		);

		expect(first).toEqual(second);
		expect(byId.get("root")).toMatchObject({
			x: 0,
			y: -336,
			z: 0,
			lane: "models",
		});
		expect(byId.get("infra")).toMatchObject({
			x: 0,
			y: 0,
			z: 0,
			lane: "infrastructure",
		});
		expect(byId.get("child")).toMatchObject({ x: 0, y: -224, z: 10 });
		expect(byId.get("future")).toMatchObject({
			era: "assistant",
			x: 100,
			y: 224,
			z: 0,
		});
		expect(first.edges).toEqual([
			{ from: "root", to: "child", isDivergence: false, isExclusive: false },
			{ from: "child", to: "future", isDivergence: false, isExclusive: false },
		]);
	});

	it("keeps flat x/y coordinates unique for same-era nodes", () => {
		const fixture = state([
			node("root_a"),
			node("root_b"),
			node("child_a", { prerequisites: ["root_a"] }),
			node("child_b", { prerequisites: ["root_b"] }),
		]);

		const layout = createResearchLayout(fixture, {
			depthStep: 10,
			laneStep: 20,
		});
		const coordinates = layout.nodes.map(
			(positioned) => `${positioned.x}:${positioned.y}`,
		);

		expect(new Set(coordinates).size).toBe(layout.nodes.length);
	});

	it("keeps the shipped research catalog unique in a flat projection", () => {
		const layout = createResearchLayout(
			startRun({ companyName: "Acme Labs" }, 42),
		);
		const coordinates = layout.nodes.map(
			(positioned) => `${positioned.x}:${positioned.y}`,
		);

		expect(layout.nodes.length).toBeGreaterThan(0);
		expect(new Set(coordinates).size).toBe(layout.nodes.length);
	});

	it("uses a Kahn topological pass and rejects cycles instead of memoizing through them", () => {
		const fixture = state([
			node("a", { prerequisites: ["b"] }),
			node("b", { prerequisites: ["a"] }),
		]);

		expect(() => createResearchLayout(fixture)).toThrow(/cycle|topolog/i);
	});

	it("fails loudly when a node introduces an unknown era", () => {
		const fixture = state([
			node("mystery", { era: "quantum" as FixtureNode["era"] }),
		]);

		expect(() => createResearchLayout(fixture)).toThrow(
			/unknown research era/i,
		);
	});

	it("projects active research into in-progress and recognizes boundary keystones", () => {
		const fixture = {
			...state([
				node("text_models_keystone", { status: "completed" }),
				node("active", { status: "available" }),
			]),
			projects: {
				items: [
					{
						kind: "research" as const,
						id: "project_001",
						teamId: "team_001",
						status: "active" as const,
						progress: 1,
						duration: 2,
						nodeId: "active",
					},
				],
			},
		} satisfies ResearchLayoutState;

		const layout = createResearchLayout(fixture);
		expect(
			layout.nodes.find((item) => item.id === "text_models_keystone"),
		).toMatchObject({
			isKeystone: true,
			status: "completed",
		});
		expect(layout.nodes.find((item) => item.id === "active")).toMatchObject({
			isKeystone: false,
			status: "in-progress",
		});
	});
});

describe("exclusive research paths", () => {
	it("detects an explicit sibling fork and marks its divergence edges", () => {
		const fixture = state([
			node("root"),
			node("capability", {
				exclusiveGroup: "strategy",
				prerequisites: ["root"],
			}),
			node("efficiency", {
				exclusiveGroup: "strategy",
				prerequisites: ["root"],
			}),
		]);

		const layout = createResearchLayout(fixture);
		const exclusive = layout.nodes.filter(
			(item) => item.exclusiveGroup === "strategy",
		);

		expect(exclusive.map((item) => item.id)).toEqual([
			"capability",
			"efficiency",
		]);
		expect(layout.edges).toContainEqual({
			from: "root",
			to: "capability",
			exclusiveGroup: "strategy",
			isDivergence: true,
			isExclusive: true,
		});
	});

	it("marks the unchosen branch locked-out after a completed commitment", () => {
		const fixture = state([
			node("root", { status: "completed" }),
			node("left", {
				exclusiveGroup: "strategy",
				status: "completed",
				prerequisites: ["root"],
			}),
			node("right", {
				exclusiveGroup: "strategy",
				status: "locked",
				prerequisites: ["root"],
			}),
			node("right_child", { prerequisites: ["right"] }),
		]);

		const layout = createResearchLayout(fixture);
		const byId = new Map(layout.nodes.map((item) => [item.id, item]));

		expect(byId.get("left")).toMatchObject({ status: "completed" });
		expect(byId.get("right")).toMatchObject({
			exclusiveGroup: "strategy",
			status: "locked-out",
		});
		expect(byId.get("right_child")).toMatchObject({ status: "locked-out" });
	});

	it("derives a mutually-unreachable two-way fork when explicitly requested", () => {
		const fixture = state([
			node("root"),
			node("left", { prerequisites: ["root"] }),
			node("left_end", { prerequisites: ["left"] }),
			node("right", { prerequisites: ["root"] }),
			node("right_end", { prerequisites: ["right"] }),
		]);

		const groups = detectExclusiveGroups(fixture.research.nodes, {
			deriveStructural: true,
		});

		expect(groups).toEqual([
			expect.objectContaining({
				memberIds: ["left", "right"],
				parentIds: ["root"],
			}),
		]);
	});
});
