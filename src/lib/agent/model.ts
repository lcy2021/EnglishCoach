import { ChatOpenAI } from "@langchain/openai";
import type { LLMResult } from "@langchain/core/outputs";
import { recordUsage } from "@/lib/db/stats";

/** What the model call is for; shown as the feature name in the usage chart. */
export type UsageSource =
  | "chat"
  | "drill-create"
  | "drill-grade"
  | "check-translation"
  | "generate-explain"
  | "explain-selection"
  | "paragraph-explain"
  | "other";

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
}

interface LlmEndOutput {
  llmOutput?: { tokenUsage?: TokenUsage } | null;
  generations?: Array<
    Array<{
      message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } };
    }>
  >;
}

/** Providers report usage differently for streaming and non-streaming calls; read both. */
function readUsage(result: LLMResult): { input: number; output: number } {
  const output = result as unknown as LlmEndOutput;
  const fromLlm = output.llmOutput?.tokenUsage;
  if (fromLlm && (fromLlm.promptTokens || fromLlm.completionTokens)) {
    return { input: fromLlm.promptTokens ?? 0, output: fromLlm.completionTokens ?? 0 };
  }
  let input = 0;
  let out = 0;
  for (const group of output.generations ?? []) {
    for (const generation of group) {
      input += generation.message?.usage_metadata?.input_tokens ?? 0;
      out += generation.message?.usage_metadata?.output_tokens ?? 0;
    }
  }
  return { input, output: out };
}

export function getChatModel(streaming = false, source: UsageSource = "other") {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set. Copy .env.example to .env.local.");
  }
  const modelName = process.env.LLM_MODEL || "gpt-4o-mini";
  return new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0.3,
    streaming,
    streamUsage: true,
    configuration: {
      baseURL: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    },
    callbacks: [
      {
        handleLLMEnd(output: LLMResult) {
          const usage = readUsage(output);
          recordUsage({ source, model: modelName, input: usage.input, output: usage.output });
        },
      },
    ],
  });
}
