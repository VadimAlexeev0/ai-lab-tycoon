import { Button } from "@ai-lab-tycoon/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ai-lab-tycoon/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ai-lab-tycoon/ui/components/dropdown-menu";
import { ArrowRight, Keyboard, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";

export type RunMenuProps = {
	deleting?: boolean;
	includeNewRun?: boolean;
	onDeleteRun: () => void | Promise<void>;
	onNewRun?: () => void;
	triggerLabel?: string;
};

/** Shared saved-run actions with an explicit confirmation for destructive work. */
export default function RunMenu({
	deleting = false,
	includeNewRun = true,
	onDeleteRun,
	onNewRun,
	triggerLabel = "Open run actions",
}: RunMenuProps) {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	function confirmDelete() {
		setDeleteDialogOpen(false);
		void onDeleteRun();
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={triggerLabel}
					render={
						<Button
							aria-label={triggerLabel}
							size="icon"
							type="button"
							variant="outline"
						/>
					}
				>
					<Settings2 className="size-4" aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Run actions</DropdownMenuLabel>
					{includeNewRun ? (
						<DropdownMenuItem onClick={onNewRun}>
							<ArrowRight data-icon="inline-start" aria-hidden="true" />
							New run
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						disabled={deleting}
						onClick={() => setDeleteDialogOpen(true)}
						variant="destructive"
					>
						<Trash2 data-icon="inline-start" aria-hidden="true" />
						{deleting ? "Deleting…" : "Delete run"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem disabled>
						<Keyboard data-icon="inline-start" aria-hidden="true" />
						Keyboard shortcuts
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete this run?</DialogTitle>
						<DialogDescription>
							All progress for this anonymous player will be permanently
							removed. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose render={<Button type="button" variant="outline" />}>
							Cancel
						</DialogClose>
						<Button
							disabled={deleting}
							onClick={confirmDelete}
							type="button"
							variant="destructive"
						>
							{deleting ? "Deleting…" : "Delete run"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
