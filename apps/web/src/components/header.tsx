import { Link as RouterLink } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export default function Header() {
	return (
		<header className="border-border/80 border-b bg-card/80 backdrop-blur-sm">
			<div className="mx-auto flex min-h-12 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				<RouterLink
					to="/"
					aria-label="AI Startup Lab Tycoon home"
					className="group flex min-w-0 items-center gap-3"
				>
					<span className="flex size-7 shrink-0 items-center justify-center border border-primary/50 bg-primary/10 font-bold font-mono text-[10px] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
						AI
					</span>
					<span className="min-w-0">
						<span className="block truncate font-mono font-semibold text-foreground text-xs uppercase tracking-[0.16em]">
							AI Startup Lab
						</span>
						<span className="hidden font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em] sm:block">
							Tycoon / operations console
						</span>
					</span>
				</RouterLink>

				<div className="flex shrink-0 items-center gap-2 font-mono font-semibold text-[9px] text-muted-foreground uppercase tracking-[0.16em] sm:gap-3">
					<span className="hidden items-center gap-1.5 sm:flex">
						<Activity
							className="size-3 text-[var(--game-positive)]"
							aria-hidden="true"
						/>
						Live systems
					</span>
					<span className="border border-border px-2 py-1 text-primary">
						V1.0
					</span>
				</div>
			</div>
		</header>
	);
}
