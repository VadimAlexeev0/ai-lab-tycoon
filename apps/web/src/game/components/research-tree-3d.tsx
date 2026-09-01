import { type GameState, selectTeams } from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import {
	Check,
	ChevronRight,
	CircleDashed,
	CircleDot,
	GitFork,
	Info,
	LockKeyhole,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EraBadge, { ERA_LABELS } from "@/game/components/era-badge";
import { summarizeResearchEffects } from "@/game/derived/labels";
import {
	createResearchLayout,
	type PositionedNode,
	type ResearchEra,
	type ResearchLayoutState,
} from "../derived/research-layout";
import {
	filterResearchNodesForEra,
	findChoiceFrontiers,
	getResearchStatusVisual,
	isResearchEraUnlocked,
	projectResearchNodeViews,
	type ResearchNodeView,
} from "./research-lattice-data";
import ResearchList from "./research-list";

export type ResearchTree3DProps = {
	state: GameState;
	disabled?: boolean;
	selectedNodeId?: string;
	onSelectNode: (nodeId: string) => void;
	onCloseDetail: () => void;
	onAssignProject: (teamId: string, projectId: string) => Promise<boolean>;
};

/** Kept as a named alias for callers migrating from the v1 tree. */
export type ResearchTreeProps = ResearchTree3DProps;

export {
	getResearchStatusClass,
	getResearchStatusVisual,
	RESEARCH_STATUS_VISUALS,
} from "./research-lattice-data";

/** Feature gate shared by the component and jsdom tests. */
export function supportsResearchLattice(): boolean {
	if (typeof window === "undefined" || prefersReducedMotion()) return false;
	try {
		const canvas = document.createElement("canvas");
		return canvas.getContext("webgl2") !== null;
	} catch {
		return false;
	}
}

export default function ResearchTree3D({
	disabled = false,
	onAssignProject,
	onCloseDetail,
	onSelectNode,
	selectedNodeId,
	state,
}: ResearchTree3DProps) {
	const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
	const [webglAvailable] = useState(supportsResearchLattice);
	const [sceneUnavailable, setSceneUnavailable] = useState(false);
	const [selectedEra, setSelectedEra] = useState<ResearchEra>(
		state.research.currentEra,
	);
	const focusReturnRef = useRef<HTMLElement | null>(null);
	const focusedNodes = useMemo(
		() => filterResearchNodesForEra(state.research.nodes, selectedEra),
		[state.research.nodes, selectedEra],
	);
	const layoutState = useMemo<ResearchLayoutState>(
		() => ({
			projects: state.projects,
			research: {
				currentEra: state.research.currentEra,
				nodes: focusedNodes,
			},
		}),
		[focusedNodes, state.projects, state.research.currentEra],
	);
	const layout = useMemo(
		() => createResearchLayout(layoutState),
		[layoutState],
	);
	const nodeViews = useMemo(
		() => projectResearchNodeViews(state, layout),
		[layout, state],
	);
	const selectedNode = nodeViews.find((node) => node.id === selectedNodeId);
	const choiceFrontiers = useMemo(
		() => findChoiceFrontiers(layout.nodes),
		[layout.nodes],
	);
	const handleSceneUnavailable = useCallback(() => {
		setSceneUnavailable(true);
	}, []);

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = () => setReducedMotion(mediaQuery.matches);
		mediaQuery.addEventListener("change", onChange);
		return () => mediaQuery.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		setSelectedEra(state.research.currentEra);
	}, [state.research.currentEra]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset scene availability when motion preference changes
	useEffect(() => {
		setSceneUnavailable(false);
	}, [reducedMotion]);
	const handleSelect = useCallback(
		(nodeId: string, trigger?: HTMLElement) => {
			if (trigger !== undefined) {
				focusReturnRef.current = trigger;
			} else if (document.activeElement instanceof HTMLElement) {
				focusReturnRef.current = document.activeElement;
			}
			onSelectNode(nodeId);
		},
		[onSelectNode],
	);
	const handleClose = useCallback(() => {
		onCloseDetail();
		const trigger = focusReturnRef.current;
		if (trigger !== null) {
			queueMicrotask(() => trigger.focus());
		}
	}, [onCloseDetail]);

	const showFallback = reducedMotion || !webglAvailable || sceneUnavailable;
	const fallbackReason = reducedMotion
		? "Reduced motion is enabled, so the Lattice is shown as a calm semantic list."
		: !webglAvailable || sceneUnavailable
			? "WebGL2 is unavailable, so the Lattice is shown as a semantic list."
			: undefined;

	return (
		<section aria-labelledby="research-lattice-heading" className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">
						Research / lattice
					</p>
					<h2
						id="research-lattice-heading"
						className="mt-1 font-display font-semibold text-foreground text-xl"
					>
						The Lattice
					</h2>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					<ResearchEraSwitcher
						currentEra={state.research.currentEra}
						onChange={setSelectedEra}
						selectedEra={selectedEra}
						state={state}
					/>
					<EraBadge era={state.research.currentEra} size="compact" />
				</div>
			</div>
			<p className="max-w-3xl text-muted-foreground text-xs leading-5">
				A living research web: focus one era at a time, with dimmed prerequisite
				anchors from earlier eras. Select a card to inspect its economics and
				assign a team.
			</p>

			{showFallback ? (
				<ResearchList
					nodes={nodeViews}
					onSelect={handleSelect}
					reason={fallbackReason}
					selectedNodeId={selectedNodeId}
					choiceFrontiers={choiceFrontiers}
				/>
			) : (
				<ResearchLatticeScene
					choiceFrontiers={choiceFrontiers}
					layout={layout}
					nodes={nodeViews}
					onSelect={handleSelect}
					onUnavailable={handleSceneUnavailable}
					selectedNodeId={selectedNodeId}
				/>
			)}

			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
				<LegendIcon icon={<LockKeyhole className="size-3" />} label="Locked" />
				<LegendIcon
					icon={<CircleDashed className="size-3" />}
					label="Available"
				/>
				<LegendIcon
					icon={<CircleDot className="size-3" />}
					label="In progress"
				/>
				<LegendIcon icon={<Check className="size-3" />} label="Completed" />
				{choiceFrontiers.length > 0 ? (
					<LegendIcon icon={<GitFork className="size-3" />} label="Choice" />
				) : null}
			</div>

			{selectedNode ? (
				<ResearchDetailPane
					disabled={disabled}
					node={selectedNode}
					onAssignProject={onAssignProject}
					onClose={handleClose}
					state={state}
				/>
			) : null}
		</section>
	);
}

function ResearchLatticeScene({
	choiceFrontiers,
	layout,
	nodes,
	onSelect,
	onUnavailable,
	selectedNodeId,
}: {
	choiceFrontiers: string[];
	layout: ReturnType<typeof createResearchLayout>;
	nodes: ResearchNodeView[];
	onSelect: (nodeId: string, trigger?: HTMLElement) => void;
	onUnavailable: () => void;
	selectedNodeId: string | undefined;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cssHostRef = useRef<HTMLDivElement>(null);
	const onSelectRef = useRef(onSelect);
	onSelectRef.current = onSelect;

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		const cssHost = cssHostRef.current;
		if (host === null || canvas === null || cssHost === null) return;
		let disposed = false;
		let runtime: LatticeRuntime | null = null;
		void Promise.all([
			import("three"),
			import("three/addons/renderers/CSS3DRenderer.js"),
		])
			.then(([THREE, css]) => {
				if (disposed) return;
				try {
					runtime = createLatticeRuntime({
						canvas,
						cssHost,
						CSS3DObject: css.CSS3DObject,
						CSS3DRenderer: css.CSS3DRenderer,
						host,
						layout,
						nodes,
						onSelect: (nodeId) => onSelectRef.current(nodeId),
						THREE,
					});
				} catch {
					onUnavailable();
				}
			})
			.catch(() => {
				if (!disposed) onUnavailable();
			});

		return () => {
			disposed = true;
			runtime?.dispose();
		};
	}, [layout, nodes, onUnavailable]);

	return (
		<div
			className="research-lattice-scene"
			data-research-scene="lattice"
			ref={hostRef}
		>
			<canvas
				aria-hidden="true"
				className="research-lattice-canvas"
				ref={canvasRef}
				tabIndex={-1}
			/>
			<div
				aria-label="Interactive research lattice. Drag blank space to pan and scroll to zoom."
				className="research-lattice-css"
				ref={cssHostRef}
				role="application"
			/>
			{choiceFrontiers.length > 0 ? (
				<div className="research-lattice-choice-hint" role="note">
					<GitFork className="size-3.5 shrink-0" aria-hidden="true" />
					Choose one path — locks the other.
				</div>
			) : null}
			<p className="research-lattice-controls" aria-hidden="true">
				Drag to pan · Scroll to zoom
			</p>
			<div className="sr-only" aria-live="polite">
				{nodes.length} research nodes rendered as selectable DOM cards.
			</div>
			{/* These values keep React aware of state changes that rebuild the CSS3D DOM. */}
			<span
				aria-hidden="true"
				data-selected-node={selectedNodeId ?? ""}
				hidden
			/>
		</div>
	);
}

export function ResearchEraSwitcher({
	currentEra,
	onChange,
	selectedEra,
	state,
}: {
	currentEra: ResearchEra;
	onChange: (era: ResearchEra) => void;
	selectedEra: ResearchEra;
	state: Pick<GameState, "research">;
}) {
	const currentEraIndex = eraIndexFor(currentEra);
	return (
		<fieldset aria-label="Research era focus" className="research-era-switcher">
			<legend className="sr-only">Research era focus</legend>
			{(["text", "assistant", "multimodal"] as const).map((era) => {
				const eraIndex = eraIndexFor(era);
				const unlocked = isResearchEraUnlocked(state, era);
				const label = ERA_LABELS[era].replace(" era", "");
				const title = !unlocked
					? `Unlock the ${label} keystone to view this era.`
					: eraIndex === currentEraIndex
						? "Current era"
						: `View the ${label} era`;
				return (
					<button
						aria-pressed={selectedEra === era}
						className="research-era-switcher__button"
						disabled={!unlocked}
						onClick={() => onChange(era)}
						title={title}
						type="button"
					>
						{label}
					</button>
				);
			})}
		</fieldset>
	);
}

function eraIndexFor(era: ResearchEra): number {
	return ["text", "assistant", "multimodal"].indexOf(era);
}

type LatticeRuntime = {
	dispose: () => void;
};

type LatticeRuntimeOptions = {
	THREE: typeof import("three");
	CSS3DRenderer: typeof import("three/addons/renderers/CSS3DRenderer.js")["CSS3DRenderer"];
	CSS3DObject: typeof import("three/addons/renderers/CSS3DRenderer.js")["CSS3DObject"];
	canvas: HTMLCanvasElement;
	cssHost: HTMLElement;
	host: HTMLElement;
	layout: ReturnType<typeof createResearchLayout>;
	nodes: readonly ResearchNodeView[];
	onSelect: (nodeId: string) => void;
};

type ConnectorVisual = {
	line: import("three").Line;
	geometry: import("three").BufferGeometry;
	material:
		| import("three").LineBasicMaterial
		| import("three").LineDashedMaterial;
	dynamic: boolean;
	speed: number;
	phase: number;
	baseOpacity: number;
};

type DecisionRing = {
	mesh: import("three").Mesh;
	geometry: import("three").RingGeometry;
	material: import("three").MeshBasicMaterial;
};

const ORTHOGRAPHIC_CAMERA_DISTANCE = 1_000;
const ORTHOGRAPHIC_MIN_ZOOM = 0.45;
const ORTHOGRAPHIC_MAX_ZOOM = 3.5;
const LATTICE_FRAME_MARGIN = 96;
const LATTICE_CARD_HALF_WIDTH = 112;
const LATTICE_CARD_HALF_HEIGHT = 48;

function createLatticeRuntime({
	CSS3DObject,
	CSS3DRenderer,
	THREE,
	canvas,
	cssHost,
	host,
	layout,
	nodes,
	onSelect,
}: LatticeRuntimeOptions): LatticeRuntime {
	const renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true,
		canvas,
		powerPreference: "high-performance",
	});
	renderer.setClearColor(0x000000, 0);
	renderer.domElement.style.pointerEvents = "none";

	const cssRenderer = new CSS3DRenderer({ element: cssHost });
	cssRenderer.domElement.style.pointerEvents = "auto";
	cssRenderer.domElement.style.position = "absolute";
	cssRenderer.domElement.style.inset = "0";
	cssHost.style.pointerEvents = "auto";

	const scene = new THREE.Scene();
	const cssScene = new THREE.Scene();
	const root = new THREE.Group();
	scene.add(root);
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20_000);
	const center = layoutCenter(layout.nodes, THREE);
	const cameraState: CameraState = {
		currentTargetX: center.x,
		currentTargetY: center.y,
		currentZoom: 1,
		dragging: false,
		lastX: 0,
		lastY: 0,
		pointerId: null,
		targetX: center.x,
		targetY: center.y,
		viewHeight: 1,
		viewWidth: 1,
		zoom: 1,
	};
	camera.position.set(center.x, center.y, ORTHOGRAPHIC_CAMERA_DISTANCE);
	camera.lookAt(center.x, center.y, 0);

	const nodePositions = new Map<string, import("three").Vector3>();
	for (const node of layout.nodes) {
		nodePositions.set(node.id, new THREE.Vector3(node.x, -node.y, node.z));
	}
	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	const connectors: ConnectorVisual[] = [];
	const decisionRings: DecisionRing[] = [];
	const palette = readLatticePalette(THREE);

	for (let edgeIndex = 0; edgeIndex < layout.edges.length; edgeIndex += 1) {
		const edge = layout.edges[edgeIndex];
		if (edge === undefined) continue;
		const source = nodePositions.get(edge.from);
		const target = nodePositions.get(edge.to);
		if (source === undefined || target === undefined) continue;
		const sourceNode = nodeById.get(edge.from);
		const targetNode = nodeById.get(edge.to);
		if (sourceNode === undefined || targetNode === undefined) continue;
		const sourceEraColor = colorForNode(sourceNode, palette);
		const targetEraColor = colorForNode(targetNode, palette);
		const midpoint = source.clone().lerp(target, 0.5);
		const delta = target.clone().sub(source);
		const curvature = 34 + Math.min(90, Math.abs(delta.z) * 0.25);
		const control = midpoint.clone();
		control.y += ((edgeIndex % 3) - 1) * curvature * 0.32;
		control.z += delta.x >= 0 ? curvature : -curvature;
		const curve = new THREE.QuadraticBezierCurve3(
			source.clone(),
			control,
			target.clone(),
		);
		const points = curve.getPoints(28);
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const colors = new Float32Array(points.length * 3);
		for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
			const color = sourceEraColor
				.clone()
				.lerp(targetEraColor, pointIndex / Math.max(1, points.length - 1));
			colors[pointIndex * 3] = color.r;
			colors[pointIndex * 3 + 1] = color.g;
			colors[pointIndex * 3 + 2] = color.b;
		}
		geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
		const targetStatus = targetNode.status;
		const dynamic =
			edge.isExclusive ||
			targetStatus === "available" ||
			targetStatus === "in-progress";
		const baseOpacity = edge.isExclusive
			? 0.95
			: targetStatus === "in-progress"
				? 0.92
				: targetStatus === "available"
					? 0.66
					: targetStatus === "completed"
						? 0.58
						: targetStatus === "locked-out"
							? 0.16
							: 0.24;
		const material = dynamic
			? new THREE.LineDashedMaterial({
					blending: THREE.AdditiveBlending,
					color: 0xffffff,
					dashSize: edge.isExclusive ? 34 : 22,
					depthWrite: false,
					gapSize: edge.isExclusive ? 12 : 18,
					opacity: baseOpacity,
					transparent: true,
					vertexColors: true,
				})
			: new THREE.LineBasicMaterial({
					blending: THREE.AdditiveBlending,
					color: 0xffffff,
					depthWrite: false,
					opacity: baseOpacity,
					transparent: true,
					vertexColors: true,
				});
		const line = new THREE.Line(geometry, material);
		if (dynamic) line.computeLineDistances();
		root.add(line);
		connectors.push({
			baseOpacity,
			dynamic,
			geometry,
			line,
			material,
			phase: edgeIndex * 0.37,
			speed: edge.isExclusive
				? 1.45
				: targetStatus === "in-progress"
					? 1.8
					: 0.56,
		});
	}

	const divergenceParents = new Set(
		layout.edges.filter((edge) => edge.isDivergence).map((edge) => edge.from),
	);
	for (const parentId of divergenceParents) {
		const position = nodePositions.get(parentId);
		if (position === undefined) continue;
		const geometry = new THREE.RingGeometry(22, 28, 32);
		const material = new THREE.MeshBasicMaterial({
			blending: THREE.AdditiveBlending,
			color: palette.decision,
			depthWrite: false,
			opacity: 0.88,
			side: THREE.DoubleSide,
			transparent: true,
		});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.copy(position);
		root.add(mesh);
		decisionRings.push({ geometry, material, mesh });
	}

	for (const node of nodes) {
		const position = nodePositions.get(node.id);
		if (position === undefined) continue;
		const card = createResearchCard(
			node,
			onSelect,
			node.exclusiveGroup !== undefined,
		);
		const cssObject = new CSS3DObject(card);
		cssObject.position.copy(position);
		cssObject.position.y += 0;
		// CSS3DObject defaults to user-select:none; cards are deliberately text-selectable.
		card.style.userSelect = "text";
		cssScene.add(cssObject);
	}

	const reducedMotionMedia =
		typeof window.matchMedia === "function"
			? window.matchMedia("(prefers-reduced-motion: reduce)")
			: null;
	let visible =
		typeof document === "undefined" || document.visibilityState === "visible";
	let intersecting = true;
	let reducedMotion = reducedMotionMedia?.matches ?? false;
	let frameId: number | null = null;
	let lastFrame = performance.now();
	let disposed = false;

	function canAnimate() {
		return !disposed && visible && intersecting && !reducedMotion;
	}
	function renderScene(now: number, deltaSeconds: number) {
		if (disposed || !visible || !intersecting) return;
		drawLatticeFrame(
			camera,
			cameraState,
			connectors,
			decisionRings,
			now,
			deltaSeconds,
		);
		renderer.render(scene, camera);
		cssRenderer.render(cssScene, camera);
	}
	function tick(now: number) {
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
	function scheduleFrame() {
		if (frameId !== null || !canAnimate()) return;
		lastFrame = performance.now();
		frameId = requestAnimationFrame(tick);
	}
	function stopFrame() {
		if (frameId === null) return;
		cancelAnimationFrame(frameId);
		frameId = null;
	}
	function syncFrameLoop() {
		if (canAnimate()) scheduleFrame();
		else {
			stopFrame();
			renderScene(performance.now(), 0);
		}
	}
	function resize() {
		const rect = host.getBoundingClientRect();
		const width = Math.max(1, rect.width);
		const height = Math.max(1, rect.height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
		renderer.setSize(width, height, false);
		cssRenderer.setSize(width, height);
		updateOrthographicFrustum(camera, layout.nodes, width, height, cameraState);
		renderScene(performance.now(), 0);
	}
	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		if ((event.target as Element | null)?.closest("button")) return;
		cameraState.dragging = true;
		cameraState.pointerId = event.pointerId;
		cameraState.lastX = event.clientX;
		cameraState.lastY = event.clientY;
		cssHost.style.cursor = "grabbing";
		cssHost.setPointerCapture(event.pointerId);
	}
	function onPointerMove(event: PointerEvent) {
		if (!cameraState.dragging || cameraState.pointerId !== event.pointerId)
			return;
		const deltaX = event.clientX - cameraState.lastX;
		const deltaY = event.clientY - cameraState.lastY;
		cameraState.lastX = event.clientX;
		cameraState.lastY = event.clientY;
		const hostWidth = Math.max(1, host.getBoundingClientRect().width);
		const panScale = cameraState.viewWidth / hostWidth / cameraState.zoom;
		cameraState.targetX -= deltaX * panScale;
		cameraState.targetY += deltaY * panScale;
		renderScene(performance.now(), 0);
	}
	function onPointerUp(event: PointerEvent) {
		if (cameraState.pointerId !== event.pointerId) return;
		cameraState.dragging = false;
		cameraState.pointerId = null;
		cssHost.style.cursor = "grab";
		if (cssHost.hasPointerCapture(event.pointerId))
			cssHost.releasePointerCapture(event.pointerId);
		syncFrameLoop();
	}
	function onWheel(event: WheelEvent) {
		event.preventDefault();
		cameraState.zoom = THREE.MathUtils.clamp(
			cameraState.zoom * Math.exp(-event.deltaY * 0.001),
			ORTHOGRAPHIC_MIN_ZOOM,
			ORTHOGRAPHIC_MAX_ZOOM,
		);
		renderScene(performance.now(), 0);
		syncFrameLoop();
	}
	function onVisibilityChange() {
		visible = document.visibilityState === "visible";
		syncFrameLoop();
	}
	function onIntersectionChange(entries: IntersectionObserverEntry[]) {
		intersecting = entries[0]?.isIntersecting ?? true;
		syncFrameLoop();
	}
	function onMotionPreferenceChange() {
		reducedMotion = reducedMotionMedia?.matches ?? false;
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
	cssHost.addEventListener("pointerdown", onPointerDown);
	cssHost.addEventListener("pointermove", onPointerMove);
	cssHost.addEventListener("pointerup", onPointerUp);
	cssHost.addEventListener("pointercancel", onPointerUp);
	cssHost.addEventListener("wheel", onWheel, { passive: false });
	document.addEventListener("visibilitychange", onVisibilityChange);
	reducedMotionMedia?.addEventListener("change", onMotionPreferenceChange);
	cssHost.style.cursor = "grab";
	resize();
	syncFrameLoop();

	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			stopFrame();
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			cssHost.removeEventListener("pointerdown", onPointerDown);
			cssHost.removeEventListener("pointermove", onPointerMove);
			cssHost.removeEventListener("pointerup", onPointerUp);
			cssHost.removeEventListener("pointercancel", onPointerUp);
			cssHost.removeEventListener("wheel", onWheel);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			reducedMotionMedia?.removeEventListener(
				"change",
				onMotionPreferenceChange,
			);
			for (const connector of connectors) {
				connector.geometry.dispose();
				connector.material.dispose();
			}
			for (const ring of decisionRings) {
				ring.geometry.dispose();
				ring.material.dispose();
			}
			renderer.dispose();
			cssHost.replaceChildren();
		},
	};
}

type CameraState = {
	currentTargetX: number;
	currentTargetY: number;
	currentZoom: number;
	dragging: boolean;
	lastX: number;
	lastY: number;
	pointerId: number | null;
	targetX: number;
	targetY: number;
	viewHeight: number;
	viewWidth: number;
	zoom: number;
};

function drawLatticeFrame(
	camera: import("three").OrthographicCamera,
	cameraState: CameraState,
	connectors: readonly ConnectorVisual[],
	decisionRings: readonly DecisionRing[],
	now: number,
	deltaSeconds: number,
) {
	const damping = deltaSeconds === 0 ? 1 : 1 - 0.0008 ** (deltaSeconds * 60);
	cameraState.currentTargetX +=
		(cameraState.targetX - cameraState.currentTargetX) * damping;
	cameraState.currentTargetY +=
		(cameraState.targetY - cameraState.currentTargetY) * damping;
	cameraState.currentZoom +=
		(cameraState.zoom - cameraState.currentZoom) * damping;
	camera.position.set(
		cameraState.currentTargetX,
		cameraState.currentTargetY,
		ORTHOGRAPHIC_CAMERA_DISTANCE,
	);
	camera.zoom = cameraState.currentZoom;
	camera.lookAt(cameraState.currentTargetX, cameraState.currentTargetY, 0);
	camera.updateProjectionMatrix();
	for (const connector of connectors) {
		if (!connector.dynamic) continue;
		const material = connector.material;
		if ("dashOffset" in material)
			material.dashOffset = -(now * 0.001 * connector.speed + connector.phase);
		material.opacity =
			connector.baseOpacity *
			(0.84 + Math.sin(now * 0.002 * connector.speed + connector.phase) * 0.16);
	}
	for (const ring of decisionRings) {
		const pulse = 1 + Math.sin(now * 0.0028) * 0.16;
		ring.mesh.scale.setScalar(pulse);
		ring.material.opacity = 0.68 + (pulse - 0.84) * 0.8;
	}
}

function createResearchCard(
	node: ResearchNodeView,
	onSelect: (nodeId: string) => void,
	isChoice: boolean,
): HTMLButtonElement {
	const visual = getResearchStatusVisual(node.status);
	const card = document.createElement("button");
	card.type = "button";
	card.className = cn(
		"research-lattice-card",
		visual.className,
		node.isKeystone && "research-lattice-card--keystone",
		node.isContext && "research-lattice-card--context",
		isChoice && node.status === "available" && "research-lattice-card--choice",
	);
	card.dataset.researchCard = "true";
	card.dataset.researchStatus = node.status;
	card.dataset.nodeId = node.id;
	card.setAttribute(
		"aria-label",
		`${node.label}; ${node.insightCost} Insight; ${visual.label}${isChoice ? "; Choice — choose one path, locks the other" : ""}`,
	);
	card.setAttribute("aria-pressed", "false");
	card.title = `${node.label}. ${node.description} Prerequisites: ${node.prerequisites.map(humanize).join(", ") || "none"}.`;

	const name = document.createElement("span");
	name.className = "research-lattice-card__name";
	name.textContent = node.label;
	const cost = document.createElement("span");
	cost.className = "research-lattice-card__cost";
	cost.textContent = `${node.insightCost} Insight`;
	const icon = document.createElement("span");
	icon.className = "research-lattice-card__icon";
	icon.setAttribute("aria-hidden", "true");
	icon.textContent = visual.icon;
	const top = document.createElement("span");
	top.className = "research-lattice-card__top";
	top.appendChild(name);
	top.appendChild(icon);

	const meta = document.createElement("span");
	meta.className = "research-lattice-card__meta";
	meta.appendChild(cost);
	card.appendChild(top);
	card.appendChild(meta);

	if (isChoice && node.status === "available") {
		const choice = document.createElement("span");
		choice.className = "lattice-choice-chip";
		choice.textContent = "Choice";
		meta.appendChild(choice);
	}
	if (node.status === "locked-out") {
		const marker = document.createElement("span");
		marker.className = "research-lattice-card__marker";
		marker.textContent = "Path not taken";
		meta.appendChild(marker);
	}
	if (node.status === "in-progress") {
		const progress = document.createElement("span");
		progress.className = "research-lattice-card__progress";
		progress.setAttribute("role", "progressbar");
		progress.setAttribute("aria-label", `Research progress ${node.progress}%`);
		progress.setAttribute("aria-valuemin", "0");
		progress.setAttribute("aria-valuemax", "100");
		progress.setAttribute("aria-valuenow", String(node.progress));
		const fill = document.createElement("span");
		fill.className = "research-lattice-card__progress__fill";
		fill.style.width = `${node.progress}%`;
		progress.appendChild(fill);
		card.appendChild(progress);
	}
	card.addEventListener("click", () => onSelect(node.id));
	return card;
}

function updateOrthographicFrustum(
	camera: import("three").OrthographicCamera,
	nodes: readonly PositionedNode[],
	width: number,
	height: number,
	cameraState: CameraState,
): void {
	const bounds = latticeBounds(nodes);
	const contentWidth =
		bounds.maxX -
		bounds.minX +
		LATTICE_CARD_HALF_WIDTH * 2 +
		LATTICE_FRAME_MARGIN * 2;
	const contentHeight =
		bounds.maxY -
		bounds.minY +
		LATTICE_CARD_HALF_HEIGHT * 2 +
		LATTICE_FRAME_MARGIN * 2;
	const aspect = width / height;
	const viewHeight = Math.max(1, contentHeight, contentWidth / aspect);
	const viewWidth = viewHeight * aspect;
	camera.left = -viewWidth / 2;
	camera.right = viewWidth / 2;
	camera.top = viewHeight / 2;
	camera.bottom = -viewHeight / 2;
	camera.zoom = cameraState.currentZoom;
	cameraState.viewWidth = viewWidth;
	cameraState.viewHeight = viewHeight;
	camera.updateProjectionMatrix();
}

type LatticeBounds = {
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
};

function latticeBounds(nodes: readonly PositionedNode[]): LatticeBounds {
	if (nodes.length === 0) {
		return { maxX: 0, maxY: 0, minX: 0, minY: 0 };
	}
	const xValues = nodes.map((node) => node.x);
	const yValues = nodes.map((node) => -node.y);
	return {
		maxX: maximum(xValues),
		maxY: maximum(yValues),
		minX: minimum(xValues),
		minY: minimum(yValues),
	};
}

function layoutCenter(
	nodes: readonly PositionedNode[],
	THREE: typeof import("three"),
): import("three").Vector3 {
	if (nodes.length === 0) return new THREE.Vector3();
	const xValues = nodes.map((node) => node.x);
	const yValues = nodes.map((node) => node.y);
	const zValues = nodes.map((node) => node.z);
	return new THREE.Vector3(
		(minimum(xValues) + maximum(xValues)) / 2,
		-(minimum(yValues) + maximum(yValues)) / 2,
		(minimum(zValues) + maximum(zValues)) / 2,
	);
}

function readLatticePalette(THREE: typeof import("three")) {
	const styles =
		typeof document === "undefined"
			? null
			: getComputedStyle(document.documentElement);
	return {
		assistant: readColor(
			styles?.getPropertyValue("--game-cyan"),
			"#77d9ea",
			THREE,
		),
		completed: readColor(
			styles?.getPropertyValue("--game-positive"),
			"#4bd49b",
			THREE,
		),
		decision: readColor(
			styles?.getPropertyValue("--game-amber"),
			"#f5b04c",
			THREE,
		),
		locked: readColor(
			styles?.getPropertyValue("--muted-foreground"),
			"#7890b2",
			THREE,
		),
		multimodal: readColor("#c1a6ff", "#c1a6ff", THREE),
		text: readColor(styles?.getPropertyValue("--primary"), "#4fd8e8", THREE),
	};
}

function readColor(
	value: string | undefined,
	fallback: string,
	THREE: typeof import("three"),
): import("three").Color {
	const color = new THREE.Color();
	try {
		color.set(value?.trim() || fallback);
	} catch {
		color.set(fallback);
	}
	return color;
}

function colorForNode(
	node: ResearchNodeView,
	palette: ReturnType<typeof readLatticePalette>,
): import("three").Color {
	const eraColor = palette[node.era];
	const branchTint =
		node.lane === "models"
			? eraColor
			: node.lane === "infrastructure"
				? eraColor.clone().lerp(palette.locked, 0.22)
				: eraColor.clone().lerp(palette.completed, 0.16);
	return branchTint
		.clone()
		.multiplyScalar(node.status === "locked-out" ? 0.55 : 1);
}

function minimum(values: readonly number[]): number {
	return Math.min(...values);
}

function maximum(values: readonly number[]): number {
	return Math.max(...values);
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function LegendIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{icon}
			{label}
		</span>
	);
}

function ResearchDetailPane({
	disabled,
	node,
	onAssignProject,
	onClose,
	state,
}: {
	disabled: boolean;
	node: ResearchNodeView;
	onAssignProject: (teamId: string, projectId: string) => Promise<boolean>;
	onClose: () => void;
	state: GameState;
}) {
	const idleTeams = selectTeams(state).filter((team) => team.status === "idle");
	const [teamId, setTeamId] = useState(idleTeams[0]?.id ?? "");
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const researchProject =
		node.project?.status === "available" ? node.project : undefined;

	useEffect(() => {
		if (!idleTeams.some((team) => team.id === teamId)) {
			setTeamId(idleTeams[0]?.id ?? "");
		}
	}, [idleTeams, teamId]);

	useEffect(() => {
		closeButtonRef.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	async function assignSelectedProject() {
		if (researchProject === undefined || teamId.length === 0) return;
		const assigned = await onAssignProject(teamId, researchProject.id);
		if (assigned) onClose();
	}

	const visual = getResearchStatusVisual(node.status);
	const effectSummary = summarizeResearchEffects(node.effects);
	return (
		<div
			aria-labelledby="research-detail-heading"
			aria-modal="true"
			className="research-lattice-detail"
			role="dialog"
			tabIndex={-1}
		>
			<div className="flex items-start justify-between gap-3 border-border/70 border-b pb-3">
				<div className="min-w-0">
					<p className="font-semibold text-primary text-xs">
						Research node detail
					</p>
					<h2
						id="research-detail-heading"
						className="mt-1 font-semibold text-base text-foreground"
					>
						{node.label}
					</h2>
				</div>
				<button
					aria-label="Close research node detail"
					className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={onClose}
					ref={closeButtonRef}
					type="button"
				>
					<X className="size-4" aria-hidden="true" />
				</button>
			</div>

			<div className="mt-4 grid grid-cols-2 gap-2 border-border/70 border-b pb-3 text-xs">
				<DetailValue label="Status" value={visual.label} />
				<DetailValue
					label="Depth"
					value={`${Math.max(1, node.prerequisites.length + 1)}`}
				/>
				<DetailValue label="Cost" value={`${node.insightCost} Insight`} />
				<DetailValue label="Era" value={ERA_LABELS[node.era]} />
			</div>

			<section
				className="mt-4 space-y-2"
				aria-labelledby="research-effects-heading"
			>
				<h3
					id="research-effects-heading"
					className="font-semibold text-muted-foreground text-xs"
				>
					Effects
				</h3>
				<div className="flex items-start gap-2 border border-primary/25 bg-primary/5 px-3 py-2 text-muted-foreground text-xs leading-5">
					<Info
						className="mt-0.5 size-3.5 shrink-0 text-primary"
						aria-hidden="true"
					/>
					<p>
						{effectSummary ||
							"No direct engine modifier; this node is a research milestone."}
					</p>
				</div>
				<p className="text-muted-foreground text-xs leading-5">
					{node.description}
				</p>
			</section>

			<section
				className="mt-5 space-y-2"
				aria-labelledby="research-prereqs-heading"
			>
				<h3
					id="research-prereqs-heading"
					className="font-semibold text-muted-foreground text-xs"
				>
					Prerequisites
				</h3>
				{node.prerequisites.length > 0 ? (
					<ul className="space-y-1.5">
						{node.prerequisites.map((prerequisite) => {
							const completed = state.research.nodes.some(
								(candidate) =>
									candidate.id === prerequisite &&
									candidate.status === "completed",
							);
							return (
								<li
									className="flex items-center justify-between gap-2 border border-border/70 px-2.5 py-2 text-xs"
									key={prerequisite}
								>
									<span className="min-w-0 truncate text-foreground">
										{humanize(prerequisite)}
									</span>
									<span
										className={cn(
											"shrink-0 text-xs",
											completed
												? "text-[var(--game-positive)]"
												: "text-[var(--game-amber)]",
										)}
									>
										{completed ? "Complete" : "Open"}
									</span>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="border border-border/70 px-2.5 py-2 text-muted-foreground text-xs">
						No prerequisites — this is an entry node.
					</p>
				)}
			</section>

			<section
				className="mt-5 space-y-2 border-border/70 border-t pt-4"
				aria-labelledby="research-assign-heading"
			>
				<h3
					id="research-assign-heading"
					className="font-semibold text-muted-foreground text-xs"
				>
					Assign team
				</h3>
				{node.status === "available" && researchProject !== undefined ? (
					<>
						<label className="sr-only" htmlFor="research-team-select">
							Choose an idle team
						</label>
						<select
							className="h-10 w-full border border-input bg-background px-2 text-foreground text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
							disabled={disabled || idleTeams.length === 0}
							id="research-team-select"
							onChange={(event) => setTeamId(event.target.value)}
							value={teamId}
						>
							<option value="">Choose an idle team…</option>
							{idleTeams.map((team) => (
								<option key={team.id} value={team.id}>
									{team.name} · {team.id}
								</option>
							))}
						</select>
						<Button
							disabled={
								disabled || teamId.length === 0 || idleTeams.length === 0
							}
							onClick={() => void assignSelectedProject()}
							type="button"
						>
							Assign research team
							<ChevronRight data-icon="inline-end" aria-hidden="true" />
						</Button>
						<p className="text-muted-foreground text-xs leading-4">
							This spends {node.insightCost} Insight through the existing
							assign-project command.
						</p>
					</>
				) : node.status === "in-progress" ? (
					<p className="border border-primary/25 bg-primary/5 px-3 py-2 text-muted-foreground text-xs leading-5">
						A team is already working this node: {node.progress}% complete.
					</p>
				) : node.status === "completed" ? (
					<p className="border border-[var(--game-positive)]/30 bg-[var(--game-positive)]/5 px-3 py-2 text-muted-foreground text-xs leading-5">
						{effectSummary
							? "This research effect is active in the engine state."
							: "This node is complete; it has no direct engine modifier."}
					</p>
				) : node.status === "locked-out" ? (
					<p className="border border-slate-500/30 bg-slate-500/5 px-3 py-2 text-muted-foreground text-xs leading-5">
						This branch was not taken after another exclusive path was chosen.
					</p>
				) : (
					<p className="border border-border/70 bg-background/35 px-3 py-2 text-muted-foreground text-xs leading-5">
						Complete the prerequisites and era gate before a team can be
						assigned.
					</p>
				)}
			</section>
		</div>
	);
}

function DetailValue({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-muted-foreground">{label}</p>
			<p className="mt-1 text-foreground">{value}</p>
		</div>
	);
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
