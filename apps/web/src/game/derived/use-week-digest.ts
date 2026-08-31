import type { GameState } from "@ai-lab-tycoon/engine";
import { useEffect, useMemo, useRef } from "react";

import {
	deriveWeekDigest,
	diffResourceBar,
	emptyResourceDeltas,
	type ResourceDeltas,
	type WeekDigest,
} from "./week-digest";

export type UseWeekDigestResult = {
	digest: WeekDigest;
	deltas: ResourceDeltas;
};

type StateSnapshot = {
	revision: number;
	state: GameState;
};

const SNAPSHOT_RING_SIZE = 2;

/**
 * Derive event feedback from the latest revision while retaining two public
 * state snapshots for consumers that need short-term velocity later.
 *
 * The revision, rather than the displayed week, is the identity of a state
 * change. Decisions and purchases can change resources without advancing the
 * week, so using meta.week here would produce stale deltas.
 */
export function useWeekDigest(
	state: GameState | null,
	revision: number | undefined,
): UseWeekDigestResult {
	const snapshotsRef = useRef<StateSnapshot[]>([]);
	const runIdRef = useRef<string | null>(null);
	const runId = state?.meta.runId ?? null;

	const result = useMemo<UseWeekDigestResult>(() => {
		if (runIdRef.current !== runId) {
			runIdRef.current = runId;
			snapshotsRef.current = [];
		}

		if (state === null || revision === undefined) {
			return {
				digest: {
					week: state?.meta.week ?? 0,
					facts: [],
					launches: [],
					resumes: [],
					trainingCompletions: [],
					evaluations: [],
					incidents: [],
					fundingEvents: [],
					projectCompletions: [],
					servingThrottles: [],
					trainingStarvations: [],
				},
				deltas: emptyResourceDeltas(),
			};
		}

		const previous = snapshotsRef.current
			.filter((snapshot) => snapshot.revision < revision)
			.at(-1)?.state;

		return {
			digest: deriveWeekDigest(previous ?? null, state),
			deltas: previous
				? diffResourceBar(previous, state)
				: emptyResourceDeltas(),
		};
	}, [revision, runId, state]);

	useEffect(() => {
		if (state === null || revision === undefined) return;
		if (runIdRef.current !== state.meta.runId) {
			runIdRef.current = state.meta.runId;
			snapshotsRef.current = [];
		}
		if (
			snapshotsRef.current.some((snapshot) => snapshot.revision === revision)
		) {
			return;
		}
		snapshotsRef.current = [...snapshotsRef.current, { revision, state }].slice(
			-SNAPSHOT_RING_SIZE,
		);
	}, [revision, state]);

	return result;
}
