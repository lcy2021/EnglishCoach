import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { COACH_SYSTEM_PROMPT } from "@/lib/agent/prompts/coach";
import {
  createAgentSessionContext,
  type AgentSessionContext,
} from "@/lib/agent/context";
import { getChatModel } from "@/lib/agent/model";
import { buildCoachTools } from "@/lib/agent/tools";
import type { ViewLens, WorkspacePatch } from "@/lib/types";

export interface RunCoachInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  workspace: {
    articleId: string | null;
    selectedParagraphIndex: number | null;
    viewLens: ViewLens;
    translateOpen: boolean;
  };
}

export type CoachStreamEvent =
  | { type: "delta"; text: string }
  | { type: "status"; text: string }
  | { type: "patches"; patches: WorkspacePatch[] }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

const TOOL_STATUS: Record<string, string> = {
  web_search: "正在搜索网页",
  fetch_and_organize: "正在整理文章",
  generate_explain: "正在生成讲解",
  check_translation: "正在检查翻译",
  explain_selection: "正在解释这句话",
  open_article: "正在打开文章",
  open_wrong_item: "正在打开错题",
};

function chunkText(chunk: AIMessageChunk): string {
  const content = chunk.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String(part.text ?? "");
      }
      return "";
    })
    .join("");
}

function messageText(message: AIMessageChunk | undefined): string {
  if (!message) return "";
  return chunkText(message);
}

export async function* streamCoachAgent(
  input: RunCoachInput,
): AsyncGenerator<CoachStreamEvent> {
  const ctx = createAgentSessionContext(input.workspace);
  const tools = buildCoachTools(ctx);
  const toolsByName = new Map<
    string,
    { invoke: (input: unknown) => Promise<unknown> }
  >(
    tools.map((tool) => [
      tool.name,
      tool as { invoke: (input: unknown) => Promise<unknown> },
    ]),
  );
  const model = getChatModel(true, "chat").bindTools(tools);
  const conversation: BaseMessage[] = [
    new SystemMessage(COACH_SYSTEM_PROMPT),
    ...input.messages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  let reply = "";
  let guard = 0;
  yield { type: "status", text: "正在思考" };
  while (guard < 8) {
    guard += 1;
    const stream = await model.stream(conversation);
    let gathered: AIMessageChunk | undefined;
    let sawTool = false;
    for await (const chunk of stream) {
      if (chunk.tool_call_chunks?.some((call) => call.name || call.args)) {
        sawTool = true;
      }
      gathered = gathered ? gathered.concat(chunk) : chunk;
      if (!sawTool) {
        const text = chunkText(chunk);
        if (text) {
          reply += text;
          yield { type: "delta", text };
        }
      }
    }

    if (!gathered) break;
    conversation.push(gathered);
    const toolCalls = gathered.tool_calls ?? [];
    if (!toolCalls.length) {
      if (!reply) reply = messageText(gathered);
      yield { type: "done", reply };
      return;
    }

    for (const call of toolCalls) {
      yield {
        type: "status",
        text: TOOL_STATUS[call.name] ?? "正在处理",
      };
      const before = ctx.patches.length;
      const target = toolsByName.get(call.name);
      let result: string;
      try {
        if (!target) throw new Error(`Unknown tool: ${call.name}`);
        result = String(await target.invoke(call.args ?? {}));
      } catch (error) {
        result = JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (ctx.patches.length > before) {
        yield { type: "patches", patches: ctx.patches.slice(before) };
      }
      conversation.push(
        new ToolMessage({
          content: result,
          tool_call_id: call.id ?? call.name,
        }),
      );
    }
  }

  yield {
    type: "done",
    reply: reply || "步骤太多了，换一个更具体的要求再试。",
  };
}
