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
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ai-lab-tycoon/ui/components/dropdown-menu";
import {
	isThemeMode,
	isThemeMotif,
	MOTIF_METADATA,
	THEME_MODES,
	THEME_MOTIFS,
	useOptionalTheme,
} from "@ai-lab-tycoon/ui/components/theme-provider";
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
	const theme = useOptionalTheme();

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
					<DropdownMenuGroup>
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
					</DropdownMenuGroup>
					{theme !== null ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuLabel>Appearance</DropdownMenuLabel>
								<DropdownMenuGroup>
									<DropdownMenuLabel>Color mode</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										onValueChange={(value) => {
											if (isThemeMode(value)) {
												theme.setMode(value);
											}
										}}
										value={theme.mode}
									>
										{THEME_MODES.map((themeMode) => (
											<DropdownMenuRadioItem key={themeMode} value={themeMode}>
												Use {themeMode} mode
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
								<DropdownMenuGroup>
									<DropdownMenuLabel>Theme motif</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										onValueChange={(value) => {
											if (isThemeMotif(value)) {
												theme.setMotif(value);
											}
										}}
										value={theme.motif}
									>
										{THEME_MOTIFS.map((themeMotif) => (
											<DropdownMenuRadioItem
												key={themeMotif}
												value={themeMotif}
											>
												Use {MOTIF_METADATA[themeMotif].label.toLowerCase()}{" "}
												theme
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
							</DropdownMenuGroup>
						</>
					) : null}
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
