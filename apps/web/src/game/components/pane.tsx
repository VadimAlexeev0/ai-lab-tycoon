import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
	'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;

	useEffect(() => {
		const previousFocus =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const dialog = dialogRef.current;
		if (dialog === null) return;
		const dialogElement: HTMLDivElement = dialog;

		const focusFirstControl = () => {
			const first =
				dialogElement.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
			(first ?? dialogElement).focus({ preventScroll: true });
		};
		focusFirstControl();

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				if (!blocking) {
					event.preventDefault();
					closeRef.current();
				}
				return;
			}
			if (event.key !== "Tab") return;

			const controls = Array.from(
				dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
			);
			if (controls.length === 0) {
				event.preventDefault();
				dialogElement.focus();
				return;
			}
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (previousFocus?.isConnected)
				previousFocus.focus({ preventScroll: true });
		};
	}, [blocking]);

	return (
		<div
			aria-hidden="false"
			className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-2 backdrop-blur-sm sm:items-center sm:p-6"
			data-pane-blocking={blocking ? "true" : "false"}
		>
			<div
				ref={dialogRef}
				aria-describedby={description ? "pane-description" : undefined}
				aria-labelledby="pane-title"
				aria-modal="true"
				className="max-h-[min(90svh,48rem)] w-full max-w-2xl overflow-y-auto border border-border bg-card p-4 shadow-2xl outline-none sm:p-5"
				role="dialog"
				tabIndex={-1}
			>
				<div className="flex items-start justify-between gap-4 border-border/70 border-b pb-3">
					<div className="min-w-0">
						<p className="font-mono font-semibold text-primary text-xs uppercase tracking-[0.2em]">
							{blocking ? "Required action" : "Decision detail"}
						</p>
						<h2
							id="pane-title"
							className="mt-1 font-mono font-semibold text-base text-foreground uppercase tracking-[0.08em]"
						>
							{title}
						</h2>
						{description ? (
							<p
								id="pane-description"
								className="mt-1 text-muted-foreground text-xs leading-5"
							>
								{description}
							</p>
						) : null}
					</div>
					{blocking ? (
						<span className="shrink-0 border border-[var(--game-amber)]/50 bg-[var(--game-amber)]/10 px-2 py-1 font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.1em]">
							Cannot dismiss
						</span>
					) : (
						<button
							aria-label="Close pane"
							className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={onClose}
							type="button"
						>
							<X className="size-4" aria-hidden="true" />
						</button>
					)}
				</div>
				<div className="pt-4">{children}</div>
			</div>
		</div>
	);
}
