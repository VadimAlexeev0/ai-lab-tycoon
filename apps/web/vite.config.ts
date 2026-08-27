import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackStart({
			prerender: {
				enabled: true,
				autoStaticPathsDiscovery: true,
				crawlLinks: true,
				failOnError: false,
				retryCount: 2,
				filter: ({ path }) => {
					// `/play` is intentionally a public loading shell.
					// Exclude `/game/**`: its useful content is session-bound through
					// GameStateProvider, so crawled links must never become static pages.
					return path === "/" || path === "/play";
				},
			},
		}),
		viteReact(),
	],
});
