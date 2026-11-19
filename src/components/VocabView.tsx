"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Check, Eye, Search, Trash2, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Confetti } from "@/components/Confetti";
import { EmptyIllustration, Mascot } from "@/components/illustrations";
import { pokeOwl } from "@/components/OwlPet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BookLoader } from "@/components/ui/loader";
import { Pager, pageSlice } from "@/components/ui/pager";
import { speak, useSpeech } from "@/lib/speech";
import { useVocab } from "@/lib/store/vocab";
import { useWorkspace } from "@/lib/store/workspace";
import { formatInterval, schedule, stageOf, type Rating, type VocabSummary, type VocabWord } from "@/lib/vocab/srs";
import { cn } from "@/lib/utils";

type Tab = "review" | "all";

/** The example sentence with the saved word picked out. */
function Highlighted({ sentence, word }: { sentence: string; word: string }) {
  const index = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, index)}
      <mark className="rounded bg-amber-200/70 px-0.5 text-inherit">{sentence.slice(index, index + word.length)}</mark>
      {sentence.slice(index + word.length)}
    </>
  );
}

function dueLabel(word: VocabWord): string {
  const ms = new Date(word.dueAt).getTime() - Date.now();
  return ms <= 0 ? "现在该复习" : formatInterval(ms).replace("后", "后复习");
}

const RATINGS: ReadonlyArray<{ key: Rating; label: string; hotkey: string; tone: string }> = [
  { key: "again", label: "忘了", hotkey: "1", tone: "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20" },
  { key: "hard", label: "模糊", hotkey: "2", tone: "border-border bg-muted text-foreground hover:bg-muted/70" },
  { key: "good", label: "记得", hotkey: "3", tone: "border-primary/50 bg-accent text-accent-foreground hover:bg-accent/70" },
];

function ReviewSession({ initial, onExit }: { initial: VocabWord[]; onExit: () => void }) {
  const [queue, setQueue] = useState<VocabWord[]>(initial);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [forgot, setForgot] = useState(0);
  const total = useRef(initial.length).current;
  const apply = useVocab((s) => s.apply);
  const current = queue[0];

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current) return;
      const word = current;
      setRevealed(false);
      setQueue((q) => (rating === "again" ? [...q.slice(1), word] : q.slice(1)));
      if (rating === "again") setForgot((n) => n + 1);
      else setDone((n) => n + 1);
      try {
        const res = await fetch("/api/vocab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "review", id: word.id, rating }),
        });
        if (res.ok) apply(((await res.json()) as { summary: VocabSummary }).summary);
      } catch {
        /* the card already advanced; the next refresh will resync */
      }
    },
    [current, apply],
  );

  useEffect(() => {
    if (queue.length === 0 && done > 0) pokeOwl("cheer");
  }, [queue.length, done]);

  // Optionally read each new card's word aloud as it appears.
  const autoPlay = useSpeech((s) => s.autoPlay);
  const currentId = current?.id;
  const currentText = current?.text;
  useEffect(() => {
    if (autoPlay && currentText) speak(currentText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, currentId, done, forgot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!current) return;
      if (!revealed) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const hit = RATINGS.find((r) => r.hotkey === event.key);
      if (hit) {
        event.preventDefault();
        void rate(hit.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, rate]);

  if (!current) {
    return (
      <div className="relative">
        <Confetti />
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <Mascot className="w-28" mood="cheer" />
          <p className="text-2xl font-bold">今天的复习完成!</p>
          <p className="text-muted-foreground">
            复习了 {done} 个词{forgot > 0 ? `,其中 ${forgot} 次没想起来,稍后还会再见` : ",全都记得,太棒了"}。
          </p>
          <Button size="lg" className="mt-2" onClick={onExit}>
            返回生词本
          </Button>
        </Card>
      </div>
    );
  }

  const progress = total === 0 ? 0 : done / total;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
        <button type="button" onClick={onExit} className="hover:text-foreground">
          结束
        </button>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="复习进度">
          <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id + "-" + done + "-" + forgot}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
        >
          <Card className="min-h-[340px] border-2 px-6 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[40px] leading-tight font-semibold tracking-tight">{current.text}</h2>
                <Button variant="ghost" size="icon" aria-label="朗读单词" onClick={() => speak(current.text)}>
                  <Volume2 aria-hidden />
                </Button>
              </div>
              {current.phonetic ? <p className="text-sm font-medium text-primary">{current.phonetic}</p> : null}
              {current.sentence ? (
                <p className="mt-2 max-w-prose font-display text-lg leading-relaxed text-muted-foreground">
                  <Highlighted sentence={current.sentence} word={current.text} />
                </p>
              ) : null}

              {revealed ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 w-full max-w-prose rounded-2xl bg-accent/60 px-5 py-4"
                >
                  <p className="text-lg font-semibold leading-relaxed text-accent-foreground">{current.gloss || "(没有释义)"}</p>
                </motion.div>
              ) : null}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>

      {!revealed ? (
        <Button size="lg" className="h-12 w-full text-base" onClick={() => setRevealed(true)}>
          <Eye aria-hidden />
          显示答案
          <kbd className="ml-1 rounded bg-white/25 px-1.5 text-xs font-medium">Space</kbd>
        </Button>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {RATINGS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => void rate(r.key)}
              className={cn("flex flex-col items-center gap-0.5 rounded-2xl border-2 px-3 py-3 font-semibold transition-colors", r.tone)}
            >
              <span className="text-base">{r.label}</span>
              <span className="text-xs font-medium opacity-70">
                {formatInterval(schedule(current.box, r.key).dueInMs)} · {r.hotkey}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export function VocabView() {
  const [tab, setTab] = useState<Tab>("review");
  const [words, setWords] = useState<VocabWord[]>([]);
  const [query, setQuery] = useState("");
  const [session, setSession] = useState<VocabWord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { total, due, mastered, apply } = useVocab();

  const loadAll = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/vocab?view=all&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { words: VocabWord[]; summary: VocabSummary };
          setWords(data.words);
          apply(data.summary);
        }
      } finally {
        setLoading(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    if (tab !== "all") return;
    const t = setTimeout(() => void loadAll(query), 180);
    return () => clearTimeout(t);
  }, [tab, query, loadAll]);

  useEffect(() => {
    void useVocab.getState().refresh().finally(() => setLoading(false));
  }, []);

  const pageCommand = useWorkspace((s) => s.pageCommand);
  useEffect(() => {
    if (!pageCommand) return;
    const vocab = pageCommand.vocab;
    if (vocab?.tab) setTab(vocab.tab);
    if (vocab?.query !== undefined) setQuery(vocab.query);
    if (vocab?.startReview) void startReview();
    else if (pageCommand.refresh?.includes("vocab") && tab === "all") void loadAll(vocab?.query ?? query);
  }, [pageCommand]);

  async function startReview() {
    const res = await fetch("/api/vocab?view=due&limit=20", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { words: VocabWord[]; summary: VocabSummary };
    apply(data.summary);
    if (data.words.length > 0) setSession(data.words);
  }

  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    await fetch(`/api/vocab?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setConfirmId(null);
    await loadAll(query);
  }

  const learning = useMemo(() => Math.max(total - mastered, 0), [total, mastered]);

  if (session) {
    return (
      <section className="sheet !max-w-[680px]">
        <ReviewSession
          initial={session}
          onExit={() => {
            setSession(null);
            void useVocab.getState().refresh();
          }}
        />
      </section>
    );
  }

  return (
    <section className="sheet !max-w-[760px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">生词本</h1>
          <p className="mt-1 text-muted-foreground">读文章时收藏的词,按遗忘曲线安排复习。</p>
        </div>
        <div role="group" aria-label="视图" className="inline-flex rounded-xl border bg-card p-1">
          {(
            [
              ["review", "复习"],
              ["all", `全部词${total ? `(${total})` : ""}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                tab === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["待复习", due, due > 0],
          ["学习中", learning, false],
          ["已掌握", mastered, false],
        ].map(([label, value, hot]) => (
          <div
            key={label as string}
            className={cn("rounded-2xl border bg-card px-4 py-3", hot && "border-primary/40 bg-accent/60")}
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value as number}</p>
          </div>
        ))}
      </div>

      {tab === "review" ? (
        total === 0 ? (
          <EmptyState />
        ) : due > 0 ? (
          <Card className="items-center gap-3 border-2 border-primary/30 px-6 py-8 text-center">
            <Mascot className="w-24" />
            <p className="text-xl font-bold">有 {due} 个词等你复习</p>
            <p className="text-sm text-muted-foreground">先看词和例句想一想,再点「显示答案」自评。</p>
            <Button size="lg" className="mt-1 h-12 px-8 text-base" onClick={() => void startReview()}>
              开始复习{due > 20 ? "(先来 20 个)" : ""}
            </Button>
          </Card>
        ) : (
          <Card className="items-center gap-2 px-6 py-8 text-center">
            <Mascot className="w-24" mood="cheer" />
            <p className="text-xl font-bold">今天没有要复习的词</p>
            <p className="text-sm text-muted-foreground">去读篇文章,收藏几个新词吧。</p>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索单词或释义"
              className="h-10 rounded-xl border-2 pl-9"
            />
          </div>
          {loading && words.length === 0 ? (
            <BookLoader label="正在翻找生词" className="py-10" />
          ) : words.length === 0 ? (
            query ? (
              <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的词</p>
            ) : (
              <EmptyState />
            )
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {pageSlice(words, page, PAGE_SIZE).map((w, i) => {
                const stage = stageOf(w.box);
                return (
                  <motion.li
                    key={w.id}
                    className="min-w-0"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.03 }}
                  >
                    <Card className="flex-row items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <b className="font-display text-lg font-semibold">{w.text}</b>
                          {w.phonetic ? <span className="text-xs text-primary">{w.phonetic}</span> : null}
                          <Badge variant={stage === "mastered" ? "default" : stage === "learning" ? "secondary" : "outline"}>
                            {stage === "mastered" ? "已掌握" : stage === "learning" ? "学习中" : "新词"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{dueLabel(w)}</span>
                        </div>
                        <p className="text-sm">{w.gloss || "—"}</p>
                        {w.sentence ? (
                          <p className="line-clamp-2 font-display text-sm text-muted-foreground">
                            <Highlighted sentence={w.sentence} word={w.text} />
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" aria-label={`朗读 ${w.text}`} onClick={() => speak(w.text)}>
                          <Volume2 aria-hidden />
                        </Button>
                        <Button
                          variant={confirmId === w.id ? "destructive" : "ghost"}
                          size={confirmId === w.id ? "default" : "icon"}
                          aria-label={`删除 ${w.text}`}
                          onClick={() => void remove(w.id)}
                          onBlur={() => setConfirmId((c) => (c === w.id ? null : c))}
                        >
                          {confirmId === w.id ? <Check aria-hidden /> : <Trash2 aria-hidden />}
                          {confirmId === w.id ? "确认删除" : null}
                        </Button>
                      </div>
                    </Card>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <Pager page={page} total={words.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <Card className="items-center gap-2 border-2 border-dashed px-6 py-10 text-center">
      <EmptyIllustration kind="library" className="w-28" />
      <p className="flex items-center gap-1.5 text-xl font-bold">
        <BookMarked className="size-5 text-primary" aria-hidden />
        生词本还是空的
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        读文章时把鼠标停在单词上,点气泡里的「收藏到生词本」;在「看讲解」里的短语和生词旁点 ☆ 也可以。
      </p>
    </Card>
  );
}
