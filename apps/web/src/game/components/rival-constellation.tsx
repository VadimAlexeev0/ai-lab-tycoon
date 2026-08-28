import {
	type GameState,
	selectRivals,
	type VisibleRival,
} from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { useMemo, useRef } from "react";
import type * as THREE from "three";

import {
	createGlowTexture,
	type ThreeSceneContext,
	useThreeScene,
} from "./three-scene";

const MAX_RIVALS = 3;

export type RivalConstellationProps = {
	className?: string;
	state: GameState;
};

export function getRivalArchetypePosition(archetype: string): number {
	switch (archetype) {
		case "hacker":
			return -1;
		case "operator":
			return 1;
		default:
			return 0;
	}
}

type RivalObjects = {
	centralMaterial: THREE.SpriteMaterial;
	centralNode: THREE.Sprite;
	glowTexture: THREE.CanvasTexture;
	lineGeometry: THREE.BufferGeometry;
	lineMaterial: THREE.LineBasicMaterial;
	lines: THREE.LineSegments;
	linePositions: Float32Array;
	starMaterials: THREE.SpriteMaterial[];
	stars: THREE.Sprite[];
};

export default function RivalConstellation({
	className,
	state,
}: RivalConstellationProps) {
	const rivals = useMemo(
		() => selectRivals(state).slice(0, MAX_RIVALS),
		[state],
	);
	const rivalsRef = useRef(rivals);
	rivalsRef.current = rivals;
	const { canvasRef, hostRef, unavailable } = useThreeScene({
		drawFrame: (context, now, deltaSeconds) =>
			drawRivalFrame(context, rivalsRef.current, now, deltaSeconds),
		interactive: true,
		setup: (context) => createRivalObjects(context),
	});

	return (
		<div
			ref={hostRef}
			className={cn(
				"relative h-40 min-h-40 w-full min-w-0 overflow-hidden sm:h-52 sm:min-h-52",
				className,
			)}
			data-three-scene="rival-constellation"
		>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				tabIndex={-1}
				className="h-full w-full"
			/>
			{unavailable ? (
				<div className="absolute inset-2 flex items-center justify-center rounded-lg border border-[var(--game-hairline)] bg-background/45 px-3">
					<RivalDataSummary rivals={rivals} />
				</div>
			) : null}
			<div className="sr-only" data-scene-summary="rivals">
				<p>Rival constellation. Your lab is the central node.</p>
				<RivalDataSummary rivals={rivals} />
			</div>
		</div>
	);
}

function createRivalObjects(context: ThreeSceneContext): () => void {
	const { THREE, root } = context;
	context.camera.position.z = 5.6;
	const glowTexture = createGlowTexture(THREE);
	const starMaterials = Array.from(
		{ length: MAX_RIVALS },
		() =>
			new THREE.SpriteMaterial({
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				map: glowTexture,
				transparent: true,
			}),
	);
	const stars = starMaterials.map((material) => {
		const star = new THREE.Sprite(material);
		root.add(star);
		return star;
	});
	const centralMaterial = new THREE.SpriteMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		map: glowTexture,
		transparent: true,
	});
	const centralNode = new THREE.Sprite(centralMaterial);
	root.add(centralNode);

	const linePositions = new Float32Array(MAX_RIVALS * 2 * 3);
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

	const objects: RivalObjects = {
		centralMaterial,
		centralNode,
		glowTexture,
		lineGeometry,
		lineMaterial,
		lines,
		linePositions,
		starMaterials,
		stars,
	};
	root.userData.rivalObjects = objects;
	return () => {
		delete root.userData.rivalObjects;
		disposeRivalObjects(objects);
	};
}

function drawRivalFrame(
	context: ThreeSceneContext,
	rivals: VisibleRival[],
	now: number,
	deltaSeconds: number,
): void {
	const { root, theme } = context;
	const objects = getRivalObjects(root);
	if (objects === null) return;
	if (deltaSeconds > 0) {
		root.rotation.z += deltaSeconds * 0.025;
		root.rotation.y += deltaSeconds * 0.015;
	}

	const leaderIndex = rivals.reduce(
		(current, rival, index) =>
			current === -1 || rival.progress > rivals[current].progress
				? index
				: current,
		-1,
	);
	objects.centralMaterial.color.copy(theme.primary);
	objects.centralMaterial.opacity = 0.82;
	objects.centralNode.position.set(0, 0, 0);
	objects.centralNode.scale.setScalar(0.2 + Math.sin(now * 0.002) * 0.015);
	objects.lineMaterial.color.copy(theme.primary);
	objects.lineMaterial.opacity = 0.28;

	for (let index = 0; index < MAX_RIVALS; index += 1) {
		const rival = rivals[index];
		const star = objects.stars[index];
		const material = objects.starMaterials[index];
		const positionOffset = index === 1 && rivals.length === 3 ? 0 : 0.12;
		if (rival === undefined) {
			star.visible = false;
			writeLine(objects.linePositions, index, 0, 0, 0, 0, 0, 0);
			continue;
		}
		star.visible = true;
		const progress = Math.min(100, Math.max(0, rival.progress));
		const x = getRivalArchetypePosition(rival.archetype) * 1.45;
		const y = (index - (rivals.length - 1) / 2) * 0.34 + positionOffset;
		star.position.set(x, y, 0);
		const leaderPulse =
			index === leaderIndex ? 1 + Math.sin(now * 0.004) * 0.16 : 1;
		star.scale.setScalar((0.16 + progress * 0.0022) * leaderPulse);
		material.color.copy(colorForRival(rival.archetype, theme));
		material.opacity = 0.3 + progress * 0.007;
		writeLine(objects.linePositions, index, 0, 0, 0, x, y, 0);
	}
	objects.lineGeometry.setDrawRange(0, rivals.length * 2);
	const positionAttribute = objects.lineGeometry.getAttribute("position");
	positionAttribute.needsUpdate = true;
}

function getRivalObjects(root: THREE.Group): RivalObjects | null {
	return (root.userData.rivalObjects as RivalObjects | undefined) ?? null;
}

function writeLine(
	positions: Float32Array,
	index: number,
	x1: number,
	y1: number,
	z1: number,
	x2: number,
	y2: number,
	z2: number,
): void {
	const offset = index * 6;
	positions[offset] = x1;
	positions[offset + 1] = y1;
	positions[offset + 2] = z1;
	positions[offset + 3] = x2;
	positions[offset + 4] = y2;
	positions[offset + 5] = z2;
}

function colorForRival(
	archetype: string,
	theme: ThreeSceneContext["theme"],
): THREE.Color {
	if (archetype === "mogul") return theme.amber;
	if (archetype === "operator") return theme.positive;
	return theme.primary;
}

function disposeRivalObjects(objects: RivalObjects): void {
	objects.lineGeometry.dispose();
	objects.lineMaterial.dispose();
	objects.starMaterials.forEach((material) => {
		material.dispose();
	});
	objects.centralMaterial.dispose();
	objects.glowTexture.dispose();
}

function RivalDataSummary({ rivals }: { rivals: VisibleRival[] }) {
	return rivals.length > 0 ? (
		<ul className="space-y-1 text-muted-foreground text-xs">
			{rivals.map((rival) => (
				<li className="flex items-center justify-between gap-3" key={rival.id}>
					<span className="truncate">{rival.name}</span>
					<span className="numeric-value shrink-0">
						{Math.round(rival.progress)}%
					</span>
				</li>
			))}
		</ul>
	) : (
		<p className="text-muted-foreground text-xs">No active rival clocks.</p>
	);
}
