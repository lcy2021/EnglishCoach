"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  MessagesSquare,
  Plus,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { GlossableText } from "@/components/HoverWord";
import { OwlThinking } from "@/components/illustrations";
import { pokeOwl } from "@/components/OwlPet";
import { throwText } from "@/components/TextThrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { speak as speakAloud, speechSupported, stopSpeaking } from "@/lib/speech";
import { useWorkspace } from "@/lib/store/workspace";
import { DRILL_LEVELS, type DrillLevel } from "@/lib/drill/parse";
import type { ConverseReply, ConverseTurn } from "@/lib/converse/converse";
import { keepKnownTags, loadConversePrefs, saveConversePrefs } from "@/lib/practice-prefs";

interface TagItem {
  id: string;
  label: string;
}

export function ConverseView() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DrillLevel>("进阶");
  const [customTopic, setCustomTopic] = useState("");
  const [newTag, setNewTag] = useState("");
  const [turns, setTurns] = useState<ConverseTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"start" | "reply" | null>(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pageCommand = useWorkspace((s) => s.pageCommand);
  const startedCommand = useRef<string | null>(null);
  const autoPlayedKey = useRef<string | null>(null);

  useEffect(() => {
    const saved = loadConversePrefs();
    if (saved) {
      if (saved.tags.length > 0) setSelected(saved.tags);
      setDifficulty(saved.difficulty);
      setCustomTopic(saved.topic);
    }
  }, []);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/drill-tags");
        if (!current) return;
        const data = (await res.json()) as { tags?: TagItem[] };
        const next = data.tags ?? [];
        setTags(next);
        setSelected((currentSelected) => {
          const known = keepKnownTags(currentSelected, next);
          if (known.length > 0) return known;
          const saved = keepKnownTags(loadConversePrefs()?.tags ?? [], next);
          if (saved.length > 0) return saved;
          const fallback = next.find((tag) => tag.label === "生活用语") ?? next[0];
          return fallback ? [fallback.label] : [];
        });
      })();
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(timer);
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (selected.length === 0 && !customTopic.trim()) return;
    saveConversePrefs({ tags: selected, difficulty, topic: customTopic });
  }, [selected, difficulty, customTopic]);

  useEffect(() => {
    const cmd = pageCommand?.converse;
    if (!cmd || !pageCommand?.id) return;
    if (startedCommand.current === pageCommand.id) return;
    startedCommand.current = pageCommand.id;
    if (cmd.tags && cmd.tags.length > 0) setSelected(cmd.tags);
    if (cmd.topic) setCustomTopic(cmd.topic);
    if (cmd.difficulty) setDifficulty(cmd.difficulty);
    if (cmd.autoStart) {
      window.setTimeout(() => {
        void beginChat({
          tags: cmd.tags,
          topic: cmd.topic,
          difficulty: cmd.difficulty,
        });
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCommand]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [turns, busy]);

  useEffect(() => {
    if (turns.length === 0 || busy !== null) return;
    const frame = window.requestAnimationFrame(() => {
      (document.querySelector("[data-converse-input]") as HTMLTextAreaElement | null)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [turns.length, busy]);

  // AI 每说完一句就自动朗读（开场与每次回复）。
  useEffect(() => {
    if (busy !== null || !speechSupported()) return;
    let lastIndex = -1;
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i]?.role === "assistant") {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex < 0) return;
    const line = turns[lastIndex]!;
    const key = `ai:${lastIndex}:${line.en}`;
    if (autoPlayedKey.current === key) return;
    autoPlayedKey.current = key;
    stopSpeaking();
    setSpeakingKey(key);
    const ok = speakAloud(line.en, { onEnd: () => setSpeakingKey(null) });
    if (!ok) setSpeakingKey(null);
  }, [turns, busy]);

  function toggleTag(label: string) {
    setSelected((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  async function addTag() {
    const label = newTag.trim();
    if (!label) return;
    const res = await fetch("/api/drill-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = (await res.json()) as { tags?: TagItem[]; tag?: TagItem; error?: string };
    if (!res.ok || !data.tag) {
      setError(data.error || "添加标签失败");
      return;
    }
    setTags(data.tags ?? []);
    setSelected((current) => (current.includes(data.tag!.label) ? current : [...current, data.tag!.label]));
    setNewTag("");
    setError("");
  }

  async function removeTag(id: string, label: string) {
    const res = await fetch(`/api/drill-tags?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = (await res.json()) as { tags?: TagItem[]; error?: string };
    if (!res.ok) {
      setError(data.error || "删除标签失败");
      return;
    }
    setTags(data.tags ?? []);
    setSelected((current) => current.filter((item) => item !== label));
  }

  function speakText(key: string, text: string) {
    if (!speechSupported()) return;
    if (speakingKey === key) {
      stopSpeaking();
      setSpeakingKey(null);
      return;
    }
    stopSpeaking();
    setSpeakingKey(key);
    const ok = speakAloud(text, { onEnd: () => setSpeakingKey(null) });
    if (!ok) setSpeakingKey(null);
  }

  async function beginChat(override?: {
    tags?: string[];
    topic?: string;
    difficulty?: DrillLevel;
  }) {
    const nextTags = override?.tags?.length ? override.tags : selected;
    const nextTopic = override?.topic ?? customTopic.trim();
    const nextDifficulty = override?.difficulty ?? difficulty;
    if (nextTags.length === 0 && !nextTopic.trim()) {
      setError("先选标签或写下方向");
      return;
    }
    if (override?.tags?.length) setSelected(override.tags);
    if (override?.topic !== undefined) setCustomTopic(override.topic);
    if (override?.difficulty) setDifficulty(override.difficulty);

    setBusy("start");
    pokeOwl("think");
    setError("");
    setTurns([]);
    setDraft("");
    setShowSettings(false);
    stopSpeaking();
    setSpeakingKey(null);
    autoPlayedKey.current = null;
    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          tags: nextTags,
          topic: nextTopic.trim(),
          difficulty: nextDifficulty,
        }),
      });
      const data = (await res.json()) as { reply?: ConverseReply; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || "开始对话失败");
      const first: ConverseTurn = {
        role: "assistant",
        en: data.reply.en,
        zh: data.reply.zh,
      };
      setTurns([first]);
      pokeOwl("happy");
      throwText("converse-line", data.reply.en);
    } catch (caught) {
      pokeOwl("happy");
      setError(caught instanceof Error ? caught.message : "开始对话失败");
    } finally {
      setBusy(null);
    }
  }

  async function sendReply() {
    const message = draft.trim();
    if (!message || busy) return;
    if (selected.length === 0 && !customTopic.trim()) {
      setError("先选标签或写下方向");
      return;
    }
    const mine: ConverseTurn = { role: "user", en: message };
    const history = turns;
    setTurns((current) => [...current, mine]);
    setDraft("");
    setBusy("reply");
    pokeOwl("think");
    setError("");
    stopSpeaking();
    setSpeakingKey(null);
    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          tags: selected,
          topic: customTopic.trim(),
          difficulty,
          history,
          message,
        }),
      });
      const data = (await res.json()) as { reply?: ConverseReply; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || "回复失败");
      const next: ConverseTurn = {
        role: "assistant",
        en: data.reply.en,
        zh: data.reply.zh,
      };
      setTurns((current) => {
        const coached = current.map((turn, index) =>
          index === current.length - 1 && turn.role === "user"
            ? {
                ...turn,
                feedback: data.reply!.feedback || undefined,
                native: data.reply!.native || undefined,
              }
            : turn,
        );
        return [...coached, next];
      });
      pokeOwl("happy");
      throwText("converse-line", data.reply.en);
    } catch (caught) {
      pokeOwl("happy");
      setTurns(history);
      setDraft(message);
      setError(caught instanceof Error ? caught.message : "回复失败");
    } finally {
      setBusy(null);
    }
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex items-center rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors",
      on
        ? "border-primary bg-accent text-accent-foreground"
        : "border-border bg-card text-muted-foreground hover:bg-muted",
    );

  const chatting = turns.length > 0;
  const settingsOpen = !chatting || showSettings;
  const scopeLabel = [...selected, customTopic.trim()].filter(Boolean).join("、") || "未选主题";
  const userTurns = turns.filter((turn) => turn.role === "user").length;

  const settingsPanel = (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-bold">想聊哪些场景?</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="主题标签">
            {tags.map((tag) => {
              const on = selected.includes(tag.label);
              return (
                <motion.span
                  key={tag.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  className={cn(chip(on), "gap-1 py-0 pr-1.5 pl-0")}
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    className="py-1.5 pr-1 pl-3.5"
                    onClick={() => toggleTag(tag.label)}
                  >
                    {tag.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`删除标签 ${tag.label}`}
                    className="grid size-5 place-items-center rounded-full opacity-50 hover:bg-foreground/10 hover:opacity-100"
                    onClick={() => void removeTag(tag.id, tag.label)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </motion.span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newTag}
              placeholder="没有想要的?自己加一个,比如 雅思、口语"
              maxLength={20}
              className="h-9 rounded-xl border-2"
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void addTag();
              }}
            />
            <Button variant="secondary" onClick={() => void addTag()}>
              <Plus aria-hidden />
              添加
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold">难度</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="难度">
            {DRILL_LEVELS.map((item) => (
              <motion.button
                key={item}
                type="button"
                whileTap={{ scale: 0.92 }}
                className={chip(item === difficulty)}
                aria-pressed={item === difficulty}
                onClick={() => setDifficulty(item)}
              >
                {item}
              </motion.button>
            ))}
          </div>
        </div>

        <Input
          value={customTopic}
          placeholder="想更具体?补充一句,比如「咖啡店点单」(可不填)"
          className="h-10 rounded-xl border-2"
          onChange={(event) => setCustomTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void beginChat();
          }}
        />

        {!chatting ? (
          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={busy !== null}
            onClick={() => void beginChat()}
          >
            <Sparkles aria-hidden />
            {busy === "start" ? "正在开场…" : "开始对话"}
          </Button>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSettings(false)}>
              <ChevronUp aria-hidden />
              收起设置
            </Button>
            <Button disabled={busy !== null} onClick={() => void beginChat()}>
              <MessagesSquare aria-hidden />
              新开一场
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <section
      className={cn(
        "sheet converse flex min-h-0 flex-col gap-5",
        chatting && "converse--active",
      )}
    >
      {!chatting ? (
        <header className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight">对话模式</h1>
          <p className="mt-1 text-muted-foreground">
            自由打字回一句英文（不是填空）。AI 会按当前语境提示你该说什么，再说下一句并自动朗读。
          </p>
        </header>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="inline-flex max-w-full items-center gap-2 rounded-full border-2 bg-card px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
            <span className="truncate">
              {scopeLabel} · {difficulty}
            </span>
            <span className="shrink-0 text-xs text-primary">{showSettings ? "收起" : "调整"}</span>
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Badge variant="secondary">已说 {userTurns} 句</Badge>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {settingsOpen ? (
          <motion.div
            key="settings"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="shrink-0 overflow-hidden"
          >
            {settingsPanel}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="shrink-0 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {busy === "start" ? (
        <p
          className="pop-in flex shrink-0 items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
          role="status"
        >
          <OwlThinking size="md" />
          正在开场…
        </p>
      ) : null}

      {chatting && busy !== "start" ? (
        <Card className="flex min-h-0 flex-1 flex-col border-2">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 py-2">
            <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {turns.map((turn, index) => {
                const mine = turn.role === "user";
                const aiKey = `ai:${index}:${turn.en}`;
                const nativeKey = `native:${index}:${turn.native ?? ""}`;
                return (
                  <motion.div
                    key={`${turn.role}-${index}-${turn.en}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[92%] space-y-1.5 rounded-2xl px-4 py-3",
                        mine
                          ? "border border-primary/25 bg-accent text-foreground"
                          : "bg-muted/60 text-foreground",
                      )}
                      data-deliver={!mine && index === turns.length - 1 ? "converse-line" : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold tracking-wide text-muted-foreground">
                          {mine ? "你" : "AI"}
                        </p>
                        {!mine ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 gap-1 px-2"
                            onClick={() => speakText(aiKey, turn.en)}
                          >
                            {speakingKey === aiKey ? (
                              <Square className="size-3" aria-hidden />
                            ) : (
                              <Volume2 className="size-3" aria-hidden />
                            )}
                            {speakingKey === aiKey ? "停止" : "朗读"}
                          </Button>
                        ) : null}
                      </div>
                      <p className="gloss-frame text-base leading-relaxed font-semibold">
                        <GlossableText text={turn.en} />
                      </p>
                      {!mine && turn.zh ? (
                        <p className="text-sm text-muted-foreground">{turn.zh}</p>
                      ) : null}
                      {mine && (turn.feedback || turn.native) ? (
                        <div className="space-y-2 rounded-xl bg-background/70 px-3 py-2 text-xs leading-relaxed">
                          {turn.feedback ? (
                            <p>
                              <span className="font-bold">语境提示：</span>
                              {turn.feedback}
                            </p>
                          ) : null}
                          {turn.native ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold">这时可以说</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-6 gap-1 px-2 text-[11px]"
                                  onClick={() => speakText(nativeKey, turn.native!)}
                                >
                                  {speakingKey === nativeKey ? (
                                    <Square className="size-3" aria-hidden />
                                  ) : (
                                    <Volume2 className="size-3" aria-hidden />
                                  )}
                                  {speakingKey === nativeKey ? "停止" : "听一下"}
                                </Button>
                              </div>
                              <p className="gloss-frame text-sm font-semibold">
                                <GlossableText text={turn.native} />
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
              {busy === "reply" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <OwlThinking size="sm" />
                  正在看你的英文并回复…
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-end gap-2 border-t pt-3">
              <Textarea
                data-converse-input=""
                value={draft}
                placeholder="输入你的回复"
                className="min-h-11 max-h-32 resize-y rounded-xl border-2"
                disabled={busy !== null}
                rows={2}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  void sendReply();
                }}
              />
              <Button
                size="lg"
                className="h-11 shrink-0 px-5"
                disabled={busy !== null || !draft.trim()}
                onClick={() => void sendReply()}
              >
                <Send aria-hidden />
                发送
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
