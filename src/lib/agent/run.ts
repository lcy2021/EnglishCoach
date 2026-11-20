import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { formatOpenParagraph } from "@/lib/agent/paragraph-context";
import { COACH_SYSTEM_PROMPT } from "@/lib/agent/prompts/coach";
import { createAgentSessionContext } from "@/lib/agent/context";
import { getChatModel } from "@/lib/agent/model";
import { buildCoachTools } from "@/lib/agent/tools";
import { getArticle } from "@/lib/db";
import type { AppRoute, ViewLens, WorkspacePatch } from "@/lib/types";

export interface RunCoachInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  workspace: {
    articleId: string | null;
    selectedParagraphIndex: number | null;
    viewLens: ViewLens;
    translateOpen: boolean;
    route?: AppRoute;
  };
}

export type CoachStreamEvent =
  | { type: "delta"; text: string }
  | { type: "status"; text: string }
  | { type: "patches"; patches: WorkspacePatch[] }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

/** What to show the moment a tool starts; tools can refine it through ctx.progress. */
function startStatus(name: string, args: unknown): string {
  const a = (args ?? {}) as { query?: string; paragraphIndex?: number };
  if (name === "web_search" && a.query) return `正在搜索「${a.query.slice(0, 24)}」`;
  if (name === "check_translation" && typeof a.paragraphIndex === "number") {
    return `正在批改第 ${a.paragraphIndex + 1} 段的翻译`;
  }
  return TOOL_STATUS[name] ?? "正在处理";
}

const TOOL_STATUS: Record<string, string> = {
  web_search: "正在搜索网页",
  fetch_and_organize: "正在整理文章",
  generate_explain: "正在生成讲解",
  check_translation: "正在检查翻译",
  explain_selection: "正在解释这句话",
  open_article: "正在打开文章",
  open_wrong_item: "正在打开错题",
  navigate: "正在打开页面",
  list_library: "正在打开资产文章",
  delete_article: "正在删除文章",
  create_drill: "正在出题",
  list_drills: "正在打开资产题目",
  open_drill: "正在打开题目",
  grade_drill: "正在批改",
  list_vocab: "正在打开生词本",
  add_vocab: "正在加入生词",
  review_vocab: "正在记录复习",
  remove_vocab: "正在移除生词",
  get_stats: "正在打开学习总览",
  update_settings: "正在更新设置",
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
  const article = input.workspace.articleId ? getArticle(input.workspace.articleId) : null;
  const paragraphNote = formatOpenParagraph(article, input.workspace.selectedParagraphIndex);
  const system = paragraphNote ? `${COACH_SYSTEM_PROMPT}\n\n${paragraphNote}` : COACH_SYSTEM_PROMPT;
  const conversation: BaseMessage[] = [
    new SystemMessage(system),
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
      yield { type: "status", text: startStatus(call.name, call.args) };
      const before = ctx.patches.length;
      const target = toolsByName.get(call.name);

      // Run the tool while relaying whatever it reports about its own progress.
      const progress: string[] = [];
      let wake = null as (() => void) | null;
      ctx.progress = (text) => {
        progress.push(text);
        wake?.();
      };
      let finished = false;
      let result = "";
      const running = (async () => {
        try {
          if (!target) throw new Error(`Unknown tool: ${call.name}`);
          result = String(await target.invoke(call.args ?? {}));
        } catch (error) {
          result = JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          finished = true;
          wake?.();
        }
      })();
      while (true) {
        while (progress.length) yield { type: "status", text: progress.shift()! };
        if (finished) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      await running;
      ctx.progress = undefined;
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
