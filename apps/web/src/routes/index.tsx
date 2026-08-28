import { Button } from "@ai-lab-tycoon/ui/components/button";
import { ThemeSwitcher } from "@ai-lab-tycoon/ui/components/theme-switcher";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import ArtFrame from "@/game/components/art-frame";
import PlaceholderBadge from "@/game/components/placeholder-badge";

const FEATURES = [
	{
		number: "01",
		src: "/art-v2/torus-ice.png",
		title: "Research the frontier",
		description:
			"Climb a real LLM-history tree from 2014 to 2026, choosing what your lab learns next.",
	},
	{
		number: "02",
		src: "/art-v2/light-prism.png",
		title: "Ship models, live with consequences",
		description:
			"Turn research into products while incidents, trust, and public responsibility follow.",
	},
	{
		number: "03",
		src: "/art-v2/nested-arcs.png",
		title: "Outmaneuver rivals",
		description:
			"Read rival doctrines, anticipate their moves, and make trade-offs no dashboard can hide.",
	},
	{
		number: "04",
		src: "/art-v2/sphere-amber-seed.png",
		title: "Every run remembered",
		description:
			"Your Chronicle, Lineage, and Notebook preserve the decisions that shaped the lab.",
	},
] as const;

const ARCHIVE_SURFACES = [
	{
		to: "/game/chronicle",
		label: "Chronicle",
		description: "See the run's consequential moments.",
	},
	{
		to: "/game/lineage",
		label: "Lineage",
		description: "Trace how choices compound over time.",
	},
	{
		to: "/game/notebook",
		label: "Notebook",
		description: "Collect the signals worth carrying forward.",
	},
	{
		to: "/game/agiprogram",
		label: "AGI program",
		description: "Watch the seed signal move toward the frontier.",
	},
] as const;

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "AI Startup Lab Tycoon · Build the future" },
			{
				name: "description",
				content:
					"A deterministic strategy game of research, rivals, and responsibility in the AI race.",
			},
		],
	}),
	component: LandingPage,
});

function LandingPage() {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="game-shell h-full min-h-0 overflow-y-auto overflow-x-clip bg-background"
		>
			<section
				aria-labelledby="landing-hero-heading"
				className="relative isolate flex min-h-[34rem] items-center overflow-hidden border-border/70 border-b sm:min-h-[40rem]"
			>
				<ArtFrame
					alt=""
					className="absolute inset-0 h-full w-full rounded-none opacity-75 ring-0"
					loading="eager"
					src="/art-v2/hero-single-monolith.png"
					tint="bg-background/45"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_38%,transparent_0%,var(--background)_76%)] opacity-90"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/25 via-transparent to-background"
				/>
				<div className="relative z-10 mx-auto grid w-full max-w-[1600px] gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(19rem,0.75fr)] lg:items-center lg:gap-16 lg:px-8">
					<div className="anim-fade-up min-w-0 max-w-3xl">
						<p className="meta-label text-primary">
							AI Startup Lab / V1 sandbox
						</p>
						<h1
							id="landing-hero-heading"
							className="mt-4 max-w-[13ch] font-display font-semibold text-4xl text-foreground leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-6xl"
						>
							Run the lab that builds the future.
						</h1>
						<p className="mt-6 max-w-2xl text-base text-muted-foreground leading-7 sm:text-lg">
							A deterministic strategy game of research, rivals, and
							responsibility in the AI race.
						</p>
						<div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
							<Button
								className="h-11 px-4 text-sm motion-reduce:transition-none sm:h-12"
								nativeButton={false}
								render={<Link to="/play" />}
								size="lg"
							>
								Start playing
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Button>
							<Button
								className="h-11 px-4 text-sm motion-reduce:transition-none sm:h-12"
								nativeButton={false}
								render={<a href="#features" />}
								size="lg"
								variant="ghost"
							>
								How it works
							</Button>
						</div>
						<div className="glass-pane glass-edge mt-10 max-w-md bg-background/45 p-4 backdrop-blur-sm sm:mt-12">
							<div className="flex items-center gap-2">
								<span
									aria-hidden="true"
									className="size-2 rounded-full bg-primary shadow-[0_0_14px_var(--primary)]"
								/>
								<p className="meta-label text-primary">
									Decision surface / 2030
								</p>
							</div>
							<p className="mt-3 text-foreground text-sm leading-6">
								The future is not a score. It is a chain of decisions you can
								read, replay, and own.
							</p>
							<div className="mt-4 grid grid-cols-3 gap-2 text-sm">
								<HeroSignal label="Seeded" value="01" />
								<HeroSignal label="Replayable" value="∞" />
								<HeroSignal label="No timers" value="00" />
							</div>
						</div>
					</div>
					<div className="anim-fade-up hidden min-w-0 justify-self-end lg:block">
						<div className="glass-pane glass-edge max-w-sm bg-background/45 p-5">
							<p className="meta-label text-muted-foreground">
								The operating premise
							</p>
							<p className="mt-4 font-display font-medium text-2xl text-foreground leading-tight">
								Progress compounds. So does responsibility.
							</p>
							<div className="mt-8 space-y-3 border-border/70 border-t pt-4 text-muted-foreground text-sm">
								<p className="flex items-start gap-3">
									<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
									Every week advances the frontier and changes the context.
								</p>
								<p className="flex items-start gap-3">
									<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--game-amber)]" />
									Every launch leaves a mechanical record.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section
				id="features"
				aria-labelledby="features-heading"
				className="mx-auto w-full max-w-[1600px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
			>
				<div className="max-w-3xl">
					<p className="meta-label text-primary">Four systems / one run</p>
					<h2
						id="features-heading"
						className="mt-3 font-display font-semibold text-3xl text-foreground leading-tight sm:text-4xl"
					>
						A strategy game with a memory.
					</h2>
					<p className="mt-4 max-w-2xl text-base text-muted-foreground leading-7">
						Build an AI company inside a living history of the field. The lab
						moves forward, but your reasoning stays visible.
					</p>
				</div>
				<div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{FEATURES.map((feature) => (
						<article
							className="glass-pane glass-edge group flex min-w-0 flex-col overflow-hidden p-3 transition-colors hover:border-[color-mix(in_srgb,var(--game-cyan)_35%,var(--game-hairline))] motion-reduce:transition-none"
							key={feature.number}
						>
							<ArtFrame
								alt=""
								className="h-28 w-full rounded-lg ring-0 sm:h-32"
								loading="lazy"
								src={feature.src}
								tint="bg-background/15"
							/>
							<div className="flex flex-1 flex-col p-2 pt-5">
								<p className="meta-label text-primary">
									{feature.number} / signal
								</p>
								<h3 className="mt-3 font-display font-semibold text-foreground text-lg leading-tight">
									{feature.title}
								</h3>
								<p className="mt-3 text-muted-foreground text-sm leading-6">
									{feature.description}
								</p>
							</div>
						</article>
					))}
				</div>
			</section>

			<section
				aria-labelledby="built-different-heading"
				className="border-border/70 border-y bg-card/25"
			>
				<div className="mx-auto grid w-full max-w-[1600px] gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-center lg:px-8">
					<div className="max-w-xl">
						<p className="meta-label text-primary">Built different</p>
						<h2
							id="built-different-heading"
							className="mt-3 font-display font-semibold text-3xl text-foreground leading-tight"
						>
							No waiting rooms. No hidden dice.
						</h2>
						<p className="mt-4 text-base text-muted-foreground leading-7">
							A deliberate sandbox for thinking through the trade-offs behind
							technical progress.
						</p>
					</div>
					<ul className="grid gap-3 sm:grid-cols-3">
						<BuiltDifferentItem>
							<strong className="font-semibold text-foreground">
								Deterministic engine
							</strong>
							<span>Seeded, replayable outcomes.</span>
						</BuiltDifferentItem>
						<BuiltDifferentItem>
							<strong className="font-semibold text-foreground">
								No timers or energy
							</strong>
							<span>Play at the pace of the decision.</span>
						</BuiltDifferentItem>
						<BuiltDifferentItem>
							<strong className="font-semibold text-foreground">
								Saves owned by you
							</strong>
							<span>Anonymous auth, one autosave.</span>
						</BuiltDifferentItem>
					</ul>
				</div>
			</section>

			<section
				aria-labelledby="archive-heading"
				className="mx-auto w-full max-w-[1600px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
			>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div className="max-w-2xl">
						<p className="meta-label text-primary">
							Archive / discoverable surfaces
						</p>
						<h2
							id="archive-heading"
							className="mt-3 font-display font-semibold text-3xl text-foreground leading-tight sm:text-4xl"
						>
							Leave a trace worth revisiting.
						</h2>
					</div>
					<p className="max-w-md text-base text-muted-foreground leading-7">
						The archive is where a run becomes more than a score: a record of
						what you noticed and what you chose.
					</p>
					<PlaceholderBadge className="self-start sm:self-end" />
				</div>
				<div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{ARCHIVE_SURFACES.map((surface) => (
						<Link
							className="glass-pane glass-edge glass-edge-amber group flex min-w-0 flex-col p-4 transition-colors hover:bg-card motion-reduce:transition-none"
							key={surface.to}
							to={surface.to}
						>
							<div className="flex items-start justify-between gap-3">
								<h3 className="font-display font-semibold text-foreground text-lg">
									{surface.label}
								</h3>
								<ChevronRight
									className="mt-0.5 size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
									aria-hidden="true"
								/>
							</div>
							<p className="mt-3 text-muted-foreground text-sm leading-6">
								{surface.description}
							</p>
						</Link>
					))}
				</div>
			</section>

			<footer className="border-border/70 border-t bg-card/20">
				<div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
					<div>
						<p className="font-display font-semibold text-foreground text-lg">
							AI Startup Lab
						</p>
						<p className="mt-2 text-muted-foreground text-sm">
							V1 sandbox · Build carefully. Ship deliberately.
						</p>
					</div>
					<div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
						<p className="meta-label text-muted-foreground">Display system</p>
						<div className="max-w-full overflow-x-auto pb-1">
							<ThemeSwitcher />
						</div>
					</div>
				</div>
			</footer>
		</main>
	);
}

function HeroSignal({ label, value }: { label: string; value: string }) {
	return (
		<div className="border border-border/70 bg-background/35 px-2 py-2">
			<p className="text-muted-foreground text-sm">{label}</p>
			<p className="mt-1 font-display font-semibold text-foreground text-lg leading-none">
				{value}
			</p>
		</div>
	);
}

function BuiltDifferentItem({ children }: { children: ReactNode }) {
	return (
		<li className="glass-pane flex min-w-0 items-start gap-3 bg-background/35 p-4">
			<Check
				className="mt-0.5 size-4 shrink-0 text-primary"
				aria-hidden="true"
			/>
			<span className="flex min-w-0 flex-col gap-1 text-muted-foreground text-sm leading-6">
				{children}
			</span>
		</li>
	);
}
