import type { DataMix } from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Input } from "@ai-lab-tycoon/ui/components/input";
import { Minus, Plus } from "lucide-react";

type DataMixDimension = keyof DataMix;

const DIMENSIONS: readonly DataMixDimension[] = [
	"general",
	"code",
	"multimodal",
];

export type DataMixControlProps = {
	value: DataMix;
	disabled?: boolean;
	onChange: (dimension: DataMixDimension, value: number) => void;
};

/** Paired range and numeric controls keep the data mix usable without a mouse. */
export default function DataMixControl({
	disabled = false,
	onChange,
	value,
}: DataMixControlProps) {
	const total = DIMENSIONS.reduce(
		(sum, dimension) => sum + value[dimension],
		0,
	);

	return (
		<fieldset className="space-y-3" disabled={disabled}>
			<legend className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
				Training data mix
			</legend>
			<div className="space-y-3">
				{DIMENSIONS.map((dimension) => (
					<div className="space-y-1.5" key={dimension}>
						<div className="flex items-center justify-between gap-3">
							<label
								className="font-medium text-foreground text-xs capitalize"
								htmlFor={`data-mix-${dimension}`}
							>
								{dimension} data
							</label>
							<div className="flex items-center gap-1">
								<Button
									aria-label={`Decrease ${dimension} data by five points`}
									onClick={() => onChange(dimension, value[dimension] - 5)}
									size="icon-xs"
									type="button"
									variant="outline"
								>
									<Minus aria-hidden="true" />
								</Button>
								<Input
									aria-label={`${dimension} data percentage`}
									className="h-6 w-16 text-center"
									id={`data-mix-${dimension}`}
									max={100}
									min={0}
									onChange={(event) =>
										onChange(dimension, Number(event.target.value))
									}
									type="number"
									value={value[dimension]}
								/>
								<span className="font-mono text-[10px] text-muted-foreground">
									%
								</span>
								<Button
									aria-label={`Increase ${dimension} data by five points`}
									onClick={() => onChange(dimension, value[dimension] + 5)}
									size="icon-xs"
									type="button"
									variant="outline"
								>
									<Plus aria-hidden="true" />
								</Button>
							</div>
						</div>
						<input
							aria-label={`${dimension} data slider`}
							className="h-1.5 w-full accent-primary"
							max={100}
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
					total === 100
						? "font-mono text-[10px] text-[var(--game-positive)] uppercase tracking-[0.12em]"
						: "font-mono text-[10px] text-[var(--game-amber)] uppercase tracking-[0.12em]"
				}
			>
				Total: {total}% {total === 100 ? "· valid" : "· must equal 100%"}
			</p>
		</fieldset>
	);
}
