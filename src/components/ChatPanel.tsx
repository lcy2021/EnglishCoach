"use client";

import { useEffect } from "react";
import { ArrowUp, Eraser, PanelRightClose } from "lucide-react";
import { Mascot, OwlMark } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
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

function CoachThread() {
  const busy = useWorkspace((s) => s.busy);
  const statusMessage = useWorkspace((s) => s.statusMessage);
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <ThreadPrimitive.Empty>
          <div className="my-auto flex flex-col items-center gap-3 text-center">
            <Mascot className="w-28" />
            <p className="text-lg font-bold">今天练什么？</p>
            <span className="text-sm text-muted-foreground">发一个链接，或让我找一篇英文文章。</span>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => (
              <MessagePrimitive.Root className="pop-in flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                  <MessagePrimitive.Parts />
                </div>
              </MessagePrimitive.Root>
            ),
            AssistantMessage: () => (
              <MessagePrimitive.Root className="pop-in flex items-start gap-2.5">
                <div
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-primary"
                >
                  <OwlMark className="size-5" />
                </div>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card px-3.5 py-2 text-sm leading-relaxed">
                  <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
                </div>
              </MessagePrimitive.Root>
            ),
          }}
        />
        {busy ? (
          <p className="pop-in flex items-center gap-2 text-sm text-muted-foreground">
            <span className="typing-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {statusMessage || "正在思考"}
          </p>
        ) : null}
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="flex items-end gap-2 border-t p-3">
        <ComposerPrimitive.Input
          placeholder="发消息"
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
            for (const patch of event.patches) live.applyPatch(patch);
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

  const runtime = useExternalStoreRuntime({
    messages,
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
