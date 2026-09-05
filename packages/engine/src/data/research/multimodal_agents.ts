import {
	AGENT_RUNTIME_ID,
	ASSISTANT_MODELS_KEYSTONE_ID,
	INFRASTRUCTURE_BRANCH,
	MODELS_BRANCH,
	PRODUCTS_SAFETY_BRANCH,
	RESEARCH_CATEGORY_LABELS,
	type ResearchDefinition,
	VIDEO_WORLD_MODELS_ID,
	WORLD_SIMULATION_ID,
} from "./types.js";

const ERA_LABEL = RESEARCH_CATEGORY_LABELS.multimodal_agents;

/** Era VIII: perception, memory, and tools turn models into systems. */
export const MULTIMODAL_AGENTS_NODES = [
	{
		id: "vision_encoders",
		label: "Vision encoders",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [ASSISTANT_MODELS_KEYSTONE_ID, "t5_encoder_decoder"],
		description:
			"Images enter the same latent workspace as words, and the assistant can finally point to what it sees.",
	},
	{
		id: "tool_calling",
		label: "Tool calling",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [ASSISTANT_MODELS_KEYSTONE_ID, "assistant_models_tool_use"],
		description:
			"The assistant learns to ask another system for the answer instead of pretending the answer lives in its weights.",
	},
	{
		id: "rag_memory",
		label: "RAG memory",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"zero_shot_transfer",
			"assistant_models_reasoning",
		],
		description:
			"Retrieval lets the model borrow a current shelf of facts, keeping the frozen core useful after its cutoff.",
	},
	{
		id: "code_execution",
		label: "Code execution",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"tool_calling",
			"verification",
		],
		description:
			"A sandbox runs the tedious calculation, giving the agent a path from plausible text to checked work.",
	},
	{
		id: AGENT_RUNTIME_ID,
		label: "Agent runtime",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"tool_calling",
			"code_execution",
			"verification",
		],
		description:
			"Tool calls become a reliable loop: the agent plans, checks the result, and hands control back with its side effects accounted for.",
	},
	{
		id: "computer_use",
		label: "Computer use",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"tool_calling",
			"vision_encoders",
		],
		description:
			"Vision and tools meet at the screen: the agent can see a button, choose it, and own the consequence.",
	},
	{
		id: "mcp_protocols",
		label: "MCP-style protocols",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: PRODUCTS_SAFETY_BRANCH,
		status: "locked",
		insightCost: 1,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"tool_calling",
			"code_execution",
		],
		description:
			"A shared protocol gives tools a common doorway, so one agent can move between services without bespoke glue.",
	},
	{
		id: "long_context",
		label: "Long context",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: INFRASTRUCTURE_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"rag_memory",
			"mla_kv_compression",
		],
		description:
			"The working memory stretches across a book, a codebase, and a meeting without losing the thread at the binding.",
	},
	{
		id: VIDEO_WORLD_MODELS_ID,
		label: "Video world models",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			"multimodal_models_fusion",
			"vision_encoders",
		],
		description:
			"The model learns motion and continuity, turning licensed visual sequences into a costly but coherent world forecast.",
	},
	{
		id: WORLD_SIMULATION_ID,
		label: "World simulation",
		era: "multimodal" as const,
		eraLabel: ERA_LABEL,
		category: "multimodal_agents",
		branch: MODELS_BRANCH,
		status: "locked",
		insightCost: 2,
		prerequisites: [
			ASSISTANT_MODELS_KEYSTONE_ID,
			VIDEO_WORLD_MODELS_ID,
			AGENT_RUNTIME_ID,
		],
		description:
			"A grounded simulator predicts how scenes, tools, and agents change together, making planning more coherent and compute-intensive.",
	},
] as const satisfies readonly ResearchDefinition[];
