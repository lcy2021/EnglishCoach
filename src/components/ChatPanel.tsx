"use client";

import { useEffect, useMemo } from "react";
import { ArrowUp, Eraser, PanelRightClose } from "lucide-react";
import { Mascot, OwlThinking } from "@/components/illustrations";
import { throwTextAfterPaint } from "@/components/TextThrow";
import { Button } from "@/components/ui/button";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { useWorkspace } from "@/lib/store/workspace";
import type { ChatMessage, WorkspacePatch } from "@/lib/types";

function MarkdownText() {
  return <MarkdownTextPrimitive className="coach-md" smooth defer />;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="pop-in flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  // While a reply is running the runtime adds its own empty assistant message; skip it until text arrives.
  const hasText = useAuiState((s) =>
    s.message.parts.some((part) => part.type === "text" && part.text.length > 0),
  );
  if (!hasText) return null;
  return (
    <MessagePrimitive.Root className="pop-in flex items-start gap-2.5">
      <div aria-hidden className="size-9 shrink-0 overflow-visible">
        <Mascot className="w-full" float={false} />
      </div>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card px-3.5 py-2 text-sm leading-relaxed">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

const SUGGESTIONS = [
  "找一篇今天能读完的短文",
  "出一道生活用语的题",
  "开始复习生词",
  "打开学习总览",
] as const;

function askCoach(text: string) {
  window.dispatchEvent(new CustomEvent("english-coach:send", { detail: { text } }));
}

function CoachThread() {
  const busy = useWorkspace((s) => s.busy);
  const statusMessage = useWorkspace((s) => s.statusMessage);
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <ThreadPrimitive.Empty>
          <div className="my-auto flex flex-col items-center gap-3 text-center">
            <Mascot className="w-28" />
            <p className="text-lg font-bold">想做什么，直接说</p>
            <span className="max-w-[18rem] text-sm text-muted-foreground">
              阅读、讲解、翻译、出题、生词、错题、资产、统计和设置，我都能帮你做。
            </span>
            <div className="flex max-w-[18rem] flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => askCoach(text)}
                  className="rounded-full border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
        {busy ? (
          <p className="pop-in flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
            <OwlThinking size="md" />
            {statusMessage || "正在思考"}
          </p>
        ) : null}
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="flex items-end gap-2 border-t p-3">
        <ComposerPrimitive.Input
          placeholder="找文章、出题、复习、看统计…"
          rows={1}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border-2 bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary"
        />
        <ComposerPrimitive.Send asChild>
          <Button size="icon-lg" aria-label="发送">
            <ArrowUp aria-hidden />
          </Button>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

export function ChatPanel() {
  const messages = useWorkspace((s) => s.messages);
  const busy = useWorkspace((s) => s.busy);

  async function send(text: string) {
    const content = text.trim();
    const state = useWorkspace.getState();
    if (!content || state.busy) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantId = crypto.randomUUID();
    state.addMessage(userMessage);
    state.addMessage({ id: assistantId, role: "assistant", content: "" });
    state.setBusy(true);

    const history = [...state.messages, userMessage];
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
          workspace: {
            articleId: state.article?.id ?? null,
            selectedParagraphIndex: state.selectedParagraphIndex,
            viewLens: state.viewLens,
            translateOpen: state.translateOpen,
            route: state.route,
          },
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "Chat failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame
            .split("\n")
            .filter((item) => item.startsWith("data:"))
            .map((item) => item.slice(5).trim())
            .join("");
          if (!line) continue;
          const event = JSON.parse(line) as
            | { type: "delta"; text: string }
            | { type: "status"; text: string }
            | { type: "patches"; patches: WorkspacePatch[] }
            | { type: "done"; reply: string }
            | { type: "error"; message: string };
          const live = useWorkspace.getState();
          if (event.type === "delta") live.appendToMessage(assistantId, event.text);
          if (event.type === "status") {
            live.applyPatch({ statusMessage: event.text });
            const current = live.messages.find((message) => message.id === assistantId);
            if (current && !current.content) {
              live.appendToMessage(assistantId, "");
            }
          }
          if (event.type === "patches") {
            for (const patch of event.patches) {
              live.applyPatch(patch);
              if (patch.deliver) {
                throwTextAfterPaint(patch.deliver.target, patch.deliver.text);
              }
            }
          }
          if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (error) {
      const live = useWorkspace.getState();
      const current = live.messages.find((message) => message.id === assistantId);
      const note = error instanceof Error ? error.message : "出错了，请检查 LLM 配置。";
      if (!current?.content) live.appendToMessage(assistantId, note);
    } finally {
      useWorkspace.getState().setBusy(false);
    }
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (detail?.text) void send(detail.text);
    };
    window.addEventListener("english-coach:send", handler);
    return () => window.removeEventListener("english-coach:send", handler);
  }, []);

  // The empty assistant placeholder would render as a hollow bubble (two thin lines) until the first token.
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role !== "assistant" || message.content !== ""),
    [messages],
  );

  const runtime = useExternalStoreRuntime({
    messages: visibleMessages,
    isRunning: busy,
    convertMessage: (message: ChatMessage): ThreadMessageLike => ({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: [{ type: "text", text: message.content }],
    }),
    onNew: async (message: AppendMessage) => {
      const part = message.content.find((item) => item.type === "text");
      if (part && "text" in part) await send(part.text);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="收起教练"
              onClick={() => useWorkspace.getState().setChatOpen(false)}
            >
              <PanelRightClose aria-hidden />
            </Button>
            <span className="font-bold">教练</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || messages.length === 0}
            onClick={() => useWorkspace.getState().clearMessages()}
          >
            <Eraser aria-hidden />
            清空上下文
          </Button>
        </div>
        <CoachThread />
      </div>
    </AssistantRuntimeProvider>
  );
}
