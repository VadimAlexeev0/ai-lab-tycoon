import { Loader2 } from "lucide-react";

export default function Loader() {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
			<Loader2
				className="size-5 animate-spin text-primary"
				aria-hidden="true"
			/>
			<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
				Loading operations console
			</span>
		</div>
	);
}
