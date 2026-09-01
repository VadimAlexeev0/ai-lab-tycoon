import { z } from "zod";

export const MAX_REQUEST_ID_LENGTH = 128;
export const MAX_REVISION = 1_000_000;
export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_COMMAND_NAME_LENGTH = 80;
export const MAX_COMMAND_JSON_LENGTH = 16_384;

const identifier = z
	.string()
	.min(1)
	.max(MAX_IDENTIFIER_LENGTH)
	.regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const commandName = z.string().trim().min(1).max(MAX_COMMAND_NAME_LENGTH);
const nonNegativePercentage = z.number().int().nonnegative().max(100);
const nonNegativeEmphasis = z.number().int().nonnegative().max(6);

const decisionChoiceInput = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("launch"),
			decisionId: identifier,
			channel: z.enum(["chat", "developer_api", "enterprise"]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("evaluate"),
			decisionId: identifier,
			evaluation: z.enum(["capability", "safety_reliability"]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("funding"),
			decisionId: identifier,
			round: z.enum(["seed", "series_a"]),
			accept: z.boolean(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("incident"),
			decisionId: identifier,
			response: z.enum(["repair", "reduce_scope", "disclose"]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("paradigm"),
			decisionId: identifier,
			paradigmId: z.enum([
				"scale_maximalism",
				"data_curation_doctrine",
				"architecture_tinkering",
			]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("shelve"),
			decisionId: identifier,
		})
		.strict(),
]);

const modelDesignInput = z
	.object({
		kind: z.literal("design_model"),
		name: commandName,
		family: z.enum(["text", "assistant", "multimodal"]),
		foundation: z.enum(["fresh", "continued", "distilled"]),
		parentModelId: identifier.nullable(),
		tier: z.enum(["lean", "standard", "aggressive"]),
		dataMix: z
			.object({
				general: nonNegativePercentage,
				code: nonNegativePercentage,
				multimodal: nonNegativePercentage,
			})
			.strict(),
		emphasis: z
			.object({
				capability: nonNegativeEmphasis,
				reliability: nonNegativeEmphasis,
				safety: nonNegativeEmphasis,
				efficiency: nonNegativeEmphasis,
			})
			.strict(),
		teamId: identifier,
	})
	.strict();

/** The only command payloads accepted by the authenticated gameplay endpoint. */
export const commandPayloadInput = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("start_run"),
			setup: z
				.object({
					companyName: commandName,
				})
				.strict(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("replace_run"),
			setup: z
				.object({
					companyName: commandName,
				})
				.strict(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("advance_week"),
		})
		.strict(),
	z
		.object({
			kind: z.literal("apply_decision"),
			choice: decisionChoiceInput,
		})
		.strict(),
	z
		.object({
			kind: z.literal("assign_project"),
			teamId: identifier,
			projectId: identifier,
		})
		.strict(),
	z
		.object({
			kind: z.literal("cancel_project"),
			teamId: identifier,
			projectId: identifier,
		})
		.strict(),
	modelDesignInput,
	z
		.object({
			kind: z.literal("run_evaluation"),
			modelId: identifier,
			evaluation: z.enum(["capability", "safety_reliability"]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("launch_product"),
			modelId: identifier,
			channel: z.enum(["chat", "developer_api", "enterprise"]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("product_resume"),
			productId: identifier,
		})
		.strict(),
	z
		.object({
			kind: z.literal("buy_compute"),
		})
		.strict(),
	z
		.object({
			kind: z.literal("hire_team"),
		})
		.strict(),
]);

/** Typed, bounded, closed-world request contract for server-authoritative play. */
export const applyCommandInput = z
	.object({
		requestId: z
			.string()
			.min(1)
			.max(MAX_REQUEST_ID_LENGTH)
			.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
		expectedRevision: z.number().int().nonnegative().max(MAX_REVISION),
		command: commandPayloadInput,
	})
	.strict();

export type ApplyCommandInput = z.infer<typeof applyCommandInput>;
export type ApplyCommand = ApplyCommandInput["command"];
export type DecisionChoiceInput = z.infer<typeof decisionChoiceInput>;
