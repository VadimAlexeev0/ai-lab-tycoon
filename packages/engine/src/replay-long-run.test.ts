import { describe, expect, it } from "vitest";
import { advanceWeek, startRun } from "./index.js";
import { replayCommandLog } from "./replay.js";

describe("long-run command-log replay", () => {
	it("replays 110 weeks without diverging", { timeout: 60_000 }, () => {
		let state = startRun({ companyName: "Replay Labs" }, 3);
		for (
			let week = 0;
			week < 110 && state.terminal.status === "active";
			week += 1
		) {
			state = advanceWeek(state).state;
		}

		expect(() =>
			replayCommandLog(state.commandLog, { expectedState: state }),
		).not.toThrow();
	});
});
