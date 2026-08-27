import { ThemeSwitcher } from "@ai-lab-tycoon/ui/components/theme-switcher";
import { Link as RouterLink } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export default function Header({ minimal = false }: { minimal?: boolean }) {
	return (
		<header className="site-header border-border/80 border-b bg-card/80 backdrop-blur-sm">
			<div className="mx-auto flex min-h-12 w-full max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-1.5 sm:px-6 lg:px-8">
				<RouterLink
					to="/"
					aria-label="AI Startup Lab Tycoon home"
					className="group flex min-h-11 min-w-0 items-center gap-3"
				>
					<span className="flex size-7 shrink-0 items-center justify-center border border-primary/50 bg-primary/10 font-bold text-[10px] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
						AI
					</span>
					<span className="min-w-0">
						<span className="block truncate font-semibold text-foreground text-xs">
							AI Startup Lab
						</span>
						<span className="hidden text-muted-foreground text-xs sm:block">
							Tycoon / operations console
						</span>
					</span>
				</RouterLink>

				{minimal ? (
					<div className="max-w-full overflow-x-auto">
						<ThemeSwitcher />
					</div>
				) : (
					<div className="flex shrink-0 items-center gap-2 font-semibold text-muted-foreground text-xs sm:gap-3">
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
				)}
			</div>
		</header>
	);
}
