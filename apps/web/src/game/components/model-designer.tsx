import {
	type DataMix,
	type GameState,
	type ModelDesignSpec,
	type ModelEmphasis,
	type ModelFamilyId,
	type ModelFoundation,
	type ModelTier,
	selectTeams,
} from "@ai-lab-tycoon/engine";
import { Button } from "@ai-lab-tycoon/ui/components/button";
import { Input } from "@ai-lab-tycoon/ui/components/input";
import { Label } from "@ai-lab-tycoon/ui/components/label";
import { ArrowLeft, ArrowRight, Check, Lock, WandSparkles } from "lucide-react";
import { useState } from "react";

import DataMixControl from "@/game/components/data-mix-control";
import EmphasisControl from "@/game/components/emphasis-control";

const FAMILY_INFO: Record<
	ModelFamilyId,
	{
		label: string;
		era: "text" | "assistant" | "multimodal";
		researchNode: string;
		requirements: DataMix;
		description: string;
	}
> = {
	text: {
		label: "Text model",
		era: "text",
		researchNode: "text_models_principles",
		requirements: { general: 50, code: 0, multimodal: 0 },
		description: "A focused foundation for language and coding products.",
	},
	assistant: {
		label: "General assistant",
		era: "assistant",
		researchNode: "assistant_models_reasoning",
		requirements: { general: 30, code: 10, multimodal: 0 },
		description: "Reasoning and tool-use work for the Assistant era.",
	},
	multimodal: {
		label: "Multimodal model",
		era: "multimodal",
		researchNode: "multimodal_models_fusion",
		requirements: { general: 20, code: 5, multimodal: 20 },
		description: "Fusion work that unlocks the first frontier milestone.",
	},
};

const TIER_INFO: Record<
	ModelTier,
	{
		label: string;
		cost: number;
		duration: number;
		compute: number;
		ceiling: number;
	}
> = {
	lean: { label: "Lean", cost: 80, duration: 2, compute: 3, ceiling: 72 },
	standard: {
		label: "Standard",
		cost: 160,
		duration: 3,
		compute: 5,
		ceiling: 88,
	},
	aggressive: {
		label: "Aggressive",
		cost: 280,
		duration: 4,
		compute: 8,
		ceiling: 100,
	},
};

const FOUNDATION_INFO: Record<
	ModelFoundation,
	{
		label: string;
		cost: number;
		duration: number;
		floor: number;
		description: string;
	}
> = {
	fresh: {
		label: "Fresh",
		cost: 0,
		duration: 0,
		floor: 0,
		description: "Start without inherited score floors.",
	},
	continued: {
		label: "Continued",
		cost: 120,
		duration: 1,
		floor: 60,
		description: "Carry a compatible parent's floor into the new run.",
	},
	distilled: {
		label: "Distilled",
		cost: 180,
		duration: 2,
		floor: 30,
		description: "Trade more time and cash for a lighter inherited floor.",
	},
};

const DEFAULT_DATA_MIX: DataMix = { general: 50, code: 30, multimodal: 20 };
const DEFAULT_EMPHASIS: ModelEmphasis = {
	capability: 2,
	reliability: 2,
	safety: 1,
	efficiency: 1,
};
const EMPHASIS_POINTS = 6;
const FAMILY_ORDER: readonly ModelFamilyId[] = [
	"text",
	"assistant",
	"multimodal",
];

export type ModelDesignerProps = {
	state: GameState;
	disabled?: boolean;
	onDesign: (spec: ModelDesignSpec) => void;
};

/** Three-step model workflow with validation before every transition. */
export default function ModelDesigner({
	disabled = false,
	onDesign,
	state,
}: ModelDesignerProps) {
	const [step, setStep] = useState(1);
	const [name, setName] = useState("");
	const [family, setFamily] = useState<ModelFamilyId>("text");
	const [foundation, setFoundation] = useState<ModelFoundation>("fresh");
	const [parentId, setParentId] = useState("");
	const [tier, setTier] = useState<ModelTier>("lean");
	const [teamId, setTeamId] = useState(
		() => selectTeams(state).find((team) => team.status === "idle")?.id ?? "",
	);
	const [dataMix, setDataMix] = useState<DataMix>(DEFAULT_DATA_MIX);
	const [emphasis, setEmphasis] = useState<ModelEmphasis>(DEFAULT_EMPHASIS);

	const teams = selectTeams(state);
	const idleTeams = teams.filter((team) => team.status === "idle");
	const familyInfo = FAMILY_INFO[family];
	const familyAvailable = isFamilyAvailable(state, family);
	const compatibleParents = state.models.items.filter((model) =>
		isCompatibleParent(model, family),
	);
	const selectedParent = compatibleParents.find(
		(model) => model.id === parentId,
	);
	const currentFoundationAvailable =
		foundation === "fresh" || compatibleParents.length > 0;
	const mixTotal = dataMix.general + dataMix.code + dataMix.multimodal;
	const emphasisTotal =
		emphasis.capability +
		emphasis.reliability +
		emphasis.safety +
		emphasis.efficiency;
	const tierInfo = TIER_INFO[tier];
	const foundationInfo = FOUNDATION_INFO[foundation];
	const forecastCost = tierInfo.cost + foundationInfo.cost;
	const forecastDuration = tierInfo.duration + foundationInfo.duration;
	const validation = validationErrors({
		dataMix,
		emphasisTotal,
		familyAvailable,
		foundation,
		name,
		parentAvailable: selectedParent !== undefined,
		teamId,
		idleTeams,
		mixTotal,
		currentFoundationAvailable,
	});
	const canLeaveBasics = validation.every(
		(error) =>
			error !== "Give the model a name before continuing." &&
			error !== "Choose an idle team for this training run." &&
			error !== "Complete the selected family's research before designing it.",
	);
	const canLeaveTuning = mixTotal === 100 && emphasisTotal === EMPHASIS_POINTS;
	const canSubmit = validation.length === 0;

	function chooseFamily(nextFamily: ModelFamilyId) {
		setFamily(nextFamily);
		if (!isCompatibleParentId(state, nextFamily, parentId)) {
			setParentId("");
		}
	}

	function chooseFoundation(nextFoundation: ModelFoundation) {
		if (nextFoundation !== "fresh" && compatibleParents.length === 0) return;
		setFoundation(nextFoundation);
		if (nextFoundation === "fresh") setParentId("");
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (step === 1) {
			if (!canLeaveBasics) return;
			setStep(2);
			return;
		}
		if (step === 2) {
			if (!canLeaveTuning) return;
			setStep(3);
			return;
		}
		if (!canSubmit) return;
		onDesign({
			name: name.trim(),
			family,
			foundation,
			parentModelId: foundation === "fresh" ? null : parentId,
			tier,
			dataMix,
			emphasis,
			teamId,
		});
	}

	return (
		<section aria-label="Model designer" className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-primary text-xs">Model workbench</p>
					<h3 className="mt-1 font-semibold text-foreground text-sm">
						Design a training run
					</h3>
				</div>
				<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<WandSparkles className="size-3.5 text-primary" aria-hidden="true" />
					Step {step} / 3
				</div>
			</div>

			<nav className="grid grid-cols-3 gap-1" aria-label="Designer steps">
				{["Foundation", "Tuning", "Review"].map((label, index) => (
					<div
						className={
							index + 1 <= step
								? "border border-primary/40 bg-primary/10 px-2 py-1.5 text-primary text-xs"
								: "border border-border/70 px-2 py-1.5 text-muted-foreground text-xs"
						}
						key={label}
					>
						{index + 1}. {label}
					</div>
				))}
			</nav>

			<form className="space-y-4" onSubmit={handleSubmit}>
				{step === 1 ? (
					<BasicsStep
						compatibleParents={compatibleParents}
						family={family}
						familyInfo={familyInfo}
						familyAvailable={familyAvailable}
						foundation={foundation}
						idleTeams={idleTeams}
						name={name}
						parentId={parentId}
						selectedParent={selectedParent}
						state={state}
						teamId={teamId}
						onFoundationChange={chooseFoundation}
						onFamilyChange={chooseFamily}
						onNameChange={setName}
						onParentChange={setParentId}
						onTeamChange={setTeamId}
					/>
				) : null}
				{step === 2 ? (
					<div className="grid gap-5 lg:grid-cols-2">
						<DataMixControl
							disabled={disabled}
							onChange={(dimension, value) =>
								setDataMix((current) => ({
									...current,
									[dimension]: clamp(value, 0, 100),
								}))
							}
							value={dataMix}
						/>
						<EmphasisControl
							disabled={disabled}
							onChange={(dimension, value) =>
								setEmphasis((current) => ({
									...current,
									[dimension]: clamp(value, 0, EMPHASIS_POINTS),
								}))
							}
							totalPoints={EMPHASIS_POINTS}
							value={emphasis}
						/>
					</div>
				) : null}
				{step === 3 ? (
					<ReviewStep
						dataMix={dataMix}
						emphasis={emphasis}
						family={family}
						foundation={foundation}
						parent={selectedParent?.name}
						team={teams.find((team) => team.id === teamId)?.name}
						tier={tier}
						forecastCost={forecastCost}
						forecastDuration={forecastDuration}
						onTierChange={setTier}
					/>
				) : null}

				{validation.length > 0 ? (
					<div
						className="glass-pane bg-[var(--game-amber)]/10 px-3 py-2 ring-1 ring-[var(--game-amber)]/50"
						role="status"
					>
						<p className="font-semibold text-[var(--game-amber)] text-xs">
							Cannot continue yet
						</p>
						<ul className="mt-1 list-inside list-disc text-muted-foreground text-xs leading-5">
							{validation.map((error) => (
								<li key={error}>{error}</li>
							))}
						</ul>
					</div>
				) : null}

				<div className="flex flex-wrap justify-between gap-2 border-border/70 border-t pt-3">
					{step > 1 ? (
						<Button
							aria-label={`Back to ${step === 2 ? "foundation" : "tuning"} step`}
							disabled={disabled}
							onClick={() => setStep((current) => current - 1)}
							type="button"
							variant="outline"
						>
							<ArrowLeft data-icon="inline-start" aria-hidden="true" />
							Back
						</Button>
					) : (
						<span />
					)}
					<Button
						aria-label={
							step === 3
								? "Start model training"
								: `Continue to ${step === 1 ? "tuning" : "review"} step`
						}
						disabled={
							disabled ||
							(step === 1 && !canLeaveBasics) ||
							(step === 2 && !canLeaveTuning) ||
							(step === 3 && !canSubmit)
						}
						type="submit"
					>
						{step === 3 ? "Start training" : "Continue"}
						{step === 3 ? (
							<Check data-icon="inline-end" aria-hidden="true" />
						) : (
							<ArrowRight data-icon="inline-end" aria-hidden="true" />
						)}
					</Button>
				</div>
			</form>
		</section>
	);
}

type BasicsStepProps = {
	compatibleParents: GameState["models"]["items"];
	family: ModelFamilyId;
	familyInfo: (typeof FAMILY_INFO)[ModelFamilyId];
	familyAvailable: boolean;
	foundation: ModelFoundation;
	idleTeams: ReturnType<typeof selectTeams>;
	name: string;
	parentId: string;
	selectedParent: GameState["models"]["items"][number] | undefined;
	state: GameState;
	teamId: string;
	onFoundationChange: (foundation: ModelFoundation) => void;
	onFamilyChange: (family: ModelFamilyId) => void;
	onNameChange: (name: string) => void;
	onParentChange: (parentId: string) => void;
	onTeamChange: (teamId: string) => void;
};

function BasicsStep({
	compatibleParents,
	family,
	familyInfo,
	familyAvailable,
	foundation,
	idleTeams,
	name,
	parentId,
	selectedParent,
	state,
	teamId,
	onFoundationChange,
	onFamilyChange,
	onNameChange,
	onParentChange,
	onTeamChange,
}: BasicsStepProps) {
	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<Label htmlFor="model-name">
					Model name <span className="text-[var(--game-negative)]">*</span>
				</Label>
				<Input
					aria-required="true"
					autoComplete="off"
					id="model-name"
					maxLength={80}
					onChange={(event) => onNameChange(event.target.value)}
					placeholder="e.g. Northstar-1"
					required
					value={name}
				/>
			</div>

			<div className="space-y-2">
				<p className="font-semibold text-muted-foreground text-xs">
					Model family
				</p>
				<div className="grid gap-2 md:grid-cols-3">
					{FAMILY_ORDER.map((candidate) => {
						const info = FAMILY_INFO[candidate];
						const available = isFamilyAvailable(state, candidate);
						return (
							<button
								aria-pressed={family === candidate}
								className={
									family === candidate
										? "glass-pane bg-primary/10 p-3 text-left outline-none ring-1 ring-primary focus-visible:ring-2 focus-visible:ring-ring"
										: "glass-pane bg-background/35 p-3 text-left outline-none hover:bg-background/55 focus-visible:ring-2 focus-visible:ring-ring"
								}
								disabled={!available}
								key={candidate}
								onClick={() => onFamilyChange(candidate)}
								type="button"
							>
								<span className="flex items-center justify-between gap-2">
									<strong className="font-medium text-foreground text-xs">
										{info.label}
									</strong>
									{available ? (
										<span className="text-primary text-xs">Available</span>
									) : (
										<span className="flex items-center gap-1 text-muted-foreground text-xs">
											<Lock className="size-3" aria-hidden="true" />
											Locked
										</span>
									)}
								</span>
								<span className="mt-1 block text-muted-foreground text-xs leading-4">
									{available
										? info.description
										: `Requires completed ${info.researchNode} research.`}
								</span>
								<span className="mt-2 block text-muted-foreground text-xs">
									{info.era} era · min {info.requirements.general}/
									{info.requirements.code}/{info.requirements.multimodal} data
								</span>
							</button>
						);
					})}
				</div>
				{!familyAvailable ? (
					<p className="text-[var(--game-amber)] text-xs leading-5">
						Complete {familyInfo.researchNode} before this family can be
						designed.
					</p>
				) : null}
			</div>

			<div className="space-y-2">
				<p className="font-semibold text-muted-foreground text-xs">
					Foundation / inheritance tradeoff
				</p>
				<div className="grid gap-2 md:grid-cols-3">
					{(Object.keys(FOUNDATION_INFO) as ModelFoundation[]).map(
						(candidate) => {
							const info = FOUNDATION_INFO[candidate];
							const available =
								candidate === "fresh" || compatibleParents.length > 0;
							return (
								<button
									aria-pressed={foundation === candidate}
									className={
										foundation === candidate
											? "glass-pane bg-primary/10 p-3 text-left outline-none ring-1 ring-primary focus-visible:ring-2 focus-visible:ring-ring"
											: "glass-pane bg-background/35 p-3 text-left outline-none hover:bg-background/55 focus-visible:ring-2 focus-visible:ring-ring"
									}
									disabled={!available}
									key={candidate}
									onClick={() => onFoundationChange(candidate)}
									type="button"
								>
									<span className="flex items-center justify-between gap-2">
										<strong className="font-medium text-foreground text-xs">
											{info.label}
										</strong>
										<span className="text-muted-foreground text-xs">
											+${info.cost} · +{info.duration} wk
										</span>
									</span>
									<span className="mt-1 block text-muted-foreground text-xs leading-4">
										{available
											? info.description
											: "Unavailable — no compatible scored parent yet."}
									</span>
									<span className="mt-2 block text-primary text-xs">
										{info.floor === 0
											? "No inherited floor"
											: `${info.floor}% inherited floor`}
									</span>
								</button>
							);
						},
					)}
				</div>
			</div>

			{foundation !== "fresh" ? (
				<div className="space-y-2">
					<Label htmlFor="model-parent">Compatible parent model</Label>
					<select
						className="h-8 w-full border border-input bg-background px-2 text-foreground text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
						id="model-parent"
						onChange={(event) => onParentChange(event.target.value)}
						required
						value={parentId}
					>
						<option value="">Choose a ready or launched parent…</option>
						{compatibleParents.map((parent) => (
							<option key={parent.id} value={parent.id}>
								{parent.name} · {parent.id}
							</option>
						))}
					</select>
					<p className="text-muted-foreground text-xs leading-4">
						{selectedParent
							? `${FOUNDATION_INFO[foundation].floor}% floor inherited from ${selectedParent.name}; debt is included in the forecast.`
							: "A compatible scored parent is required before this foundation can be submitted."}
					</p>
				</div>
			) : null}

			<div className="space-y-2">
				<Label htmlFor="model-team">Training team</Label>
				<select
					className="h-8 w-full border border-input bg-background px-2 text-foreground text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
					disabled={idleTeams.length === 0}
					id="model-team"
					onChange={(event) => onTeamChange(event.target.value)}
					required
					value={teamId}
				>
					<option value="">Choose an idle team…</option>
					{idleTeams.map((team) => (
						<option key={team.id} value={team.id}>
							{team.name} · {team.id}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

function ReviewStep({
	dataMix,
	emphasis,
	family,
	foundation,
	parent,
	team,
	tier,
	forecastCost,
	forecastDuration,
	onTierChange,
}: {
	dataMix: DataMix;
	emphasis: ModelEmphasis;
	family: ModelFamilyId;
	foundation: ModelFoundation;
	parent: string | undefined;
	team: string | undefined;
	tier: ModelTier;
	forecastCost: number;
	forecastDuration: number;
	onTierChange: (tier: ModelTier) => void;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<p className="font-semibold text-muted-foreground text-xs">
					Compute tier forecast
				</p>
				<div className="grid gap-2 md:grid-cols-3">
					{(Object.keys(TIER_INFO) as ModelTier[]).map((candidate) => {
						const info = TIER_INFO[candidate];
						return (
							<button
								aria-pressed={tier === candidate}
								className={
									tier === candidate
										? "glass-pane bg-primary/10 p-3 text-left outline-none ring-1 ring-primary focus-visible:ring-2 focus-visible:ring-ring"
										: "glass-pane bg-background/35 p-3 text-left outline-none hover:bg-background/55 focus-visible:ring-2 focus-visible:ring-ring"
								}
								key={candidate}
								onClick={() => onTierChange(candidate)}
								type="button"
							>
								<strong className="font-medium text-foreground text-xs">
									{info.label}
								</strong>
								<span className="mt-1 block text-muted-foreground text-xs">
									${info.cost} · {info.duration} wk · {info.compute} compute
								</span>
								<span className="mt-1 block text-muted-foreground text-xs">
									Score ceiling {info.ceiling}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Forecast label="Family" value={family} />
				<Forecast label="Foundation" value={foundation} />
				<Forecast label="Team" value={team ?? "—"} />
				<Forecast label="Parent" value={parent ?? "None"} />
			</div>
			<div className="grid grid-cols-2 gap-2 border-border/70 border-y py-3 sm:grid-cols-4">
				<Forecast label="Total cost" value={`$${forecastCost}`} />
				<Forecast label="Training length" value={`${forecastDuration} weeks`} />
				<Forecast
					label="General / code"
					value={`${dataMix.general}% / ${dataMix.code}%`}
				/>
				<Forecast label="Multimodal" value={`${dataMix.multimodal}%`} />
			</div>
			<p className="text-muted-foreground text-xs leading-5">
				Emphasis points: capability {emphasis.capability}, reliability{" "}
				{emphasis.reliability}, safety {emphasis.safety}, efficiency{" "}
				{emphasis.efficiency}. Tier and foundation change the cash, compute, and
				duration forecast before submission.
			</p>
		</div>
	);
}

function Forecast({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 truncate font-semibold text-foreground text-xs">
				{value}
			</p>
		</div>
	);
}

function validationErrors({
	dataMix,
	emphasisTotal,
	familyAvailable,
	foundation,
	name,
	parentAvailable,
	teamId,
	idleTeams,
	mixTotal,
	currentFoundationAvailable,
}: {
	dataMix: DataMix;
	emphasisTotal: number;
	familyAvailable: boolean;
	foundation: ModelFoundation;
	name: string;
	parentAvailable: boolean;
	teamId: string;
	idleTeams: ReturnType<typeof selectTeams>;
	mixTotal: number;
	currentFoundationAvailable: boolean;
}): string[] {
	const errors: string[] = [];
	if (name.trim().length === 0)
		errors.push("Give the model a name before continuing.");
	if (!familyAvailable)
		errors.push("Complete the selected family's research before designing it.");
	if (!idleTeams.some((team) => team.id === teamId)) {
		errors.push("Choose an idle team for this training run.");
	}
	if (mixTotal !== 100) errors.push("Data mix must total exactly 100%.");
	if (emphasisTotal !== EMPHASIS_POINTS) {
		errors.push(`Emphasis must total exactly ${EMPHASIS_POINTS} points.`);
	}
	if (foundation !== "fresh" && !currentFoundationAvailable) {
		errors.push("This foundation is unavailable without a compatible parent.");
	} else if (foundation !== "fresh" && !parentAvailable) {
		errors.push("Choose a compatible ready or launched parent model.");
	}
	if (dataMix.general < 0 || dataMix.code < 0 || dataMix.multimodal < 0) {
		errors.push("Data mix values cannot be negative.");
	}
	return errors;
}

function isFamilyAvailable(state: GameState, family: ModelFamilyId): boolean {
	const info = FAMILY_INFO[family];
	return (
		state.meta.era === info.era &&
		state.research.nodes.some(
			(node) => node.id === info.researchNode && node.status === "completed",
		)
	);
}

function isCompatibleParent(
	model: GameState["models"]["items"][number],
	targetFamily: ModelFamilyId,
): boolean {
	if (
		(model.status !== "ready" && model.status !== "launched") ||
		model.estimates === undefined ||
		model.family === undefined
	) {
		return false;
	}
	return (
		FAMILY_ORDER.indexOf(model.family) <= FAMILY_ORDER.indexOf(targetFamily)
	);
}

function isCompatibleParentId(
	state: GameState,
	family: ModelFamilyId,
	parentId: string,
): boolean {
	const parent = state.models.items.find((model) => model.id === parentId);
	return parent !== undefined && isCompatibleParent(parent, family);
}

function clamp(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) return minimum;
	return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
