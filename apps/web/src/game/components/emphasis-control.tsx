import type { ModelEmphasis } from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Input } from "@ai-lab-tycoon/ui/components/input";
import { Minus, Plus } from "lucide-react";

type ModelEmphasisDimension = keyof ModelEmphasis;

const DIMENSIONS: readonly ModelEmphasisDimension[] = [
	"capability",
	"reliability",
	"safety",
	"efficiency",
];

export type EmphasisControlProps = {
	value: ModelEmphasis;
	totalPoints: number;
	disabled?: boolean;
	onChange: (dimension: ModelEmphasisDimension, value: number) => void;
};

/** Emphasis points have both coarse touch controls and precise keyboard inputs. */
export default function EmphasisControl({
	disabled = false,
	onChange,
	totalPoints,
	value,
}: EmphasisControlProps) {
	const total = DIMENSIONS.reduce(
		(sum, dimension) => sum + value[dimension],
		0,
	);

	return (
		<fieldset className="space-y-3" disabled={disabled}>
			<legend className="font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
				Model emphasis
			</legend>
			<div className="space-y-3">
				{DIMENSIONS.map((dimension) => (
					<div className="space-y-1.5" key={dimension}>
						<div className="flex items-center justify-between gap-3">
							<label
								className="font-medium text-foreground text-xs capitalize"
								htmlFor={`emphasis-${dimension}`}
							>
								{dimension}
							</label>
							<div className="flex items-center gap-1">
								<Button
									aria-label={`Decrease ${dimension} emphasis by one point`}
									onClick={() => onChange(dimension, value[dimension] - 1)}
									size="icon-xs"
									type="button"
									variant="outline"
								>
									<Minus aria-hidden="true" />
								</Button>
								<Input
									aria-label={`${dimension} emphasis points`}
									className="h-6 w-14 text-center"
									id={`emphasis-${dimension}`}
									max={totalPoints}
									min={0}
									onChange={(event) =>
										onChange(dimension, Number(event.target.value))
									}
									type="number"
									value={value[dimension]}
								/>
								<Button
									aria-label={`Increase ${dimension} emphasis by one point`}
									onClick={() => onChange(dimension, value[dimension] + 1)}
									size="icon-xs"
									type="button"
									variant="outline"
								>
									<Plus aria-hidden="true" />
								</Button>
							</div>
						</div>
						<input
							aria-label={`${dimension} emphasis slider`}
							className="h-1.5 w-full accent-primary"
							max={totalPoints}
							min={0}
							onChange={(event) =>
								onChange(dimension, Number(event.target.value))
							}
							step={1}
							type="range"
							value={value[dimension]}
						/>
					</div>
				))}
			</div>
			<p
				className={
					total === totalPoints
						? "font-mono text-[var(--game-positive)] text-xs uppercase tracking-[0.12em]"
						: "font-mono text-[var(--game-amber)] text-xs uppercase tracking-[0.12em]"
				}
			>
				Points: {total} / {totalPoints}{" "}
				{total === totalPoints ? "· valid" : "· must equal the total"}
			</p>
		</fieldset>
	);
}
