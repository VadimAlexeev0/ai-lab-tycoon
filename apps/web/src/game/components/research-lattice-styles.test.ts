// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const treePath = resolve(currentDirectory, "research-tree-3d.tsx");
const stylesheetPath = resolve(
	currentDirectory,
	"../../../../../packages/ui/src/styles/globals.css",
);

const customClassPattern =
	/\b(?:research-lattice-[a-z0-9_-]+|lattice-status-[a-z0-9_-]+|lattice-choice-chip)\b/g;
const cssClassDefinitionPattern = /\.([a-z][a-z0-9_-]*)\b/gi;

function classesReferencedBy(source: string): Set<string> {
	const classNameSource = source.replace(
		/\b(?:id|aria-[a-z-]+|data-[a-z-]+)\s*=\s*["'][^"']*["']/gi,
		"",
	);
	return new Set(classNameSource.match(customClassPattern) ?? []);
}

function classesDefinedBy(stylesheet: string): Set<string> {
	return new Set(
		[...stylesheet.matchAll(cssClassDefinitionPattern)].map(
			(match) => match[1] ?? "",
		),
	);
}

describe("research lattice stylesheet contract", () => {
	it("defines every research lattice class used by the tree", () => {
		const treeClasses = classesReferencedBy(readFileSync(treePath, "utf8"));
		const definedClasses = classesDefinedBy(readFileSync(stylesheetPath, "utf8"));
		const missingClasses = [...treeClasses]
			.filter((className) => !definedClasses.has(className))
			.sort();

		expect(missingClasses).toEqual([]);
	});
});
