export const MAX_COMMAND_LOG_ENTRIES = 5_000;
export const MAX_JSON_NESTING_DEPTH = 64;
export const MAX_RUN_WEEK = 10_000;
export const MAX_PUBLIC_SAVE_ERROR_LENGTH = 160;

export type SaveStatus = "active" | "terminal";

export type ExistingRunMetadata = Readonly<{
	status: SaveStatus;
	currentWeek: number;
}>;

export type IncomingRunMetadata = Readonly<{
	status: SaveStatus;
	currentWeek: number;
}>;

/** Require the redundant envelope metadata to agree with engine state. */
export function assertCurrentWeekMatchesState(
	currentWeek: number,
	stateWeek: number,
): void {
	if (currentWeek !== stateWeek) {
		throw new Error(
			`Save currentWeek ${currentWeek} must match game state week ${stateWeek}`,
		);
	}
}

/** Keep persisted runs inside a practical, abuse-resistant week range. */
export function assertWeekWithinLimit(
	week: number,
	maxWeek = MAX_RUN_WEEK,
): void {
	if (week > maxWeek) {
		throw new Error(`Save week cannot exceed ${maxWeek}`);
	}
}

/** Prevent terminal snapshots from being rewritten or reopened. */
export function assertExistingRunUpdateAllowed(
	existing: ExistingRunMetadata,
	incoming: IncomingRunMetadata,
): void {
	if (existing.status === "terminal") {
		throw new Error("Terminal saves are immutable and cannot be updated");
	}
	if (incoming.currentWeek < existing.currentWeek) {
		throw new Error("Save week cannot go backwards");
	}
}

/** Keep public validation responses short and safe for UI/log boundaries. */
export function sanitizePublicSaveError(
	cause: unknown,
	fallback: string,
): string {
	const rawMessage =
		cause instanceof Error && cause.message.length > 0
			? cause.message
			: fallback;
	const message = [...rawMessage]
		.map((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
				? " "
				: character;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	if (message.length === 0) return "Invalid game state";
	if (message.length <= MAX_PUBLIC_SAVE_ERROR_LENGTH) return message;
	return `${message.slice(0, MAX_PUBLIC_SAVE_ERROR_LENGTH - 1)}…`;
}

export function isUniqueConstraintError(cause: unknown): boolean {
	const message =
		cause instanceof Error
			? cause.message
			: typeof cause === "object" && cause !== null && "message" in cause
				? String((cause as { message: unknown }).message)
				: String(cause);
	return /unique|constraint failed|runs_user_id_unique|runs\.user_id/i.test(
		message,
	);
}

/** Reject command logs before accepting a potentially expensive save. */
export function assertCommandLogLimit(
	commandLog: Readonly<{ length: number }>,
	maxEntries = MAX_COMMAND_LOG_ENTRIES,
): void {
	if (commandLog.length > maxEntries) {
		throw new Error(
			`Game state command log cannot contain more than ${maxEntries} entries`,
		);
	}
}

/**
 * Scan serialized state JSON before JSON.parse. Brackets inside strings are
 * ignored so company names and command payload text do not affect the limit.
 */
export function assertJsonNestingDepth(
	json: string,
	maxDepth = MAX_JSON_NESTING_DEPTH,
): void {
	let depth = 0;
	let escaped = false;
	let inString = false;

	for (let index = 0; index < json.length; index += 1) {
		const character = json[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (character === "\\") {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}
		if (character === '"') {
			inString = true;
			continue;
		}
		if (character === "[" || character === "{") {
			depth += 1;
			if (depth > maxDepth) {
				throw new Error(
					`Game state JSON nesting depth cannot exceed ${maxDepth}`,
				);
			}
		} else if (character === "]" || character === "}") {
			depth = Math.max(0, depth - 1);
		}
	}
}
