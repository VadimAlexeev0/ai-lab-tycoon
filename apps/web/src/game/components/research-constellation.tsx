import {
	type GameState,
	selectResearchNodes,
	type VisibleResearchNode,
} from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { useMemo, useRef } from "react";
import type * as THREE from "three";

import {
	type ThreeModule,
	type ThreeSceneContext,
	useThreeScene,
} from "./three-scene";

const MAX_RESEARCH_NODES = 96;
const MAX_EDGES = MAX_RESEARCH_NODES * 3;

export type ResearchConstellationProps = {
	className?: string;
	state: GameState;
};

type ResearchObjects = {
	colors: Float32Array;
	lineGeometry: THREE.BufferGeometry;
	lineMaterial: THREE.LineBasicMaterial;
	linePositions: Float32Array;
	lines: THREE.LineSegments;
	pointGeometry: THREE.BufferGeometry;
	pointMaterial: THREE.PointsMaterial;
	points: THREE.Points;
	positions: Float32Array;
};

export default function ResearchConstellation({
	className,
	state,
}: ResearchConstellationProps) {
	const nodes = useMemo(
		() => selectResearchNodes(state).slice(0, MAX_RESEARCH_NODES),
		[state],
	);
	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;
	const { canvasRef, hostRef, unavailable } = useThreeScene({
		drawFrame: (context, _now, deltaSeconds) =>
			drawResearchFrame(context, nodesRef.current, deltaSeconds),
		setup: (context) => createResearchObjects(context, nodesRef.current),
	});

	return (
		<div
			ref={hostRef}
			className={cn(
				"relative h-36 min-h-36 w-full min-w-0 overflow-hidden lg:h-48 lg:min-h-48",
				className,
			)}
			data-three-scene="research-constellation"
		>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				tabIndex={-1}
				className="h-full w-full"
			/>
			{unavailable ? (
				<div className="absolute inset-2 flex items-center justify-center rounded-lg border border-[var(--game-hairline)] bg-background/45 px-3">
					<ResearchDataSummary nodes={nodes} />
				</div>
			) : null}
			<div className="sr-only" data-scene-summary="research">
				<p>Research frontier constellation.</p>
				<ResearchDataSummary nodes={nodes} />
			</div>
		</div>
	);
}

function createResearchObjects(
	context: ThreeSceneContext,
	nodes: VisibleResearchNode[],
): () => void {
	const { THREE, root } = context;
	context.camera.position.z = 6.4;
	const positions = new Float32Array(MAX_RESEARCH_NODES * 3);
	const colors = new Float32Array(MAX_RESEARCH_NODES * 3);
	const pointGeometry = new THREE.BufferGeometry();
	pointGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(positions, 3),
	);
	pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	const pointMaterial = new THREE.PointsMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		size: 0.075,
		transparent: true,
		vertexColors: true,
	});
	const points = new THREE.Points(pointGeometry, pointMaterial);
	root.add(points);

	const linePositions = new Float32Array(MAX_EDGES * 6);
	const lineGeometry = new THREE.BufferGeometry();
	lineGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(linePositions, 3),
	);
	const lineMaterial = new THREE.LineBasicMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
	});
	const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
	root.add(lines);

	const objects: ResearchObjects = {
		colors,
		lineGeometry,
		lineMaterial,
		linePositions,
		lines,
		pointGeometry,
		pointMaterial,
		points,
		positions,
	};
	writeResearchGeometry(objects, renderResearchNodes(nodes), context);
	context.root.userData.researchObjects = objects;
	return () => {
		delete context.root.userData.researchObjects;
		pointGeometry.dispose();
		pointMaterial.dispose();
		lineGeometry.dispose();
		lineMaterial.dispose();
	};
}

function drawResearchFrame(
	context: ThreeSceneContext,
	nodes: VisibleResearchNode[],
	deltaSeconds: number,
): void {
	const objects = context.root.userData.researchObjects as
		| ResearchObjects
		| undefined;
	if (objects === undefined) return;
	if (deltaSeconds > 0) {
		context.root.rotation.y += deltaSeconds * 0.028;
		context.root.rotation.x = Math.sin(performance.now() * 0.00015) * 0.035;
	}
	writeResearchGeometry(objects, renderResearchNodes(nodes), context);
}

function renderResearchNodes(
	nodes: VisibleResearchNode[],
): VisibleResearchNode[] {
	if (typeof window === "undefined") return nodes;
	if (!window.matchMedia("(pointer: coarse)").matches) return nodes;
	return nodes.filter((_node, index) => index % 2 === 0);
}

function writeResearchGeometry(
	objects: ResearchObjects,
	nodes: VisibleResearchNode[],
	context: ThreeSceneContext,
): void {
	const { THREE, theme } = context;
	const positionsById = new Map<string, [number, number, number]>();
	for (let index = 0; index < nodes.length; index += 1) {
		const node = nodes[index];
		const position = researchPosition(node, index, nodes.length);
		positionsById.set(node.id, position);
		const offset = index * 3;
		objects.positions[offset] = position[0];
		objects.positions[offset + 1] = position[1];
		objects.positions[offset + 2] = position[2];
		const color = researchColor(node.status, theme, THREE);
		objects.colors[offset] = color.r;
		objects.colors[offset + 1] = color.g;
		objects.colors[offset + 2] = color.b;
	}
	objects.pointGeometry.setDrawRange(0, nodes.length);
	objects.pointGeometry.getAttribute("position").needsUpdate = true;
	objects.pointGeometry.getAttribute("color").needsUpdate = true;
	objects.pointMaterial.color.copy(theme.primary);
	objects.lineMaterial.color.copy(theme.cold);
	objects.lineMaterial.opacity = 0.24;

	let edgeCount = 0;
	for (const node of nodes) {
		const target = positionsById.get(node.id);
		if (target === undefined) continue;
		for (const prerequisite of node.prereqs) {
			if (edgeCount >= MAX_EDGES) break;
			const source = positionsById.get(prerequisite);
			if (source === undefined) continue;
			const offset = edgeCount * 6;
			objects.linePositions[offset] = source[0];
			objects.linePositions[offset + 1] = source[1];
			objects.linePositions[offset + 2] = source[2];
			objects.linePositions[offset + 3] = target[0];
			objects.linePositions[offset + 4] = target[1];
			objects.linePositions[offset + 5] = target[2];
			edgeCount += 1;
		}
	}
	objects.lineGeometry.setDrawRange(0, edgeCount * 2);
	objects.lineGeometry.getAttribute("position").needsUpdate = true;
}

function researchPosition(
	node: VisibleResearchNode,
	index: number,
	total: number,
): [number, number, number] {
	const branchOffset =
		node.branch === "models"
			? -1.55
			: node.branch === "infrastructure"
				? 0
				: 1.55;
	const eraIndex = node.era === "text" ? 0 : node.era === "assistant" ? 1 : 2;
	const column = index % 8;
	const row = Math.floor(index / 8);
	return [
		branchOffset + (column - 3.5) * 0.12,
		1.05 - eraIndex * 0.85 - row * 0.06,
		((index * 13) % Math.max(1, total)) * 0.012 - 0.35,
	];
}

function researchColor(
	status: VisibleResearchNode["status"],
	theme: ThreeSceneContext["theme"],
	THREE: ThreeModule,
): THREE.Color {
	const color = new THREE.Color();
	if (status === "completed") return color.copy(theme.primary);
	if (status === "available")
		return color.copy(theme.amber).multiplyScalar(0.68);
	return color.copy(theme.cold).multiplyScalar(0.08);
}

function ResearchDataSummary({ nodes }: { nodes: VisibleResearchNode[] }) {
	return nodes.length > 0 ? (
		<ul className="space-y-1 text-muted-foreground text-xs">
			{nodes.map((node) => (
				<li className="flex items-center justify-between gap-3" key={node.id}>
					<span className="truncate">{node.label}</span>
					<span className="numeric-value shrink-0">
						{node.status} · {node.insightCost} insight
					</span>
				</li>
			))}
		</ul>
	) : (
		<p className="text-muted-foreground text-xs">
			Research frontier is initializing.
		</p>
	);
}
