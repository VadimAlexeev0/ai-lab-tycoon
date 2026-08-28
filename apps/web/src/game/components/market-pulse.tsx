import { type GameState, selectResourceBar } from "@ai-lab-tycoon/engine";
import { cn } from "@ai-lab-tycoon/ui/lib/utils";
import { useRef } from "react";
import type * as THREE from "three";

import { useWeekDigest } from "@/game/derived/use-week-digest";
import { useRunState } from "@/game/game-state-context";

import { type ThreeSceneContext, useThreeScene } from "./three-scene";

const MAX_MARKET_POINTS = 52;

type MarketPoint = {
	cashDelta: number;
	week: number;
};

type MarketObjects = {
	colors: Float32Array;
	pointGeometry: THREE.BufferGeometry;
	pointMaterial: THREE.PointsMaterial;
	points: THREE.Points;
	positions: Float32Array;
};

export type MarketPulseProps = {
	animate?: boolean;
	className?: string;
	showCurrentCash?: boolean;
	state: GameState;
	weeks?: number;
};

export default function MarketPulse({
	animate = true,
	className,
	showCurrentCash = true,
	state,
	weeks = 13,
}: MarketPulseProps) {
	const { revision } = useRunState();
	const { deltas } = useWeekDigest(state, revision);
	const historyRef = useRef<MarketPoint[]>([]);
	const seenRevisionRef = useRef<string | null>(null);
	const revisionKey = `${state.meta.runId}:${revision ?? "initial"}`;
	if (seenRevisionRef.current !== revisionKey) {
		historyRef.current = [
			...historyRef.current,
			{ cashDelta: deltas.cash, week: state.meta.week },
		].slice(-Math.min(MAX_MARKET_POINTS, Math.max(1, weeks)));
		seenRevisionRef.current = revisionKey;
	}
	const points = historyRef.current;
	const currentCash = selectResourceBar(state).cash;
	const { canvasRef, hostRef, unavailable } = useThreeScene({
		animate,
		drawFrame: (context, now, deltaSeconds) =>
			drawMarketFrame(context, points, now, deltaSeconds),
		setup: (context) => createMarketObjects(context),
	});

	return (
		<div
			ref={hostRef}
			className={cn(
				"relative h-20 min-h-20 w-full min-w-0 overflow-hidden",
				className,
			)}
			data-three-scene="market-pulse"
		>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				tabIndex={-1}
				className="h-full w-full"
			/>
			{unavailable ? (
				<div className="absolute inset-2 flex items-center justify-center rounded-lg border border-[var(--game-hairline)] bg-background/45 px-3">
					<MarketDataSummary
						currentCash={currentCash}
						points={points}
						showCurrentCash={showCurrentCash}
					/>
				</div>
			) : null}
			<div className="sr-only" data-scene-summary="market-pulse">
				<p>Market pulse waveform for recent cash movement.</p>
				<MarketDataSummary
					currentCash={currentCash}
					points={points}
					showCurrentCash={showCurrentCash}
				/>
			</div>
		</div>
	);
}

function createMarketObjects(context: ThreeSceneContext): () => void {
	const { THREE, root } = context;
	context.camera.position.z = 5.8;
	const positions = new Float32Array(MAX_MARKET_POINTS * 3);
	const colors = new Float32Array(MAX_MARKET_POINTS * 3);
	const pointGeometry = new THREE.BufferGeometry();
	pointGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(positions, 3),
	);
	pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	const pointMaterial = new THREE.PointsMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		size: 0.085,
		transparent: true,
		vertexColors: true,
	});
	const points = new THREE.Points(pointGeometry, pointMaterial);
	root.add(points);
	const objects: MarketObjects = {
		colors,
		pointGeometry,
		pointMaterial,
		points,
		positions,
	};
	root.userData.marketObjects = objects;
	return () => {
		delete root.userData.marketObjects;
		pointGeometry.dispose();
		pointMaterial.dispose();
	};
}

function drawMarketFrame(
	context: ThreeSceneContext,
	history: MarketPoint[],
	now: number,
	deltaSeconds: number,
): void {
	const objects = context.root.userData.marketObjects as
		| MarketObjects
		| undefined;
	if (objects === undefined) return;
	if (deltaSeconds > 0)
		context.root.rotation.y = Math.sin(now * 0.00018) * 0.018;
	const coarse =
		typeof window !== "undefined" &&
		window.matchMedia("(pointer: coarse)").matches;
	const count = Math.min(
		coarse ? MAX_MARKET_POINTS / 2 : MAX_MARKET_POINTS,
		history.length,
	);
	const startIndex = history.length - count;
	const maxMagnitude = Math.max(
		1,
		...history.map((point) => Math.abs(point.cashDelta)),
	);
	const shimmerIndex = count > 0 ? Math.floor(now / 180) % count : -1;
	for (let index = 0; index < count; index += 1) {
		const point = history[startIndex + index];
		const offset = index * 3;
		const x = count <= 1 ? 0 : -2.7 + (index / (count - 1)) * 5.4;
		const y = Math.max(
			-1.05,
			Math.min(1.05, (point.cashDelta / maxMagnitude) * 1.05),
		);
		objects.positions[offset] = x;
		objects.positions[offset + 1] = y;
		objects.positions[offset + 2] = 0;
		const color =
			point.cashDelta >= 0 ? context.theme.positive : context.theme.negative;
		const shimmer = index === shimmerIndex ? 1.7 : 1;
		objects.colors[offset] = Math.min(1, color.r * shimmer);
		objects.colors[offset + 1] = Math.min(1, color.g * shimmer);
		objects.colors[offset + 2] = Math.min(1, color.b * shimmer);
	}
	objects.pointGeometry.setDrawRange(0, count);
	objects.pointGeometry.getAttribute("position").needsUpdate = true;
	objects.pointGeometry.getAttribute("color").needsUpdate = true;
}

function MarketDataSummary({
	currentCash,
	points,
	showCurrentCash,
}: {
	currentCash: number;
	points: MarketPoint[];
	showCurrentCash: boolean;
}) {
	return (
		<div className="space-y-1 text-muted-foreground text-xs">
			{showCurrentCash ? (
				<p className="numeric-value">
					Cash on hand: ${Math.round(currentCash)}
				</p>
			) : null}
			<p>
				{points.length > 0
					? `Recent cash deltas: ${points.map((point) => `${point.week} ${Math.round(point.cashDelta)}`).join(", ")}`
					: "No cash movement recorded yet."}
			</p>
		</div>
	);
}
