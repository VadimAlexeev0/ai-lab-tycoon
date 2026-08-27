import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";

import { Toaster } from "@ai-lab-tycoon/ui/components/sonner";
import {
	THEME_INIT_SCRIPT,
	ThemeProvider,
} from "@ai-lab-tycoon/ui/components/theme-provider";
import { ThemeSwitcher } from "@ai-lab-tycoon/ui/components/theme-switcher";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
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
				content: "width=device-width, initial-scale=1",
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
					<div className="grid h-svh grid-rows-[auto_1fr]">
						<div className="relative">
							<Header />
							<div className="pointer-events-none absolute inset-x-0 top-full z-20 flex justify-end px-4 pt-2 sm:px-6 lg:px-8">
								<div className="pointer-events-auto">
									<ThemeSwitcher />
								</div>
							</div>
						</div>
						<Outlet />
					</div>
					<Toaster richColors />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
