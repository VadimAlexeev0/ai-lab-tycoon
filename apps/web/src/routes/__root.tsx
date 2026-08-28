import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";

import { Toaster } from "@ai-lab-tycoon/ui/components/sonner";
import {
	THEME_INIT_SCRIPT,
	ThemeProvider,
} from "@ai-lab-tycoon/ui/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useLocation,
} from "@tanstack/react-router";

import type { orpc } from "@/utils/orpc";

import Header from "../components/header";

import appCss from "../index.css?url";
export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{
				name: "theme-color",
				content: "#0a0e1a",
				media: "(prefers-color-scheme: dark)",
			},
			{
				name: "theme-color",
				content: "#f4f7fb",
				media: "(prefers-color-scheme: light)",
			},
			{
				title: "AI Startup Lab Tycoon",
			},
			{
				name: "description",
				content:
					"A deterministic strategy dashboard for building an AI startup.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	const location = useLocation();
	const isLanding = location.pathname === "/";
	const isGameRoute = location.pathname.startsWith("/game");

	return (
		<html
			lang="en"
			className="dark"
			data-mode="dark"
			data-theme="midnight"
			data-theme-mode="dark"
			suppressHydrationWarning
		>
			<head>
				<script
					dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
					id="ailt-theme-init"
				/>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider>
					<a className="skip-link" href="#main-content">
						Skip to main content
					</a>
					{isGameRoute ? (
						<Outlet />
					) : (
						<div className="grid h-svh grid-rows-[auto_1fr]">
							<Header minimal={isLanding} />
							<Outlet />
						</div>
					)}
					<Toaster richColors />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
