import {
	ATTENTION_MECHANISM_ID,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	RNN_LSTM_ID,
	SEQ2SEQ_ID,
	TEXT_ERA,
	WORD_VECTORS_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.foundations;

/** Era I: the sequence models that made attention worth inventing. */
export const FOUNDATIONS_NODES = [
	{
		id: WORD_VECTORS_ID,
		label: "Word vectors",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "foundations",
		branch: MODELS_BRANCH,
		status: "available",
		insightCost: 1,
		prerequisites: [],
		description:
			"The machine stopped memorizing the library and learned to place related words on the same map.",
	},
	{
		id: RNN_LSTM_ID,
		label: "RNNs and LSTMs",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "foundations",
		branch: INFRASTRUCTURE_BRANCH,
		status: "available",
		insightCost: 1,
		prerequisites: [],
		description:
			"A small recurrent memory lets the model carry yesterday's token into today's sentence without starting over.",
	},
	{
		id: SEQ2SEQ_ID,
		label: "Sequence-to-sequence",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "foundations",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "available",
		insightCost: 1,
		prerequisites: [],
		description:
			"The lab taught one sequence to become another: translation, summarization, and the first useful hand-offs.",
	},
	{
		id: ATTENTION_MECHANISM_ID,
		label: "Attention mechanism",
		era: TEXT_ERA,
		eraLabel: ERA_LABEL,
		category: "foundations",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [SEQ2SEQ_ID],
		description:
			"The machine learned to point at the right shelf instead of rereading every page in order.",
	},
] as const satisfies readonly ResearchDefinition[];
