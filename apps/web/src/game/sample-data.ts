export type SampleHeadlineSentiment = "positive" | "negative" | "neutral";

export type SamplePressSource =
	| "gradient-wire"
	| "benchmarks-daily"
	| "context-window";

export type SampleRival = Readonly<{
	id: string;
	name: string;
	progress?: number;
}>;

export type SampleHeadline = {
	id: string;
	headline: string;
	summary: string;
	sentiment: SampleHeadlineSentiment;
	source: SamplePressSource;
	sourceLabel: string;
	relatedRivalIds: string[];
	relatedRivalNames: string[];
	relatedNodeIds: string[];
	ageWeeks: number;
	rivalProgressPct: number;
};

export type BoardExpectation = {
	id: string;
	label: string;
	detail: string;
	progress: number;
	status: "ahead" | "on-track" | "watch";
};

export type StrategicQuestionChoice = {
	id: string;
	label: string;
	hint: string;
};

export type StrategicQuestion = {
	id: string;
	prompt: string;
	context: string;
	choices: StrategicQuestionChoice[];
};

const PRESS_SOURCE_LABELS: Record<SamplePressSource, string> = {
	"gradient-wire": "The Gradient Wire",
	"benchmarks-daily": "Benchmarks Daily",
	"context-window": "Context Window",
};

const FICTIONAL_RIVALS = [
	"Cedar Logic",
	"OrbitFoundry",
	"Prism Harbor",
	"Kestrel Compute",
] as const;

type HeadlineContext = {
	rivalName: string;
	progress: number;
	stage: string;
};

type HeadlineTemplate = {
	id: string;
	sentiment: SampleHeadlineSentiment;
	source: SamplePressSource;
	referencesRival?: boolean;
	relatedNodeIds?: readonly string[];
	headline: (context: HeadlineContext) => string;
	summary: (context: HeadlineContext) => string;
};

/**
 * Press copy is intentionally authored here rather than in GameState. The
 * generator only consumes the run seed and public rival names, so previews can
 * be replayed without changing the simulation or its persistence contract.
 */
export const HEADLINE_TEMPLATES: readonly HeadlineTemplate[] = [
	{
		id: "rival-benchmark",
		sentiment: "positive",
		source: "benchmarks-daily",
		referencesRival: true,
		headline: ({ rivalName }) => `${rivalName} posts a surprise benchmark gain`,
		summary: ({ rivalName, progress }) =>
			`${rivalName} is now tracking at ${progress}% of its public research clock, putting fresh pressure on every small lab watching the board.`,
	},
	{
		id: "rival-cluster",
		sentiment: "negative",
		source: "gradient-wire",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} books time on a new training cluster`,
		summary: ({ rivalName, stage }) =>
			`${rivalName} is signaling ${stage} ambitions with a capacity move that could tighten the spot market for frontier compute.`,
	},
	{
		id: "rival-safety",
		sentiment: "neutral",
		source: "context-window",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} publishes a reliability scorecard`,
		summary: ({ rivalName }) =>
			`The report from ${rivalName} is light on implementation detail, but operators are already comparing its evaluation posture with their own.`,
	},
	{
		id: "rival-funding",
		sentiment: "positive",
		source: "gradient-wire",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} closes a quiet infrastructure round`,
		summary: ({ rivalName, progress }) =>
			`Backers are rewarding ${rivalName}'s ${progress}% public progress with patience capital rather than a flashy product launch.`,
	},
	{
		id: "rival-launch",
		sentiment: "negative",
		source: "context-window",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} opens its model to early design partners`,
		summary: ({ rivalName, stage }) =>
			`${rivalName} is calling the release ${stage}; customers will decide whether the new capability is a category shift or a careful beta.`,
	},
	{
		id: "rival-milestone",
		sentiment: "neutral",
		source: "benchmarks-daily",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} crosses a public research milestone`,
		summary: ({ rivalName, progress }) =>
			`The ${rivalName} clock moved to ${progress}%, a reminder that the market is accumulating optionality while your lab makes its own trade-offs.`,
	},
	{
		id: "rival-controversy",
		sentiment: "negative",
		source: "gradient-wire",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} faces questions about training-data provenance`,
		summary: ({ rivalName }) =>
			`Analysts are asking ${rivalName} to explain a licensing gap before its next public checkpoint.`,
	},
	{
		id: "rival-talent",
		sentiment: "positive",
		source: "context-window",
		referencesRival: true,
		headline: ({ rivalName }) =>
			`${rivalName} hires for a reliability-first sprint`,
		summary: ({ rivalName, stage }) =>
			`${rivalName} is reshaping its next quarter around ${stage} infrastructure and a smaller, more observable release surface.`,
	},
	{
		id: "cedar-series",
		sentiment: "positive",
		source: "benchmarks-daily",
		headline: () => "Cedar Logic raises a patient Series B",
		summary: () =>
			"The fictional enterprise lab says the round will fund evaluation tooling, not a race for the loudest model card.",
	},
	{
		id: "orbit-robotics",
		sentiment: "neutral",
		source: "context-window",
		headline: () => "OrbitFoundry puts a language model in the warehouse",
		summary: () =>
			`A robotics pilot from the fictional startup is turning mundane workflow telemetry into the week's most discussed dataset.`,
	},
	{
		id: "prism-openweights",
		sentiment: "positive",
		source: "gradient-wire",
		headline: () => "Prism Harbor publishes an open-weight compact model",
		summary: () =>
			"The release is small enough to run locally and opinionated enough to restart the debate over what a useful frontier looks like.",
	},
	{
		id: "kestrel-outage",
		sentiment: "negative",
		source: "benchmarks-daily",
		headline: () => "Kestrel Compute pauses a regional inference zone",
		summary: () =>
			"The outage is resolved, but teams with thin serving margins are rechecking their fallback capacity and incident playbooks.",
	},
	{
		id: "cedar-licensed-data",
		sentiment: "neutral",
		source: "context-window",
		headline: () => "Cedar Logic signs a clean-corpus partnership",
		summary: () =>
			"The deal trades a higher near-term bill for clearer rights, a familiar bargain for labs trying to keep future launches uneventful.",
	},
	{
		id: "orbit-efficiency",
		sentiment: "positive",
		source: "benchmarks-daily",
		headline: () => "OrbitFoundry trims inference cost without cutting context",
		summary: () =>
			"A systems paper from the fictional platform claims a meaningful efficiency gain, though independent replication is still pending.",
	},
	{
		id: "prism-regulator",
		sentiment: "negative",
		source: "gradient-wire",
		headline: () => "Prism Harbor receives a pre-launch evaluation request",
		summary: () =>
			"The request is routine on paper and costly in practice, pushing every agent pilot to make its safety evidence legible.",
	},
	{
		id: "kestrel-hardware",
		sentiment: "neutral",
		source: "context-window",
		headline: () =>
			"Kestrel Compute offers exclusivity on its next accelerator",
		summary: () =>
			"The proposed discount is attractive, but the fictional hardware partner wants a long commitment before the market has settled.",
	},
	{
		id: "inference-prices",
		sentiment: "positive",
		source: "benchmarks-daily",
		headline: () => "Inference prices soften as idle capacity returns",
		summary: () =>
			"A calmer spot market gives small labs room to experiment, provided they do not mistake temporary slack for permanent capacity.",
	},
	{
		id: "context-window-shift",
		sentiment: "neutral",
		source: "context-window",
		headline: () => "Long context gives way to better retrieval discipline",
		summary: () =>
			"Operators are reporting that smaller, cleaner context windows are outperforming brute-force prompting in production workflows.",
	},
	{
		id: "safety-review",
		sentiment: "negative",
		source: "gradient-wire",
		headline: () => "A safety review finds the cost of silence is compounding",
		summary: () =>
			"The review argues that missing evidence is becoming a market signal of its own, even before an incident makes the news.",
	},
	{
		id: "enterprise-demand",
		sentiment: "positive",
		source: "benchmarks-daily",
		headline: () => "Enterprise buyers ask for fewer demos and more guarantees",
		summary: () =>
			"Procurement teams are shifting their questions from model size to uptime, auditability, and the shape of an exit plan.",
	},
	{
		id: "open-source-squeeze",
		sentiment: "negative",
		source: "context-window",
		headline: () => "Open-source maintainers warn of a compute squeeze",
		summary: () =>
			"The next generation of public checkpoints may depend less on ambition than on whether teams can keep a dependable training window.",
	},
	{
		id: "data-rights",
		sentiment: "neutral",
		source: "gradient-wire",
		headline: () => "Data-rights counsel becomes a launch-day hire",
		summary: () =>
			"Founders are budgeting for provenance reviews earlier, treating clean lineage as an operating dependency rather than a legal footnote.",
	},
	{
		id: "benchmark-reversal",
		sentiment: "positive",
		source: "benchmarks-daily",
		headline: () => "A quiet benchmark reversal changes the leaderboard",
		summary: () =>
			"A previously overlooked evaluation rewards reliability and cost discipline, sending teams back to results they had dismissed as unglamorous.",
	},
	{
		id: "talent-market",
		sentiment: "negative",
		source: "gradient-wire",
		headline: () => "The talent market prices observability like a core skill",
		summary: () =>
			"Hiring plans now pair research fluency with incident response, narrowing the gap between building a model and operating one.",
	},
	{
		id: "rival-scaling-laws",
		sentiment: "neutral",
		source: "benchmarks-daily",
		referencesRival: true,
		relatedNodeIds: ["scaling_laws_keystone"],
		headline: ({ rivalName }) => `${rivalName} publishes a scaling-law study`,
		summary: ({ rivalName, progress }) =>
			`${rivalName} argues that its ${progress}% public progress came from better allocation, not simply a bigger parameter count.`,
	},
	{
		id: "open-weights-release",
		sentiment: "positive",
		source: "gradient-wire",
		referencesRival: true,
		relatedNodeIds: ["open_weights_movement"],
		headline: ({ rivalName }) =>
			`${rivalName} releases open weights and shocks incumbents`,
		summary: ({ rivalName }) =>
			`The ${rivalName} release puts a capable checkpoint in public hands and gives smaller labs a new starting line.`,
	},
	{
		id: "export-controls-tighten",
		sentiment: "negative",
		source: "gradient-wire",
		relatedNodeIds: ["export_control_politics"],
		headline: () => "Export controls tighten accelerator supply",
		summary: () =>
			"A new compliance layer turns delivery dates into research variables; every hyperscale plan is being redrawn around the permit queue.",
	},
	{
		id: "million-token-context",
		sentiment: "positive",
		source: "context-window",
		referencesRival: true,
		relatedNodeIds: ["long_context"],
		headline: ({ rivalName }) =>
			`${rivalName} ships a million-token context window`,
		summary: ({ rivalName, stage }) =>
			`${rivalName} is calling the ${stage} release a memory breakthrough; operators are waiting to see what survives the longer prompt.`,
	},
	{
		id: "alignment-recipe",
		sentiment: "neutral",
		source: "context-window",
		referencesRival: true,
		relatedNodeIds: ["rlhf_alignment"],
		headline: ({ rivalName }) => `${rivalName} publishes an alignment recipe`,
		summary: ({ rivalName }) =>
			`The report from ${rivalName} makes human feedback look less like a final polish and more like a second training pipeline.`,
	},
	{
		id: "reasoning-token-market",
		sentiment: "negative",
		source: "benchmarks-daily",
		relatedNodeIds: ["reasoning_tokens_economy"],
		headline: () => "Reasoning tokens put a new price on patience",
		summary: () =>
			"Customers like deeper answers until the bill arrives; product teams are learning to expose the thinking dial without exposing the burn.",
	},
	{
		id: "moe-training-window",
		sentiment: "positive",
		source: "gradient-wire",
		referencesRival: true,
		relatedNodeIds: ["sparse_moe"],
		headline: ({ rivalName }) =>
			`${rivalName} routes a sparse expert model through a smaller cluster`,
		summary: ({ rivalName }) =>
			`${rivalName} says selective experts kept its latest training window open when a dense run would have missed the launch date.`,
	},
	{
		id: "computer-use-demo",
		sentiment: "neutral",
		source: "context-window",
		referencesRival: true,
		relatedNodeIds: ["computer_use"],
		headline: ({ rivalName }) =>
			`${rivalName} puts computer use in a guarded demo`,
		summary: ({ rivalName }) =>
			`The ${rivalName} agent can see and operate a desktop, but every successful click is paired with a new question about permission and rollback.`,
	},
	{
		id: "mcp-protocol-adoption",
		sentiment: "positive",
		source: "gradient-wire",
		relatedNodeIds: ["mcp_protocols"],
		headline: () => "MCP-style protocols give tools a common doorway",
		summary: () =>
			"A shared interface is making agent integrations easier to swap, test, and explain to the teams that have to operate them.",
	},
	{
		id: "verification-first",
		sentiment: "positive",
		source: "benchmarks-daily",
		relatedNodeIds: ["verification"],
		headline: () => "Verification catches the frontier's confident wrong turn",
		summary: () =>
			"A second-pass checker turns a dazzling demo into a slower, more legible system—and gives procurement teams something to measure.",
	},
	{
		id: "chinchilla-recompute",
		sentiment: "neutral",
		source: "benchmarks-daily",
		referencesRival: true,
		relatedNodeIds: ["chinchilla_compute_optimal"],
		headline: ({ rivalName }) =>
			`${rivalName} rebalances its giant model around data`,
		summary: ({ rivalName }) =>
			`${rivalName} is spending the next quarter on a compute-optimal retrain, betting that more tokens can beat a larger headline model.`,
	},
	{
		id: "distillation-price-cut",
		sentiment: "negative",
		source: "context-window",
		referencesRival: true,
		relatedNodeIds: ["distillation_lines", "inference_price_war"],
		headline: ({ rivalName }) =>
			`${rivalName} cuts inference prices with a distilled line`,
		summary: ({ rivalName }) =>
			`${rivalName} moved a smaller student model into production, forcing every API team to choose between margin and another optimization sprint.`,
	},
] as const;

/** Preserve node links for the original press deck as the catalog grows. */
const LEGACY_HEADLINE_NODE_TAGS: Readonly<Record<string, readonly string[]>> = {
	"rival-benchmark": ["scaling_laws_keystone"],
	"rival-cluster": ["hyperscale_compute_infrastructure"],
	"rival-safety": ["verification"],
	"rival-funding": ["gpt3_scale_params"],
	"rival-launch": ["assistant_models_keystone"],
	"rival-milestone": ["assistant_models_keystone"],
	"rival-controversy": ["multilingual_corpora"],
	"rival-talent": ["training_stability"],
	"cedar-series": ["training_stability"],
	"orbit-robotics": ["computer_use"],
	"prism-openweights": ["open_weights_movement"],
	"kestrel-outage": ["inference_price_war"],
	"cedar-licensed-data": ["multilingual_corpora"],
	"orbit-efficiency": ["mla_kv_compression"],
	"prism-regulator": ["export_control_politics"],
	"kestrel-hardware": ["hyperscale_compute_infrastructure"],
	"inference-prices": ["inference_price_war"],
	"context-window-shift": ["long_context"],
	"safety-review": ["rlhf_alignment"],
	"enterprise-demand": ["verification"],
	"open-source-squeeze": ["open_weight_ecosystem"],
	"data-rights": ["multilingual_corpora"],
	"benchmark-reversal": ["chinchilla_compute_optimal"],
	"talent-market": ["training_stability"],
};

const STRATEGIC_QUESTIONS: readonly StrategicQuestion[] = [
	{
		id: "enterprise-exclusivity",
		prompt:
			"An enterprise customer offers stable revenue in exchange for exclusivity.",
		context:
			"The contract would smooth the next quarter, but it could make the lab's distribution and learning loops narrower.",
		choices: [
			{
				id: "accept-exclusivity",
				label: "Take the contract",
				hint: "Immediate cash certainty · future reach becomes more concentrated",
			},
			{
				id: "protect-optionality",
				label: "Keep the product open",
				hint: "Preserve distribution · runway stays exposed to market swings",
			},
		],
	},
	{
		id: "rival-obsolescence",
		prompt:
			"A rival publishes a model that makes your current research look obsolete.",
		context:
			"The headline is loud, the evidence is incomplete, and your current branch still has unfinished work with compounding value.",
		choices: [
			{
				id: "pivot-to-rival",
				label: "Pivot toward the new frontier",
				hint: "Match the market narrative · abandon some work already in flight",
			},
			{
				id: "finish-the-branch",
				label: "Finish the branch on your terms",
				hint: "Protect depth and evidence · accept a temporary perception gap",
			},
		],
	},
	{
		id: "licensed-corpus",
		prompt:
			"A data partner offers a clean licensed corpus at a price that consumes your runway.",
		context:
			"The corpus could remove a future rights risk, but purchasing it now would crowd out compute and hiring choices.",
		choices: [
			{
				id: "buy-the-corpus",
				label: "Buy the clean corpus",
				hint: "Lower provenance exposure · less cash for near-term iteration",
			},
			{
				id: "keep-mixed-data",
				label: "Keep the mixed-data plan",
				hint: "Protect runway · carry a larger future diligence burden",
			},
		],
	},
	{
		id: "regulator-evaluation",
		prompt:
			"A regulator asks for an evaluation report before approving your agent pilot.",
		context:
			"A careful report could unlock trust and a slower launch; rushing would get the pilot into users' hands before the window closes.",
		choices: [
			{
				id: "publish-evidence",
				label: "Publish the evaluation first",
				hint: "Build trust and permission · delay the first user signal",
			},
			{
				id: "ship-the-pilot",
				label: "Ship a constrained pilot",
				hint: "Learn from real use · accept a higher scrutiny load",
			},
		],
	},
	{
		id: "robotics-commitment",
		prompt:
			"A hardware partner wants an exclusive robotics commitment before your world model is ready.",
		context:
			"The partnership offers privileged hardware access, but the lock-in arrives before the lab knows which embodiment will matter.",
		choices: [
			{
				id: "commit-to-hardware",
				label: "Commit to the partner",
				hint: "Secure scarce hardware · narrow the experiments you can afford",
			},
			{
				id: "stay-independent",
				label: "Stay hardware-independent",
				hint: "Keep strategic freedom · risk arriving after the first wave",
			},
		],
	},
] as const;

/** A small inline Mulberry32 implementation keeps preview output replayable. */
export function mulberry32(seed: number): () => number {
	let value = seed >>> 0;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let t = value;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/**
 * Generate a stable press batch. `rivals` is optional so callers without an
 * engine projection still get useful fictional coverage.
 */
export function sampleHeadlines(
	seed: number,
	rivalProgressPct: number,
	count: number,
	rivals: readonly SampleRival[] = [],
): SampleHeadline[] {
	const requested = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
	if (requested === 0) return [];

	const progress = clamp(Math.round(rivalProgressPct), 0, 100);
	const rng = mulberry32((seed >>> 0) ^ Math.imul(progress, 0x9e3779b9));
	const templates = [...HEADLINE_TEMPLATES];
	for (let index = templates.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(rng() * (index + 1));
		const current = templates[index];
		const swapped = templates[swapIndex];
		if (current === undefined || swapped === undefined) continue;
		templates[index] = swapped;
		templates[swapIndex] = current;
	}

	return Array.from({ length: requested }, (_, index) => {
		const template =
			templates[index % templates.length] ?? HEADLINE_TEMPLATES[0];
		const selectedRival = template.referencesRival
			? rivals[Math.floor(rng() * rivals.length)]
			: undefined;
		const fallbackRival =
			FICTIONAL_RIVALS[Math.floor(rng() * FICTIONAL_RIVALS.length)] ??
			FICTIONAL_RIVALS[0];
		const rivalName = selectedRival?.name ?? fallbackRival;
		const rivalProgress = clamp(
			Math.round(selectedRival?.progress ?? progress),
			0,
			100,
		);
		const stage = stageForProgress(rivalProgress);
		const context = { rivalName, progress: rivalProgress, stage };
		const ageWeeks = (index + Math.floor(rng() * 4)) % 4;
		const relatedNodeIds = [
			...(template.relatedNodeIds ??
				LEGACY_HEADLINE_NODE_TAGS[template.id] ??
				[]),
		];

		return {
			id: `sample-headline-${template.id}-${index}`,
			headline: template.headline(context),
			summary: template.summary(context),
			sentiment: template.sentiment,
			source: template.source,
			sourceLabel: PRESS_SOURCE_LABELS[template.source],
			relatedRivalIds: selectedRival === undefined ? [] : [selectedRival.id],
			relatedRivalNames:
				selectedRival === undefined ? [] : [selectedRival.name],
			relatedNodeIds,
			ageWeeks,
			rivalProgressPct: progress,
		};
	});
}

export function sampleBoardExpectations(seed: number): BoardExpectation[] {
	const rng = mulberry32((seed >>> 0) ^ 0xa511e9b3);
	const rows = [
		{
			id: "frontier-proof",
			label: "Prove the next frontier",
			detail: "A visible model milestone before the next review window.",
			base: 68,
		},
		{
			id: "durable-economics",
			label: "Keep the lab solvent",
			detail: "Revenue and runway should support another ambitious quarter.",
			base: 54,
		},
		{
			id: "trust-by-design",
			label: "Earn durable trust",
			detail:
				"Evidence, reliability, and disclosure stay ahead of the hype cycle.",
			base: 76,
		},
	] as const;

	return rows.map((row) => {
		const progress = clamp(row.base + Math.floor(rng() * 21) - 10, 0, 100);
		return {
			id: row.id,
			label: row.label,
			detail: row.detail,
			progress,
			status: progress >= 70 ? "ahead" : progress >= 45 ? "on-track" : "watch",
		};
	});
}

export function sampleStrategicQuestion(seed: number): StrategicQuestion {
	const rng = mulberry32((seed >>> 0) ^ 0x63d83595);
	const selected =
		STRATEGIC_QUESTIONS[Math.floor(rng() * STRATEGIC_QUESTIONS.length)] ??
		STRATEGIC_QUESTIONS[0];
	return {
		id: selected.id,
		prompt: selected.prompt,
		context: selected.context,
		choices: selected.choices.map((choice) => ({ ...choice })),
	};
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function stageForProgress(progress: number): string {
	if (progress >= 75) return "category-lead";
	if (progress >= 50) return "launch-ready";
	if (progress >= 25) return "prototype";
	return "early research";
}
