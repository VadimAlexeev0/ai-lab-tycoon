import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ai-lab-tycoon/ui/components/dialog";
import { Separator } from "@ai-lab-tycoon/ui/components/separator";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type DialogChangeEventDetails = Parameters<
	NonNullable<ComponentProps<typeof Dialog>["onOpenChange"]>
>[1];

export default function Pane({
	blocking,
	children,
	description,
	onClose,
	title,
}: {
	blocking: boolean;
	children: ReactNode;
	description?: string;
	onClose: () => void;
	title: string;
}) {
	function handleOpenChange(
		open: boolean,
		eventDetails: DialogChangeEventDetails,
	) {
		if (open) return;
		if (blocking) {
			// Base UI exposes the same cancellation point as the Radix
			// onEscapeKeyDown/onInteractOutside handlers.
			eventDetails.cancel();
			return;
		}
		onClose();
	}

	return (
		<Dialog
			disablePointerDismissal={blocking}
			onOpenChange={handleOpenChange}
			open
		>
			<DialogContent
				className="surface-card max-h-[min(90svh,48rem)] w-full max-w-2xl overflow-y-auto bg-background/95 p-4 shadow-2xl sm:max-w-2xl sm:p-5"
				showCloseButton={false}
			>
				<DialogHeader>
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="font-semibold text-primary text-xs">
								{blocking ? "Required action" : "Decision detail"}
							</p>
							<DialogTitle className="mt-1 font-semibold text-base text-foreground">
								{title}
							</DialogTitle>
							{description ? (
								<DialogDescription className="mt-1 text-muted-foreground text-xs leading-5">
									{description}
								</DialogDescription>
							) : null}
						</div>
						{blocking ? (
							<span className="shrink-0 border border-[var(--game-amber)]/50 bg-[var(--game-amber)]/10 px-2 py-1 text-[var(--game-amber)] text-xs">
								Cannot dismiss
							</span>
						) : (
							<DialogClose
								aria-label="Close pane"
								className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
								type="button"
							>
								<X className="size-4" aria-hidden="true" />
							</DialogClose>
						)}
					</div>
				</DialogHeader>
				<Separator className="mt-3" />
				<div className="pt-1">{children}</div>
			</DialogContent>
		</Dialog>
	);
}
