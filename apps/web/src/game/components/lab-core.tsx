import { type GameState, selectResourceBar } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const FLASH_DURATION_MS = 900;
const MAX_DEVICE_PIXEL_RATIO = 1.5;

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

type LabCoreTheme = {
	amber: THREE.Color;
	cold: THREE.Color;
	negative: THREE.Color;
	primary: THREE.Color;
};

type PointerState = {
	dragging: boolean;
	lastX: number;
	lastY: number;
	velocityX: number;
	velocityY: number;
};

type LabCoreRuntime = {
	dispose: () => void;
	render: () => void;
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

		let runtime: LabCoreRuntime | null = null;
		try {
			runtime = createLabCoreRuntime({
				canvas,
				flashUntilRef,
				host,
				reducedMotionRef,
				visualRef,
			});
		} catch {
			canvas.setAttribute(
				"aria-label",
				"AI core visualization is unavailable in this browser",
			);
			return;
		}

		renderRef.current = runtime.render;
		return () => {
			renderRef.current = null;
			runtime?.dispose();
		};
	}, []);

	return (
		<div
			ref={hostRef}
			className={cn(
				"relative h-40 min-h-40 w-full min-w-0 overflow-hidden sm:h-60 sm:min-h-60",
				className,
			)}
		>
			<canvas
				ref={canvasRef}
				aria-label="Interactive AI core hologram. Drag to rotate."
				className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
				role="img"
			/>
		</div>
	);
}

function createLabCoreRuntime({
	canvas,
	flashUntilRef,
	host,
	reducedMotionRef,
	visualRef,
}: {
	canvas: HTMLCanvasElement;
	flashUntilRef: MutableRefObject<number>;
	host: HTMLDivElement;
	reducedMotionRef: MutableRefObject<boolean>;
	visualRef: MutableRefObject<LabCoreVisualState>;
}): LabCoreRuntime {
	const renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true,
		powerPreference: "high-performance",
		canvas,
	});
	renderer.setClearColor(0x000000, 0);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
	camera.position.z = 5.3;

	const root = new THREE.Group();
	root.rotation.x = -0.12;
	scene.add(root);

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

	const glowTexture = createGlowTexture();
	const glowMaterial = new THREE.SpriteMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		map: glowTexture,
		transparent: true,
	});
	const glow = new THREE.Sprite(glowMaterial);
	glow.scale.setScalar(2.2);
	root.add(glow);

	const ringGeometry = createParticleRingGeometry();
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

	const ringLineGeometry = createRingLineGeometry();
	const ringLineMaterial = new THREE.LineBasicMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		transparent: true,
	});
	const ringLine = new THREE.LineLoop(ringLineGeometry, ringLineMaterial);
	ringLine.rotation.x = 0.32;
	root.add(ringLine);

	const pointer: PointerState = {
		dragging: false,
		lastX: 0,
		lastY: 0,
		velocityX: 0,
		velocityY: 0,
	};
	let theme = readTheme();
	let visible = document.visibilityState === "visible";
	let intersecting = true;
	let reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	let frameId: number | null = null;
	let lastFrame = performance.now();
	let disposed = false;

	reducedMotionRef.current = reducedMotion;

	const accentColor = new THREE.Color();
	const coreColor = new THREE.Color();

	function canAnimate(): boolean {
		return !disposed && visible && intersecting && !reducedMotion;
	}

	function renderScene(now: number, deltaSeconds: number): void {
		if (disposed || !visible || !intersecting) return;
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

			const orbitSpeed = visual.lost
				? 0.02
				: visual.trainingActive
					? 1.7
					: 0.78;
			shell.rotation.y += deltaSeconds * (visual.lost ? 0.04 : 0.12);
			shell.rotation.x += deltaSeconds * (visual.lost ? 0.015 : 0.035);
			ringParticles.rotation.y += deltaSeconds * orbitSpeed;
			ringParticles.rotation.z += deltaSeconds * orbitSpeed * 0.11;
			ringLine.rotation.y += deltaSeconds * orbitSpeed * 0.82;
			core.rotation.y -= deltaSeconds * 0.2;
		}

		const flashProgress = Math.max(
			0,
			Math.min(1, (flashUntilRef.current - now) / FLASH_DURATION_MS),
		);
		if (flashProgress === 0) flashUntilRef.current = 0;
		const flashStrength = flashProgress * flashProgress;
		const warningPulse =
			visual.computeShortage && !visual.lost && !reducedMotion
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
			visual.computeShortage && !visual.lost && !reducedMotion
				? 0.94 + (Math.sin(now * 0.008) + 1) * 0.045
				: 1;
		core.scale.setScalar(warningScale + flashStrength * 0.18);
		glow.scale.setScalar((visual.lost ? 1.7 : 2.2) + flashStrength * 0.5);
		renderer.render(scene, camera);
	}

	function scheduleFrame(): void {
		if (frameId !== null || !canAnimate()) return;
		lastFrame = performance.now();
		frameId = requestAnimationFrame(tick);
	}

	function stopFrame(): void {
		if (frameId === null) return;
		cancelAnimationFrame(frameId);
		frameId = null;
	}

	function syncFrameLoop(): void {
		if (canAnimate()) {
			scheduleFrame();
		} else {
			stopFrame();
			if (visible && intersecting) renderScene(performance.now(), 0);
		}
	}

	function tick(now: number): void {
		frameId = null;
		if (!canAnimate()) {
			renderScene(now, 0);
			return;
		}
		const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
		lastFrame = now;
		renderScene(now, deltaSeconds);
		scheduleFrame();
	}

	function resize(): void {
		const rect = host.getBoundingClientRect();
		const width = Math.max(1, rect.width);
		const height = Math.max(1, rect.height);
		renderer.setPixelRatio(
			Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO),
		);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		if (visible && intersecting) renderScene(performance.now(), 0);
	}

	function onPointerDown(event: PointerEvent): void {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		pointer.dragging = true;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		pointer.velocityX = 0;
		pointer.velocityY = 0;
		canvas.style.cursor = "grabbing";
		canvas.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent): void {
		if (!pointer.dragging) return;
		const deltaX = event.clientX - pointer.lastX;
		const deltaY = event.clientY - pointer.lastY;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		pointer.velocityX = deltaX * 0.008;
		pointer.velocityY = deltaY * 0.008;
		root.rotation.y += pointer.velocityX;
		root.rotation.x = THREE.MathUtils.clamp(
			root.rotation.x + pointer.velocityY,
			-1.25,
			1.25,
		);
		renderScene(performance.now(), 0);
	}

	function onPointerUp(event: PointerEvent): void {
		if (!pointer.dragging) return;
		pointer.dragging = false;
		if (reducedMotion) {
			pointer.velocityX = 0;
			pointer.velocityY = 0;
		}
		canvas.style.cursor = "";
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}
		syncFrameLoop();
	}

	function onVisibilityChange(): void {
		visible = document.visibilityState === "visible";
		syncFrameLoop();
	}

	function onIntersectionChange(entries: IntersectionObserverEntry[]): void {
		intersecting = entries[0]?.isIntersecting ?? true;
		syncFrameLoop();
	}

	function onMotionPreferenceChange(): void {
		reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		reducedMotionRef.current = reducedMotion;
		if (reducedMotion) {
			pointer.velocityX = 0;
			pointer.velocityY = 0;
		}
		syncFrameLoop();
	}

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);
	const intersectionObserver =
		typeof IntersectionObserver === "undefined"
			? null
			: new IntersectionObserver(onIntersectionChange, { threshold: 0.01 });
	intersectionObserver?.observe(host);
	const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	mediaQuery.addEventListener("change", onMotionPreferenceChange);
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointercancel", onPointerUp);
	document.addEventListener("visibilitychange", onVisibilityChange);
	const themeObserver = new MutationObserver(() => {
		theme = readTheme();
		if (visible && intersecting) renderScene(performance.now(), 0);
	});
	themeObserver.observe(document.documentElement, {
		attributeFilter: ["data-mode", "data-theme", "data-theme-mode"],
		attributes: true,
	});

	resize();
	syncFrameLoop();

	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			stopFrame();
			resizeObserver.disconnect();
			intersectionObserver?.disconnect();
			mediaQuery.removeEventListener("change", onMotionPreferenceChange);
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerUp);
			canvas.removeEventListener("pointercancel", onPointerUp);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			themeObserver.disconnect();
			shellGeometry.dispose();
			shellMaterial.dispose();
			coreGeometry.dispose();
			coreMaterial.dispose();
			glowTexture.dispose();
			glowMaterial.dispose();
			ringGeometry.dispose();
			ringMaterial.dispose();
			ringLineGeometry.dispose();
			ringLineMaterial.dispose();
			renderer.dispose();
		},
		render() {
			if (visible && intersecting) renderScene(performance.now(), 0);
			syncFrameLoop();
		},
	};
}

function createParticleRingGeometry(): THREE.BufferGeometry {
	const particleCount = 96;
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

function createRingLineGeometry(): THREE.BufferGeometry {
	const segments = 64;
	const points = Array.from({ length: segments }, (_, index) => {
		const angle = (index / segments) * Math.PI * 2;
		return new THREE.Vector3(Math.cos(angle) * 1.48, 0, Math.sin(angle) * 1.48);
	});
	return new THREE.BufferGeometry().setFromPoints(points);
}

function createGlowTexture(): THREE.CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = 128;
	canvas.height = 128;
	const context = canvas.getContext("2d");
	if (context !== null) {
		const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
		gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
		gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.7)");
		gradient.addColorStop(0.58, "rgba(255, 255, 255, 0.2)");
		gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
		context.fillStyle = gradient;
		context.fillRect(0, 0, 128, 128);
	}
	return new THREE.CanvasTexture(canvas);
}

function readTheme(): LabCoreTheme {
	const styles = getComputedStyle(document.documentElement);
	return {
		amber: readThemeColor(styles, "--game-amber", "#f5b04c"),
		cold: readThemeColor(styles, "--muted-foreground", "#7890b2"),
		negative: readThemeColor(styles, "--game-negative", "#f0655a"),
		primary: readThemeColor(styles, "--primary", "#4fd8e8"),
	};
}

function readThemeColor(
	styles: CSSStyleDeclaration,
	property: string,
	fallback: string,
): THREE.Color {
	const color = new THREE.Color();
	try {
		color.set(styles.getPropertyValue(property).trim() || fallback);
		if (![color.r, color.g, color.b].every(Number.isFinite)) {
			color.set(fallback);
		}
	} catch {
		color.set(fallback);
	}
	return color;
}
