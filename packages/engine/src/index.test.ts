import { expect, it } from "vitest";

import { ENGINE_PACKAGE_NAME } from "./index.js";

it("exposes the pure engine package entry point", () => {
	expect(ENGINE_PACKAGE_NAME).toBe("@ai-lab-tycoon/engine");
});
