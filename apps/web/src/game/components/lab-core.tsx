import { type GameState, selectResourceBar } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";

import {
	createGlowTexture,
	createThreeSceneRuntime,
	type ThreeModule,
	type ThreeSceneContext,
	type ThreeSceneRuntime,
} from "./three-scene";

const FLASH_DURATION_MS = 900;

export type LabCoreVisualState = {
	computeShortage: boolean;
	lost: boolean;
	milestoneKey: string;
	trainingActive: boolean;
};

type LabCoreProps = {
	className?: string;
	state: GameState;
};

type LabCoreObjects = {
	accentColor: THREE.Color;
	core: THREE.Mesh;
	coreColor: THREE.Color;
	coreGeometry: THREE.SphereGeometry;
	coreMaterial: THREE.MeshBasicMaterial;
	glow: THREE.Sprite;
	glowMaterial: THREE.SpriteMaterial;
	glowTexture: THREE.CanvasTexture;
	ringGeometry: THREE.BufferGeometry;
	ringLine: THREE.LineLoop;
	ringLineGeometry: THREE.BufferGeometry;
	ringLineMaterial: THREE.LineBasicMaterial;
	ringMaterial: THREE.PointsMaterial;
	ringParticles: THREE.Points;
	shell: THREE.Mesh;
	shellGeometry: THREE.IcosahedronGeometry;
	shellMaterial: THREE.MeshBasicMaterial;
};

/** Project engine state into the small set of signals the hologram needs. */
export function getLabCoreVisualState(state: GameState): LabCoreVisualState {
	const resources = selectResourceBar(state);
	const evaluationDemand =
		state.projects.items.filter(
			(project) => project.kind === "evaluation" && project.status === "active",
		).length * 2;
	const totalDemand =
		resources.compute.trainingDemand +
		resources.compute.servingDemand +
		evaluationDemand;
	const computeShortage =
		totalDemand > resources.compute.capacity ||
		state.warnings.some((warning) => warning.code === "compute_shortage");
	const trainingActive =
		resources.compute.trainingDemand > 0 ||
		state.projects.items.some(
			(project) => project.kind === "training" && project.status === "active",
		);
	const latestMilestone = [...state.reports.items]
		.reverse()
		.find((report) => report.fact.kind === "milestone_reached");

	return {
		computeShortage,
		lost: state.terminal.status === "lost",
		milestoneKey: [
			state.meta.era,
			state.research.currentEra,
			state.terminal.frontierReached ? "frontier-reached" : "frontier-pending",
			latestMilestone?.id ?? "no-milestone",
		].join(":"),
		trainingActive,
	};
}

export default function LabCore({ className, state }: LabCoreProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const visualRef = useRef<LabCoreVisualState>(getLabCoreVisualState(state));
	const previousMilestoneKeyRef = useRef<string | null>(null);
	const flashUntilRef = useRef(0);
	const reducedMotionRef = useRef(false);
	const renderRef = useRef<(() => void) | null>(null);
	const [unavailable, setUnavailable] = useState(false);
	const visual = useMemo(() => getLabCoreVisualState(state), [state]);

	useEffect(() => {
		const previousMilestoneKey = previousMilestoneKeyRef.current;
		previousMilestoneKeyRef.current = visual.milestoneKey;
		visualRef.current = visual;
		if (
			previousMilestoneKey !== null &&
			previousMilestoneKey !== visual.milestoneKey &&
			!visual.lost &&
			!reducedMotionRef.current
		) {
			flashUntilRef.current = performance.now() + FLASH_DURATION_MS;
		}
		renderRef.current?.();
	}, [visual]);

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		if (host === null || canvas === null) return;

		let runtime: ThreeSceneRuntime | null = null;
		let disposed = false;
		const markUnavailable = () => {
			if (disposed) return;
			setUnavailable(true);
		};

		void import("./three-core")
			.then((module) => {
				if (disposed) return;
				const THREE = module as unknown as ThreeModule;
				try {
					let objects: LabCoreObjects | null = null;
					runtime = createThreeSceneRuntime({
						THREE,
						canvas,
						drawFrame: (context, now, deltaSeconds) => {
							if (objects !== null) {
								drawLabCoreFrame(
									context,
									objects,
									flashUntilRef,
									visualRef,
									now,
									deltaSeconds,
								);
							}
						},
						host,
						interactive: true,
						reducedMotionRef,
						setup: (context) => {
							objects = createLabCoreObjects(context);
							return () => {
								if (objects !== null) disposeLabCoreObjects(objects);
								objects = null;
							};
						},
					});
				} catch {
					markUnavailable();
					return;
				}

				renderRef.current = runtime.render;
			})
			.catch(markUnavailable);

		return () => {
			disposed = true;
			renderRef.current = null;
			runtime?.dispose();
		};
	}, []);

	return (
		<div
			ref={hostRef}
			className={cn(
				"relative h-36 min-h-36 w-full min-w-0 overflow-hidden sm:h-56 sm:min-h-56",
				className,
			)}
		>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				tabIndex={-1}
				className="h-full w-full"
			/>
			{unavailable ? (
				<p className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-center text-muted-foreground text-xs">
					The live core visualization is unavailable; the lab status remains in
					the surrounding panel.
				</p>
			) : null}
			<p className="sr-only">{labCoreSummary(visual)}</p>
		</div>
	);
}

function createLabCoreObjects(context: ThreeSceneContext): LabCoreObjects {
	const { THREE, root } = context;
	root.rotation.x = -0.12;

	const shellGeometry = new THREE.IcosahedronGeometry(1.2, 1);
	const shellMaterial = new THREE.MeshBasicMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
		wireframe: true,
	});
	const shell = new THREE.Mesh(shellGeometry, shellMaterial);
	root.add(shell);

	const coreGeometry = new THREE.SphereGeometry(0.58, 28, 20);
	const coreMaterial = new THREE.MeshBasicMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
	});
	const core = new THREE.Mesh(coreGeometry, coreMaterial);
	root.add(core);

	const glowTexture = createGlowTexture(THREE);
	const glowMaterial = new THREE.SpriteMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		map: glowTexture,
		transparent: true,
	});
	const glow = new THREE.Sprite(glowMaterial);
	glow.scale.setScalar(2.2);
	root.add(glow);

	const ringGeometry = createParticleRingGeometry(THREE);
	const ringMaterial = new THREE.PointsMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		size: 0.06,
		sizeAttenuation: true,
		transparent: true,
	});
	const ringParticles = new THREE.Points(ringGeometry, ringMaterial);
	ringParticles.rotation.x = 0.32;
	root.add(ringParticles);

	const ringLineGeometry = createRingLineGeometry(THREE);
	const ringLineMaterial = new THREE.LineBasicMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
	});
	const ringLine = new THREE.LineLoop(ringLineGeometry, ringLineMaterial);
	ringLine.rotation.x = 0.32;
	root.add(ringLine);

	return {
		accentColor: new THREE.Color(),
		core,
		coreColor: new THREE.Color(),
		coreGeometry,
		coreMaterial,
		glow,
		glowMaterial,
		glowTexture,
		ringGeometry,
		ringLine,
		ringLineGeometry,
		ringLineMaterial,
		ringMaterial,
		ringParticles,
		shell,
		shellGeometry,
		shellMaterial,
	};
}

function drawLabCoreFrame(
	context: ThreeSceneContext,
	objects: LabCoreObjects,
	flashUntilRef: { current: number },
	visualRef: { current: LabCoreVisualState },
	now: number,
	deltaSeconds: number,
): void {
	const { pointer, root, theme, THREE } = context;
	const {
		accentColor,
		core,
		coreColor,
		coreMaterial,
		glow,
		glowMaterial,
		ringLineMaterial,
		ringMaterial,
		ringParticles,
		shell,
		shellMaterial,
	} = objects;
	const visual = visualRef.current;
	if (deltaSeconds > 0) {
		const damping = 0.9 ** (deltaSeconds * 60);
		if (!pointer.dragging) {
			root.rotation.y += pointer.velocityX * deltaSeconds * 60;
			root.rotation.x = THREE.MathUtils.clamp(
				root.rotation.x + pointer.velocityY * deltaSeconds * 60,
				-1.25,
				1.25,
			);
			pointer.velocityX *= damping;
			pointer.velocityY *= damping;
		}

		const orbitSpeed = visual.lost ? 0.02 : visual.trainingActive ? 1.7 : 0.78;
		shell.rotation.y += deltaSeconds * (visual.lost ? 0.04 : 0.12);
		shell.rotation.x += deltaSeconds * (visual.lost ? 0.015 : 0.035);
		ringParticles.rotation.y += deltaSeconds * orbitSpeed;
		ringParticles.rotation.z += deltaSeconds * orbitSpeed * 0.11;
		objects.ringLine.rotation.y += deltaSeconds * orbitSpeed * 0.82;
		core.rotation.y -= deltaSeconds * 0.2;
	}

	const flashProgress = Math.max(
		0,
		Math.min(1, (flashUntilRef.current - now) / FLASH_DURATION_MS),
	);
	if (flashProgress === 0) flashUntilRef.current = 0;
	const flashStrength = flashProgress * flashProgress;
	const warningPulse =
		visual.computeShortage && !visual.lost
			? 0.84 + (Math.sin(now * 0.008) + 1) * 0.08
			: 1;
	const accentBase = visual.lost
		? theme.cold
		: visual.computeShortage
			? theme.amber
			: theme.primary;
	const coreBase = visual.lost
		? theme.cold
		: visual.computeShortage
			? theme.negative
			: theme.primary;
	const shellIntensity = visual.lost ? 0.55 : 1 + flashStrength * 0.65;
	const coreIntensity = visual.lost
		? 0.45
		: (visual.trainingActive ? 1.12 : 1) * warningPulse + flashStrength * 1.7;

	accentColor.copy(accentBase).multiplyScalar(shellIntensity);
	coreColor.copy(coreBase).multiplyScalar(coreIntensity);
	shellMaterial.color.copy(accentColor);
	shellMaterial.opacity = visual.lost
		? 0.2
		: visual.computeShortage
			? 0.74
			: 0.62;
	ringMaterial.color.copy(accentColor);
	ringMaterial.opacity = visual.lost
		? 0.18
		: visual.computeShortage
			? 0.8
			: 0.78;
	ringLineMaterial.color.copy(accentColor);
	ringLineMaterial.opacity = visual.lost
		? 0.12
		: visual.computeShortage
			? 0.52
			: 0.42;
	coreMaterial.color.copy(coreColor);
	coreMaterial.opacity = visual.lost
		? 0.3
		: Math.min(1, 0.74 * warningPulse + flashStrength * 0.22);
	glowMaterial.color.copy(coreColor);
	glowMaterial.opacity = visual.lost
		? 0.08
		: Math.min(1, 0.28 * warningPulse + flashStrength * 0.5);

	const warningScale =
		visual.computeShortage && !visual.lost
			? 0.94 + (Math.sin(now * 0.008) + 1) * 0.045
			: 1;
	core.scale.setScalar(warningScale + flashStrength * 0.18);
	glow.scale.setScalar((visual.lost ? 1.7 : 2.2) + flashStrength * 0.5);
}

function disposeLabCoreObjects(objects: LabCoreObjects): void {
	objects.shellGeometry.dispose();
	objects.shellMaterial.dispose();
	objects.coreGeometry.dispose();
	objects.coreMaterial.dispose();
	objects.glowTexture.dispose();
	objects.glowMaterial.dispose();
	objects.ringGeometry.dispose();
	objects.ringMaterial.dispose();
	objects.ringLineGeometry.dispose();
	objects.ringLineMaterial.dispose();
}

function createParticleRingGeometry(THREE: ThreeModule): THREE.BufferGeometry {
	const coarse = window.matchMedia("(pointer: coarse)").matches;
	const particleCount = coarse ? 48 : 96;
	const positions = new Float32Array(particleCount * 3);
	for (let index = 0; index < particleCount; index += 1) {
		const angle = (index / particleCount) * Math.PI * 2;
		const radius = 1.48 + ((index * 17) % 11) * 0.012;
		const verticalOffset = Math.sin(index * 2.17) * 0.12;
		positions[index * 3] = Math.cos(angle) * radius;
		positions[index * 3 + 1] = verticalOffset;
		positions[index * 3 + 2] = Math.sin(angle) * radius;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	return geometry;
}

function createRingLineGeometry(THREE: ThreeModule): THREE.BufferGeometry {
	const segments = 64;
	const points = Array.from({ length: segments }, (_, index) => {
		const angle = (index / segments) * Math.PI * 2;
		return new THREE.Vector3(Math.cos(angle) * 1.48, 0, Math.sin(angle) * 1.48);
	});
	return new THREE.BufferGeometry().setFromPoints(points);
}

function labCoreSummary(visual: LabCoreVisualState): string {
	const mode = visual.lost
		? "The run is lost."
		: visual.computeShortage
			? "Compute shortage warning is active."
			: "Compute capacity is stable.";
	return `Lab core telemetry: ${mode} ${visual.trainingActive ? "Training is active." : "No training project is active."}`;
}
