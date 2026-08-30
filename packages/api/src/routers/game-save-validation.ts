export const MAX_COMMAND_LOG_ENTRIES = 5_000;
export const MAX_JSON_NESTING_DEPTH = 64;

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
