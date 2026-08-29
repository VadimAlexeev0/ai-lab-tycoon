import { useCallback, useEffect, useRef, useState } from "react";
import type * as THREE from "three";

export type ThreeConstructor<Instance> = new (...args: unknown[]) => Instance;

export type ThreeModule = {
	AdditiveBlending: number;
	BoxGeometry: ThreeConstructor<THREE.BoxGeometry>;
	BufferAttribute: ThreeConstructor<THREE.BufferAttribute>;
	BufferGeometry: ThreeConstructor<THREE.BufferGeometry>;
	CanvasTexture: ThreeConstructor<THREE.CanvasTexture>;
	Color: ThreeConstructor<THREE.Color>;
	Group: ThreeConstructor<THREE.Group>;
	IcosahedronGeometry: ThreeConstructor<THREE.IcosahedronGeometry>;
	InstancedMesh: ThreeConstructor<THREE.InstancedMesh>;
	LineBasicMaterial: ThreeConstructor<THREE.LineBasicMaterial>;
	LineLoop: ThreeConstructor<THREE.LineLoop>;
	LineSegments: ThreeConstructor<THREE.LineSegments>;
	MathUtils: {
		clamp(value: number, min: number, max: number): number;
		randFloatSpread(range: number): number;
	};
	Matrix4: ThreeConstructor<THREE.Matrix4>;
	Mesh: ThreeConstructor<THREE.Mesh>;
	MeshBasicMaterial: ThreeConstructor<THREE.MeshBasicMaterial>;
	PerspectiveCamera: ThreeConstructor<THREE.PerspectiveCamera>;
	Points: ThreeConstructor<THREE.Points>;
	PointsMaterial: ThreeConstructor<THREE.PointsMaterial>;
	Scene: ThreeConstructor<THREE.Scene>;
	SphereGeometry: ThreeConstructor<THREE.SphereGeometry>;
	Sprite: ThreeConstructor<THREE.Sprite>;
	SpriteMaterial: ThreeConstructor<THREE.SpriteMaterial>;
	Vector3: ThreeConstructor<THREE.Vector3>;
	WebGLRenderer: ThreeConstructor<THREE.WebGLRenderer>;
};

export type ThreeSceneTheme = {
	amber: THREE.Color;
	cold: THREE.Color;
	negative: THREE.Color;
	positive: THREE.Color;
	primary: THREE.Color;
};

export type ThreeScenePointer = {
	dragging: boolean;
	lastX: number;
	lastY: number;
	velocityX: number;
	velocityY: number;
};

export type ThreeSceneContext = {
	THREE: ThreeModule;
	camera: THREE.PerspectiveCamera;
	pointer: ThreeScenePointer;
	renderer: THREE.WebGLRenderer;
	root: THREE.Group;
	scene: THREE.Scene;
	theme: ThreeSceneTheme;
};

export type ThreeSceneRuntime = {
	dispose: () => void;
	render: () => void;
};

export type ThreeSceneRuntimeOptions = {
	THREE: ThreeModule;
	canvas: HTMLCanvasElement;
	drawFrame: (
		context: ThreeSceneContext,
		now: number,
		deltaSeconds: number,
	) => void;
	host: HTMLElement;
	reducedMotionRef: { current: boolean };
	animate?: boolean;
	interactive?: boolean;
	setup?: (context: ThreeSceneContext) => (() => void) | undefined;
};

export type UseThreeSceneOptions = {
	drawFrame: (
		context: ThreeSceneContext,
		now: number,
		deltaSeconds: number,
	) => void;
	animate?: boolean;
	interactive?: boolean;
	setup?: (context: ThreeSceneContext) => (() => void) | undefined;
};

export type UseThreeSceneResult = {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	hostRef: React.RefObject<HTMLDivElement | null>;
	render: () => void;
	unavailable: boolean;
};

const MAX_DEVICE_PIXEL_RATIO = 1.5;

export function useThreeScene({
	animate = true,
	drawFrame,
	interactive = false,
	setup,
}: UseThreeSceneOptions): UseThreeSceneResult {
	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawFrameRef = useRef(drawFrame);
	const setupRef = useRef(setup);
	const reducedMotionRef = useRef(false);
	const runtimeRef = useRef<ThreeSceneRuntime | null>(null);
	const [unavailable, setUnavailable] = useState(false);
	const render = useCallback(() => {
		runtimeRef.current?.render();
	}, []);
	drawFrameRef.current = drawFrame;
	setupRef.current = setup;

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		if (host === null || canvas === null) return;
		let runtime: ThreeSceneRuntime | null = null;
		let disposed = false;
		void import("./three-core")
			.then((module) => {
				if (disposed) return;
				try {
					runtime = createThreeSceneRuntime({
						THREE: module as unknown as ThreeModule,
						canvas,
						drawFrame: (context, now, deltaSeconds) =>
							drawFrameRef.current(context, now, deltaSeconds),
						host,
						animate,
						interactive,
						reducedMotionRef,
						setup: (context) => {
							const cleanup = setupRef.current?.(context);
							return typeof cleanup === "function" ? cleanup : undefined;
						},
					});
					runtimeRef.current = runtime;
				} catch {
					setUnavailable(true);
				}
			})
			.catch(() => {
				if (!disposed) setUnavailable(true);
			});
		return () => {
			disposed = true;
			runtimeRef.current = null;
			runtime?.dispose();
		};
	}, [animate, interactive]);

	// Repaint when a state-bound draw callback changes, including static scenes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: callback identity is the repaint signal.
	useEffect(() => {
		render();
	}, [drawFrame, render]);

	return { canvasRef, hostRef, render, unavailable };
}

/** Create the shared gated renderer lifecycle used by every ambient scene. */
export function createThreeSceneRuntime({
	animate = true,
	THREE,
	canvas,
	drawFrame,
	host,
	interactive = false,
	reducedMotionRef,
	setup,
}: ThreeSceneRuntimeOptions): ThreeSceneRuntime {
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
	scene.add(root);

	const context: ThreeSceneContext = {
		THREE,
		camera,
		pointer: {
			dragging: false,
			lastX: 0,
			lastY: 0,
			velocityX: 0,
			velocityY: 0,
		},
		renderer,
		root,
		scene,
		theme: readTheme(THREE),
	};
	const sceneCleanup = setup?.(context);

	let visible = document.visibilityState === "visible";
	let intersecting = true;
	let reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	let frameId: number | null = null;
	let lastFrame = performance.now();
	let disposed = false;

	reducedMotionRef.current = reducedMotion;

	function canAnimate(): boolean {
		return animate && !disposed && visible && intersecting && !reducedMotion;
	}

	function renderScene(now: number, deltaSeconds: number): void {
		if (disposed || !visible || !intersecting) return;
		drawFrame(context, now, deltaSeconds);
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
		if (!interactive) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;
		context.pointer.dragging = true;
		context.pointer.lastX = event.clientX;
		context.pointer.lastY = event.clientY;
		context.pointer.velocityX = 0;
		context.pointer.velocityY = 0;
		canvas.style.cursor = "grabbing";
		canvas.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent): void {
		if (!interactive || !context.pointer.dragging) return;
		const deltaX = event.clientX - context.pointer.lastX;
		const deltaY = event.clientY - context.pointer.lastY;
		context.pointer.lastX = event.clientX;
		context.pointer.lastY = event.clientY;
		context.pointer.velocityX = deltaX * 0.008;
		context.pointer.velocityY = deltaY * 0.008;
		context.root.rotation.y += context.pointer.velocityX;
		context.root.rotation.x = THREE.MathUtils.clamp(
			context.root.rotation.x + context.pointer.velocityY,
			-1.25,
			1.25,
		);
		renderScene(performance.now(), 0);
	}

	function onPointerUp(event: PointerEvent): void {
		if (!interactive || !context.pointer.dragging) return;
		context.pointer.dragging = false;
		if (reducedMotion) {
			context.pointer.velocityX = 0;
			context.pointer.velocityY = 0;
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
			context.pointer.velocityX = 0;
			context.pointer.velocityY = 0;
		}
		syncFrameLoop();
	}

	const resizeObserver =
		typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
	resizeObserver?.observe(host);
	const intersectionObserver =
		typeof IntersectionObserver === "undefined"
			? null
			: new IntersectionObserver(onIntersectionChange, { threshold: 0.01 });
	intersectionObserver?.observe(host);
	const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	mediaQuery.addEventListener("change", onMotionPreferenceChange);
	if (interactive) {
		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("pointercancel", onPointerUp);
	}
	document.addEventListener("visibilitychange", onVisibilityChange);
	const themeObserver = new MutationObserver(() => {
		context.theme = readTheme(THREE);
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
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			mediaQuery.removeEventListener("change", onMotionPreferenceChange);
			if (interactive) {
				canvas.removeEventListener("pointerdown", onPointerDown);
				canvas.removeEventListener("pointermove", onPointerMove);
				canvas.removeEventListener("pointerup", onPointerUp);
				canvas.removeEventListener("pointercancel", onPointerUp);
			}
			document.removeEventListener("visibilitychange", onVisibilityChange);
			themeObserver.disconnect();
			sceneCleanup?.();
			renderer.dispose();
		},
		render() {
			if (visible && intersecting) renderScene(performance.now(), 0);
			syncFrameLoop();
		},
	};
}

export function createGlowTexture(THREE: ThreeModule): THREE.CanvasTexture {
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

export function readTheme(THREE: ThreeModule): ThreeSceneTheme {
	const styles = getComputedStyle(document.documentElement);
	return {
		amber: readThemeColor(styles, "--game-amber", "#f5b04c", THREE),
		cold: readThemeColor(styles, "--muted-foreground", "#7890b2", THREE),
		negative: readThemeColor(styles, "--game-negative", "#f0655a", THREE),
		positive: readThemeColor(styles, "--game-positive", "#4bd49b", THREE),
		primary: readThemeColor(styles, "--primary", "#4fd8e8", THREE),
	};
}

function readThemeColor(
	styles: CSSStyleDeclaration,
	property: string,
	fallback: string,
	THREE: ThreeModule,
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
