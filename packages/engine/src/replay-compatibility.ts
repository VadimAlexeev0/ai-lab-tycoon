/** Internal persisted provenance for migrated v10 command-log replay. */
export const LEGACY_V10_RIVAL_STRATEGY_REPLAY_THROUGH =
	"legacyV10RivalStrategyReplayThroughCommandId" as const;

/** Exact source snapshot authenticated by a migrated replay boundary. */
export const LEGACY_V10_RIVAL_STRATEGY_REPLAY_PROOF =
	"legacyV10RivalStrategyReplayProof" as const;

export type LegacyV10RivalReplayProof = Readonly<{
	sourceSchemaVersion: 10;
	boundaryCommandId: string;
	commandLogPrefix: string;
	era: "text" | "assistant" | "multimodal";
	rivals: readonly {
		id: string;
		name: string;
		archetype: "research_lab" | "platform" | "efficiency";
		focus: "capability" | "reliability" | "distribution";
		progress: number;
		active: boolean;
	}[];
}>;

/** Validate the structural shape of a migration-only boundary proof. */
export function assertLegacyV10RivalReplayProof(
	value: unknown,
): asserts value is LegacyV10RivalReplayProof {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Legacy rival replay proof must be an object");
	}
	const proof = value as Record<string, unknown>;
	const keys = [
		"sourceSchemaVersion",
		"boundaryCommandId",
		"commandLogPrefix",
		"era",
		"rivals",
	];
	if (Object.keys(proof).some((key) => !keys.includes(key))) {
		throw new Error("Legacy rival replay proof contains an unexpected field");
	}
	if (proof.sourceSchemaVersion !== 10) {
		throw new Error("Legacy rival replay proof must identify v10 source state");
	}
	if (typeof proof.boundaryCommandId !== "string") {
		throw new Error("Legacy rival replay proof boundary must be a string");
	}
	if (proof.boundaryCommandId.trim().length === 0) {
		throw new Error("Legacy rival replay proof boundary must not be empty");
	}
	if (typeof proof.commandLogPrefix !== "string") {
		throw new Error(
			"Legacy rival replay proof command prefix must be a string",
		);
	}
	if (proof.commandLogPrefix.trim().length === 0) {
		throw new Error(
			"Legacy rival replay proof command prefix must not be empty",
		);
	}
	if (
		proof.era !== "text" &&
		proof.era !== "assistant" &&
		proof.era !== "multimodal"
	) {
		throw new Error("Legacy rival replay proof era is invalid");
	}
	if (!Array.isArray(proof.rivals)) {
		throw new Error("Legacy rival replay proof rivals must be an array");
	}
	if (proof.rivals.length > 3) {
		throw new Error("Legacy rival replay proof contains too many rivals");
	}

	const ids = new Set<string>();
	for (const rival of proof.rivals) {
		if (rival === null || typeof rival !== "object" || Array.isArray(rival)) {
			throw new Error("Legacy rival replay proof contains an invalid rival");
		}
		const item = rival as Record<string, unknown>;
		if (
			Object.keys(item).some(
				(key) =>
					!["id", "name", "archetype", "focus", "progress", "active"].includes(
						key,
					),
			)
		) {
			throw new Error(
				"Legacy rival replay proof rival contains an unexpected field",
			);
		}
		if (typeof item.id !== "string" || item.id.trim().length === 0) {
			throw new Error("Legacy rival replay proof rival id is invalid");
		}
		if (ids.has(item.id)) {
			throw new Error(`Legacy rival replay proof repeats rival id: ${item.id}`);
		}
		ids.add(item.id);
		if (typeof item.name !== "string" || item.name.trim().length === 0) {
			throw new Error("Legacy rival replay proof rival name is invalid");
		}
		if (
			item.archetype !== "research_lab" &&
			item.archetype !== "platform" &&
			item.archetype !== "efficiency"
		) {
			throw new Error("Legacy rival replay proof rival archetype is invalid");
		}
		if (
			item.focus !== "capability" &&
			item.focus !== "reliability" &&
			item.focus !== "distribution"
		) {
			throw new Error("Legacy rival replay proof rival focus is invalid");
		}
		if (
			typeof item.progress !== "number" ||
			!Number.isSafeInteger(item.progress) ||
			item.progress < 0 ||
			item.progress > 100
		) {
			throw new Error("Legacy rival replay proof rival progress is invalid");
		}
		if (typeof item.active !== "boolean") {
			throw new Error("Legacy rival replay proof rival active flag is invalid");
		}
	}
}
