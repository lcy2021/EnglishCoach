"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Flame, History, Lightbulb, Plus, SkipForward, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Confetti } from "@/components/Confetti";
import { pokeOwl } from "@/components/OwlPet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DRILL_LEVELS, normalizeWord, type DrillLevel, type DrillListItem, type SavedDrill, type SlotGrade } from "@/lib/drill/parse";

interface TagItem {
  id: string;
  label: string;
}

export function DrillView() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DrillLevel>("进阶");
  const [customTopic, setCustomTopic] = useState("");
  const [newTag, setNewTag] = useState("");
  const [drillId, setDrillId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<SavedDrill | null>(null);
  const [attempt, setAttempt] = useState<string[]>([]);
  const [grades, setGrades] = useState<SlotGrade[] | null>(null);
  const [summary, setSummary] = useState("");
  const [history, setHistory] = useState<DrillListItem[]>([]);
  const [busy, setBusy] = useState<"create" | "grade" | null>(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hints, setHints] = useState<number[]>([]);
  const [hintCount, setHintCount] = useState(0);
  const [activeSlot, setActiveSlot] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  async function loadHistory() {
    const res = await fetch("/api/drill");
    const data = (await res.json()) as { drills?: DrillListItem[] };
    setHistory(data.drills ?? []);
  }

  async function loadTags() {
    const res = await fetch("/api/drill-tags");
    const data = (await res.json()) as { tags?: TagItem[] };
    const next = data.tags ?? [];
    setTags(next);
    setSelected((current) => {
      if (current.length > 0) {
        return current.filter((label) => next.some((tag) => tag.label === label));
      }
      const fallback = next.find((tag) => tag.label === "生活用语") ?? next[0];
      return fallback ? [fallback.label] : [];
    });
  }

  useEffect(() => {
    void loadHistory();
    void loadTags();
  }, []);

  function showDrill(drill: SavedDrill) {
    setDrillId(drill.id);
    setPrompt(drill);
    setAttempt(drill.attempt ?? drill.words.map(() => ""));
    setHints(drill.words.map(() => 0));
    setHintCount(0);
    setActiveSlot(0);
    setGrades(drill.grades);
    setSummary(drill.summary);
    setError("");
    if (!drill.grades) {
      requestAnimationFrame(() => inputs.current[0]?.focus());
    }
  }

  async function openDrill(id: string) {
    setError("");
    const res = await fetch(`/api/drill?id=${encodeURIComponent(id)}`);
    const data = (await res.json()) as { drill?: SavedDrill; error?: string };
    if (!res.ok || !data.drill) {
      setError(data.error || "找不到这道题");
      return;
    }
    showDrill(data.drill);
  }

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

  async function createQuestion() {
    if (selected.length === 0 && !customTopic.trim()) {
      setError("先选标签或写下方向");
      return;
    }
    setBusy("create");
    pokeOwl("think");
    setError("");
    setGrades(null);
    setSummary("");
    try {
      const res = await fetch("/api/drill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          tags: selected,
          topic: customTopic.trim(),
          difficulty,
        }),
      });
      const data = (await res.json()) as SavedDrill & { error?: string };
      if (!res.ok || !data.words || !data.id) throw new Error(data.error || "出题失败");
      showDrill({
        id: data.id,
        industry: data.industry,
        difficulty: data.difficulty ?? "进阶",
        zh: data.zh,
        words: data.words,
        end: data.end === "?" || data.end === "!" ? data.end : ".",
        attempt: null,
        grades: null,
        summary: "",
        createdAt: data.createdAt,
      });
      pokeOwl("happy");
      void loadHistory();
    } catch (caught) {
      pokeOwl("happy");
      setPrompt(null);
      setError(caught instanceof Error ? caught.message : "出题失败");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!prompt || busy) return;
    setBusy("grade");
    setError("");
    try {
      const res = await fetch("/api/drill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          zh: prompt.zh,
          words: prompt.words,
          end: prompt.end,
          attempt,
          id: drillId,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        slots?: SlotGrade[];
        summary?: string;
      };
      if (!res.ok || !data.slots) throw new Error(data.error || "批改失败");
      setGrades(data.slots);
      setSessionDone((n) => n + 1);
      setStreak((n) => (hintCount === 0 && data.slots!.every((slot) => slot.status === "correct") ? n + 1 : 0));
      if (data.slots.every((slot) => slot.status === "correct")) pokeOwl("cheer");
      setSummary(data.summary ?? "");
      void loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批改失败");
    } finally {
      setBusy(null);
    }
  }

  /** Reveal a bit more of the current blank: 1st letter -> half the word -> the whole word. */
  function giveHint() {
    if (!prompt || grades || busy) return;
    const isDone = (i: number) => normalizeWord(attempt[i] ?? "") === normalizeWord(prompt.words[i]);
    const target = !isDone(activeSlot)
      ? activeSlot
      : prompt.words.findIndex((_, i) => !isDone(i));
    if (target < 0) return;
    const level = Math.min((hints[target] ?? 0) + 1, 3);
    setHints((current) => current.map((item, i) => (i === target ? level : item)));
    setHintCount((n) => n + 1);
    if (level === 3) {
      writeSlot(target, prompt.words[target]);
    } else {
      inputs.current[target]?.focus();
    }
  }

  function hintMask(word: string, level: number): string {
    if (level <= 0) return "";
    const keep = level === 1 ? 1 : Math.ceil(word.length / 2);
    return word.slice(0, keep) + "·".repeat(Math.max(word.length - keep, 0));
  }

  useEffect(() => {
    if (!grades || busy !== null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      event.preventDefault();
      void createQuestion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades, busy]);

  function writeSlot(index: number, value: string) {
    setAttempt((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    // Typed the right word: hop to the next blank automatically.
    const expected = prompt?.words[index];
    if (expected && index < prompt!.words.length - 1 && normalizeWord(value) === normalizeWord(expected)) {
      inputs.current[index + 1]?.focus();
    }
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex items-center rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors",
      on
        ? "border-primary bg-accent text-accent-foreground"
        : "border-border bg-card text-muted-foreground hover:bg-muted",
    );

  const allCorrect = grades !== null && grades.every((g) => g.status === "correct");
  const practicing = prompt !== null;
  const settingsOpen = !practicing || showSettings;
  const scopeLabel =
    [...selected, customTopic.trim()].filter(Boolean).join("、") || "未选主题";

  const settingsPanel = (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-bold">想练哪些场景?</p>
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
          placeholder="想更具体?补充一句,比如「面试自我介绍」(可不填)"
          className="h-10 rounded-xl border-2"
          onChange={(event) => setCustomTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void createQuestion();
          }}
        />

        {!practicing ? (
          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={busy !== null}
            onClick={() => void createQuestion()}
          >
            <Sparkles aria-hidden />
            {busy === "create" ? "正在为你出题…" : "开始练习"}
          </Button>
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowSettings(false)}>
              <ChevronUp aria-hidden />
              收起设置
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <section className="sheet drill space-y-5">
      {!practicing ? (
        <header>
          <h1 className="text-3xl font-bold tracking-tight">翻译闯关</h1>
          <p className="mt-1 text-muted-foreground">
            看中文,把英文一个词一个词填出来。答完马上批改,一题接一题,没有题数上限。
          </p>
        </header>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
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
            <Badge variant="secondary">已练 {sessionDone} 题</Badge>
            {streak >= 2 ? (
              <motion.span
                key={streak}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
              >
                <Badge>
                  <Flame aria-hidden /> 连对 {streak}
                </Badge>
              </motion.span>
            ) : null}
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
            className="overflow-hidden"
          >
            {settingsPanel}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {busy === "create" && !prompt ? (
        <p className="text-center text-sm text-muted-foreground">正在为你出题…</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">{error}</p>
      ) : null}

      {prompt ? (
        <motion.div
          key={drillId ?? prompt.zh}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="relative"
        >
          {allCorrect ? <Confetti /> : null}
          <Card className="border-2">
            <CardContent className="space-y-6 py-2">
              <div className="space-y-2">
                <p className="text-xs font-bold tracking-wide text-primary">把这句话翻成英文</p>
                <p className="text-2xl leading-relaxed font-bold">{prompt.zh}</p>
              </div>
              <div className="drill-line" role="group" aria-label="英文翻译">
                {prompt.words.map((word, index) => {
                  const grade = grades?.[index];
                  const status = grade?.status ?? "";
                  return (
                    <label className="drill-slot" key={`${prompt.zh}-${index}`}>
                      <span className="drill-field">
                        <input
                          ref={(node) => {
                            inputs.current[index] = node;
                          }}
                          aria-label={`第 ${index + 1} 个词`}
                          aria-invalid={status === "wrong"}
                          className={cn(status, (hints[index] ?? 0) > 0 && "hinted")}
                          placeholder={hintMask(word, hints[index] ?? 0)}
                          onFocus={() => setActiveSlot(index)}
                          value={attempt[index] ?? ""}
                          disabled={busy !== null || grades !== null}
                          style={{ width: `${Math.max(word.length, 3) + 1}ch` }}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          onChange={(event) => writeSlot(index, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            if (index < prompt.words.length - 1) inputs.current[index + 1]?.focus();
                            else void submit();
                          }}
                        />
                        {index === prompt.words.length - 1 ? (
                          <span className="drill-end">{prompt.end}</span>
                        ) : null}
                      </span>
                      <span className={`drill-fix ${status}`}>
                        {grade && status !== "correct" ? grade.expected : ""}
                      </span>
                    </label>
                  );
                })}
              </div>

              {grades ? (
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm",
                    allCorrect ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  <p className="font-bold">{allCorrect ? (hintCount > 0 ? `全部正确!用了 ${hintCount} 次提示,下次试试少用` : "全部正确,太棒了!") : "差一点,看看红色的地方"}</p>
                  {summary ? <p className="mt-1 leading-relaxed opacity-90">{summary}</p> : null}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                {grades ? (
                  <Button size="lg" className="h-11 px-6" disabled={busy !== null} onClick={() => void createQuestion()}>
                    {busy === "create" ? "正在出题…" : "下一题"}
                    <kbd className="ml-1 rounded bg-white/25 px-1.5 text-xs font-medium">Enter</kbd>
                  </Button>
                ) : (
                  <>
                    <Button size="lg" className="h-11 px-6" disabled={busy !== null} onClick={() => void submit()}>
                      <Check aria-hidden />
                      {busy === "grade" ? "批改中…" : "检查答案"}
                    </Button>
                    <Button
                      size="lg"
                      variant="secondary"
                      disabled={busy !== null}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={giveHint}
                    >
                      <Lightbulb aria-hidden />
                      提示{hintCount > 0 ? `(${hintCount})` : ""}
                    </Button>
                    <Button size="lg" variant="ghost" disabled={busy !== null} onClick={() => void createQuestion()}>
                      <SkipForward aria-hidden />
                      跳过这题
                    </Button>
                    <Button
                      size="lg"
                      variant="ghost"
                      className="ml-auto text-muted-foreground"
                      disabled={busy !== null}
                      onClick={() => void submit()}
                    >
                      不会,看答案
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      <div className="space-y-3 pt-2">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <History className="size-4" aria-hidden />
          做过的题{history.length > 0 ? `(${history.length})` : ""}
          <ChevronDown className={cn("size-4 transition-transform", showHistory && "rotate-180")} aria-hidden />
        </button>
        {showHistory ? (
          history.length === 0 ? (
            <p className="text-sm text-muted-foreground">做过的题会留在这里,随时可以点开重做。</p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {history.map((item, i) => (
                <motion.li
                  key={item.id}
                  className="min-w-0"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                >
                  <button
                    type="button"
                    onClick={() => void openDrill(item.id)}
                    className={cn(
                      "flex w-full flex-col gap-1.5 rounded-2xl border-2 bg-card px-4 py-3 text-left transition-colors hover:bg-muted",
                      item.id === drillId && "border-primary bg-accent/50",
                    )}
                  >
                    <span className="truncate font-semibold">{item.zh}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">{item.industry}</Badge>
                      <Badge variant="outline">{item.difficulty}</Badge>
                      <Badge variant={item.graded ? "default" : "outline"}>{item.graded ? "已批改" : "未交卷"}</Badge>
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  );
}
