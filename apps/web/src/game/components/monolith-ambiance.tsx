import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { useEffect, useRef } from "react";
import type * as THREE from "three";

import {
	createGlowTexture,
	type ThreeSceneContext,
	useThreeScene,
} from "./three-scene";

const MONOLITH_COUNT = 3;

type MonolithObjects = {
	dustGeometry: THREE.BufferGeometry;
	dustMaterial: THREE.PointsMaterial;
	dustPoints: THREE.Points;
	seed: THREE.Sprite;
	seedMaterial: THREE.SpriteMaterial;
	seedTexture: THREE.CanvasTexture;
	slabGeometries: THREE.BoxGeometry[];
	slabMaterials: THREE.MeshBasicMaterial[];
	slabs: THREE.Mesh[];
};

export type MonolithAmbianceProps = {
	className?: string;
};

export default function MonolithAmbiance({ className }: MonolithAmbianceProps) {
	const pointerXRef = useRef(0);
	const pointerYRef = useRef(0);
	const { canvasRef, hostRef, unavailable } = useThreeScene({
		drawFrame: (context, now, deltaSeconds) =>
			drawMonolithFrame(
				context,
				pointerXRef.current,
				pointerYRef.current,
				now,
				deltaSeconds,
			),
		setup: (context) => createMonolithObjects(context),
	});

	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			pointerXRef.current =
				(event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
			pointerYRef.current =
				(event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
		};
		window.addEventListener("pointermove", onPointerMove, { passive: true });
		return () => window.removeEventListener("pointermove", onPointerMove);
	}, []);

	return (
		<div
			ref={hostRef}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 -z-10 overflow-hidden",
				className,
			)}
			data-three-scene="monolith-ambiance"
		>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				tabIndex={-1}
				className="h-full w-full"
			/>
			{unavailable ? (
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,color-mix(in_srgb,var(--game-amber)_8%,transparent),transparent_42%)]" />
			) : null}
			<div className="sr-only" data-scene-summary="monolith">
				Ambient monolith atmosphere. Content remains available without WebGL.
			</div>
		</div>
	);
}

function createMonolithObjects(context: ThreeSceneContext): () => void {
	const { THREE, root } = context;
	context.camera.position.z = 6.2;
	const slabGeometries = Array.from(
		{ length: MONOLITH_COUNT },
		() => new THREE.BoxGeometry(0.85, 1.7, 0.28),
	);
	const slabMaterials = slabGeometries.map(
		() =>
			new THREE.MeshBasicMaterial({
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				opacity: 0.18,
				transparent: true,
				wireframe: true,
			}),
	);
	const slabs = slabGeometries.map((geometry, index) => {
		const slab = new THREE.Mesh(geometry, slabMaterials[index]);
		slab.position.set(
			(index - 1) * 1.55,
			index === 1 ? 0.1 : -0.08,
			index * -0.35,
		);
		slab.rotation.set(0.08 * index, index * 0.28, (index - 1) * 0.08);
		root.add(slab);
		return slab;
	});

	const coarse = window.matchMedia("(pointer: coarse)").matches;
	const dustCount = coarse ? 18 : 36;
	const dustPositions = new Float32Array(dustCount * 3);
	for (let index = 0; index < dustCount; index += 1) {
		dustPositions[index * 3] = THREE.MathUtils.randFloatSpread(6.2);
		dustPositions[index * 3 + 1] = THREE.MathUtils.randFloatSpread(3.2);
		dustPositions[index * 3 + 2] = THREE.MathUtils.randFloatSpread(2.4) - 0.5;
	}
	const dustGeometry = new THREE.BufferGeometry();
	dustGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(dustPositions, 3),
	);
	const dustMaterial = new THREE.PointsMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		size: 0.025,
		transparent: true,
	});
	const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
	root.add(dustPoints);

	const seedTexture = createGlowTexture(THREE);
	const seedMaterial = new THREE.SpriteMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
	});
	seedMaterial.map = seedTexture;
	const seed = new THREE.Sprite(seedMaterial);
	seed.position.set(1.55, 0.82, 0.25);
	seed.scale.setScalar(0.75);
	root.add(seed);

	const objects: MonolithObjects = {
		dustGeometry,
		dustMaterial,
		dustPoints,
		seed,
		seedMaterial,
		seedTexture,
		slabGeometries,
		slabMaterials,
		slabs,
	};
	root.userData.monolithObjects = objects;
	return () => {
		delete root.userData.monolithObjects;
		slabGeometries.forEach((geometry) => {
			geometry.dispose();
		});
		slabMaterials.forEach((material) => {
			material.dispose();
		});
		dustGeometry.dispose();
		dustMaterial.dispose();
		seedTexture.dispose();
		seedMaterial.dispose();
	};
}

function drawMonolithFrame(
	context: ThreeSceneContext,
	pointerX: number,
	pointerY: number,
	now: number,
	deltaSeconds: number,
): void {
	const objects = context.root.userData.monolithObjects as
		| MonolithObjects
		| undefined;
	if (objects === undefined) return;
	const { root, theme } = context;
	if (deltaSeconds > 0) {
		objects.slabs.forEach((slab, index) => {
			slab.rotation.y += deltaSeconds * (0.035 + index * 0.012);
			slab.position.y += Math.sin(now * 0.00035 + index) * deltaSeconds * 0.01;
		});
		objects.dustPoints.rotation.y += deltaSeconds * 0.018;
	}
	root.position.x += (pointerX * 0.06 - root.position.x) * 0.04;
	root.position.y += (-pointerY * 0.04 - root.position.y) * 0.04;
	objects.slabMaterials.forEach((material, index) => {
		material.color.copy(theme.cold);
		material.opacity = 0.14 + index * 0.025;
	});
	objects.dustMaterial.color.copy(theme.cold);
	objects.dustMaterial.opacity = 0.12;
	objects.seedMaterial.color.copy(theme.amber);
	objects.seedMaterial.opacity = 0.12 + (Math.sin(now * 0.002) + 1) * 0.025;
	objects.seed.scale.setScalar(0.7 + (Math.sin(now * 0.002) + 1) * 0.06);
}
