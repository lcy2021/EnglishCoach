"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Languages,
  MessageCircleQuestion,
  PenLine,
  ScrollText,
  Square,
  Volume2,
} from "lucide-react";
import { useWorkspace } from "@/lib/store/workspace";
import { GlossableText } from "@/components/HoverWord";
import { pokeOwl } from "@/components/OwlPet";
import { throwText, throwTextAfterPaint } from "@/components/TextThrow";
import { speak as speakAloud, speechSupported, stopSpeaking } from "@/lib/speech";
import { SaveWordButton } from "@/components/SaveWordButton";
import { ArticleLevel } from "@/components/ArticleLevel";
import type { Analysis } from "@/lib/glossary/level";
import { useLevel } from "@/lib/store/level";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookLoader } from "@/components/ui/loader";
import { explainDeliverKey } from "@/lib/explain/deliver";
import { joinZhLines, linesFromParagraph } from "@/lib/explain/sentences";
import type { Paragraph } from "@/lib/types";

/** True when this paragraph already has persisted bilingual notes. */
function paragraphHasExplain(paragraph: Paragraph): boolean {
  return linesFromParagraph(paragraph.text, paragraph.zh).some((line) => Boolean(line.zh));
}

export function ReaderView() {
  const article = useWorkspace((s) => s.article);
  const selected = useWorkspace((s) => s.selectedParagraphIndex);
  const translateOpen = useWorkspace((s) => s.translateOpen);
  const translateDraft = useWorkspace((s) => s.translateDraft);
  const feedback = useWorkspace((s) => s.translationFeedback);
  const extractions = useWorkspace((s) => s.explainExtractions);
  const busy = useWorkspace((s) => s.busy);
  const statusMessage = useWorkspace((s) => s.statusMessage);
  const setSelected = useWorkspace((s) => s.setSelectedParagraph);
  const setViewLens = useWorkspace((s) => s.setViewLens);
  const setTranslateOpen = useWorkspace((s) => s.setTranslateOpen);
  const setTranslateDraft = useWorkspace((s) => s.setTranslateDraft);
  const applyPatch = useWorkspace((s) => s.applyPatch);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [glossingIndex, setGlossingIndex] = useState<number | null>(null);
  const [explainingAll, setExplainingAll] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  /** Paragraph indices whose Chinese notes are currently visible. Hidden on open by default. */
  const [revealedExplain, setRevealedExplain] = useState<Set<number>>(() => new Set());
  const knownExplainRef = useRef<Set<number>>(new Set());
  const setRoute = useWorkspace((s) => s.setRoute);
  const level = useLevel((s) => s.level);
  const highlight = useLevel((s) => s.highlight);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const articleId = article?.id ?? null;
  const coachFetching =
    busy &&
    typeof statusMessage === "string" &&
    /抓取|整理文章|梳理正文|换个方式/.test(statusMessage);

  // Opening an article: keep stored notes but do not show them until the user clicks.
  useEffect(() => {
    const paragraphs = useWorkspace.getState().article?.paragraphs ?? [];
    const existing = new Set<number>();
    for (const paragraph of paragraphs) {
      if (paragraphHasExplain(paragraph)) existing.add(paragraph.index);
    }
    knownExplainRef.current = existing;
    setRevealedExplain(new Set());
  }, [articleId]);

  // Auto-reveal only paragraphs that gained notes during this generate/coach session.
  useEffect(() => {
    if (!article) return;
    const fresh: number[] = [];
    for (const paragraph of article.paragraphs) {
      if (!paragraphHasExplain(paragraph) || knownExplainRef.current.has(paragraph.index)) {
        continue;
      }
      knownExplainRef.current.add(paragraph.index);
      fresh.push(paragraph.index);
    }
    if (fresh.length === 0) return;
    if (!(busy || explainingAll || glossingIndex !== null)) return;
    setRevealedExplain((prev) => {
      const next = new Set(prev);
      for (const index of fresh) next.add(index);
      return next;
    });
  }, [article, busy, explainingAll, glossingIndex]);

  // Rate the article against the learner's level (dictionary lookups, no model call).
  useEffect(() => {
    if (!articleId) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const paragraphs = useWorkspace.getState().article?.paragraphs.map((p) => p.text) ?? [];
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paragraphs, level }),
          });
          if (!res.ok) throw new Error("analyze failed");
          const data = (await res.json()) as Analysis;
          if (!cancelled) setAnalysis(data);
        } catch {
          if (!cancelled) setAnalysis(null);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleId, level]);

  const marks = useMemo(
    () => (highlight && analysis ? new Set(analysis.hardForms) : undefined),
    [highlight, analysis],
  );

  // Stop any reading aloud when leaving the page.
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  function speak(text: string, index: number) {
    if (!speechSupported()) {
      applyPatch({ statusMessage: "当前浏览器不支持朗读" });
      return;
    }
    if (speakingIndex === index) {
      stopSpeaking();
      setSpeakingIndex(null);
      return;
    }
    setSpeakingIndex(index);
    speakAloud(text, {
      onEnd: () => setSpeakingIndex((current) => (current === index ? null : current)),
    });
  }

  useEffect(() => {
    if (!article || selected === null) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/translations?articleId=${article.id}&paragraphIndex=${selected}`,
        );
        const data = (await res.json()) as {
          translation?: { draftZh?: string };
        };
        if (!cancelled) {
          setTranslateDraft(data.translation?.draftZh ?? "");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [article, selected, setTranslateDraft]);

  async function handleFetch() {
    if (!url.trim() || fetching) return;
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "拉取失败");
      setFetchError(null);
      applyPatch({
        article: data.article,
        selectedParagraphIndex: 0,
        viewLens: "read",
        translateOpen: false,
        statusMessage: `已拉取《${data.article.title}》`,
      });
      throwText("article", (data.article.paragraphs as Array<{ text: string }>).map((p) => p.text).join(""));
      const removed = Number(data.removed) || 0;
      pokeOwl("cheer", removed > 0 ? `拉取完成,帮你清掉了 ${removed} 行网页杂质` : "拉取完成,开始读吧!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "拉取失败";
      setFetchError(message);
      applyPatch({ statusMessage: message });
    } finally {
      setFetching(false);
    }
  }

  async function saveDraft() {
    if (!article || selected === null) return;
    await fetch("/api/translations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleId: article.id,
        paragraphIndex: selected,
        draftZh: translateDraft,
      }),
    });
    applyPatch({ statusMessage: "译文已保存" });
  }

  async function explainWithModel(paragraphIndex: number) {
    if (!article || explainingAll) return;
    setGlossingIndex(paragraphIndex);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id, paragraphIndex }),
      });
      const data = (await res.json()) as {
        error?: string;
        article?: typeof article;
        extractions?: typeof extractions;
        deliverZh?: string;
      };
      if (!res.ok || !data.article) throw new Error(data.error || "讲解失败");
      applyPatch({
        article: data.article,
        viewLens: "explain",
        translateOpen: false,
        explainExtractions: data.extractions ?? [],
        statusMessage: "这段的中文已写好",
      });
      const paragraph = data.article.paragraphs.find((p) => p.index === paragraphIndex);
      const zh =
        data.deliverZh ||
        (paragraph ? joinZhLines(linesFromParagraph(paragraph.text, paragraph.zh)) : "");
      if (zh) throwTextAfterPaint(explainDeliverKey(paragraphIndex), zh);
    } catch (error) {
      applyPatch({
        statusMessage: error instanceof Error ? error.message : "讲解失败",
      });
    } finally {
      setGlossingIndex(null);
    }
  }

  /**
   * Full-article bilingual notes — one streaming model call (NDJSON per paragraph).
   * Each finished paragraph lands on the page and throws into its own node.
   */
  async function explainArticleAll() {
    if (!article || explainingAll || glossingIndex !== null) return;
    setExplainingAll(true);
    applyPatch({
      viewLens: "explain",
      translateOpen: false,
      statusMessage: "正在生成本篇讲解",
    });
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ articleId: article.id }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "讲解失败");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotParagraph = false;
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
            | { type: "status"; text: string }
            | {
                type: "paragraph";
                index: number;
                zh: string;
                article: typeof article;
                extractions: typeof extractions;
                done: number;
                total: number;
              }
            | { type: "done"; article: typeof article; extractions: typeof extractions }
            | { type: "error"; message: string };

          if (event.type === "status") {
            applyPatch({ statusMessage: event.text });
          } else if (event.type === "paragraph") {
            gotParagraph = true;
            applyPatch({
              article: event.article,
              viewLens: "explain",
              translateOpen: false,
              explainExtractions: event.extractions,
              statusMessage: `已完成 ${event.done}/${event.total} 段`,
            });
            if (event.zh) {
              throwTextAfterPaint(explainDeliverKey(event.index), event.zh);
            }
          } else if (event.type === "done") {
            applyPatch({
              article: event.article,
              viewLens: "explain",
              translateOpen: false,
              explainExtractions: event.extractions,
              statusMessage: "本篇讲解已生成",
            });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!gotParagraph) throw new Error("讲解没有写出中文");
      pokeOwl("cheer", "本篇讲解写好了，可以对照着读");
    } catch (error) {
      applyPatch({
        statusMessage: error instanceof Error ? error.message : "讲解失败",
      });
    } finally {
      setExplainingAll(false);
    }
  }

  function askCoach(text: string) {
    window.dispatchEvent(
      new CustomEvent("english-coach:send", { detail: { text } }),
    );
  }

  if (!article) {
    const loading = fetching || coachFetching;
    return (
      <section className="sheet space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">把一篇英文放进来</h1>
          <p className="text-muted-foreground">
            贴链接，或在右侧告诉教练要练什么。正文会出现在这里，悬停看词义，点一段再翻译或讲解。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (fetchError) setFetchError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleFetch();
            }}
            placeholder="粘贴文章链接"
            disabled={loading}
            className="h-11 rounded-xl border-2 px-4 text-base"
          />
          <Button size="lg" className="h-11 px-5" disabled={loading || !url.trim()} onClick={handleFetch}>
            {fetching ? "拉取中" : "拉取"}
          </Button>
        </div>
        {fetchError ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {fetchError}
            <span className="mt-1 block text-muted-foreground">可以换一个链接，或把正文粘贴给右侧教练整理。</span>
          </p>
        ) : null}
        {loading ? (
          <BookLoader
            label={fetching ? "正在拉取文章" : statusMessage || "正在整理文章"}
            className="py-10"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {[
              "找一篇今天能读完的英文短文",
              "找一篇可以逐段翻译的科普文",
              "打开文章库里最近的一篇",
            ].map((chip) => (
              <Button key={chip} variant="outline" className="rounded-full" onClick={() => askCoach(chip)}>
                {chip}
              </Button>
            ))}
          </div>
        )}
      </section>
    );
  }

  function leaveArticle() {
    applyPatch({
      article: null,
      selectedParagraphIndex: null,
      viewLens: "read",
      translateOpen: false,
      explainExtractions: [],
      translationFeedback: null,
      statusMessage: null,
    });
  }

  const total = article.paragraphs.length;
  const wordCount = article.paragraphs.reduce((sum, p) => sum + (p.text.match(/[A-Za-z']+/g)?.length ?? 0), 0);
  const minutes = Math.max(1, Math.round(wordCount / 200));
  const domain = (() => {
    if (!article.url) return null;
    try {
      return new URL(article.url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  const progress = selected === null ? 0 : (selected + 1) / Math.max(total, 1);
  const finished = selected !== null && selected === total - 1;

  return (
    <section className="sheet !max-w-[920px]">
      {/* sticky reading bar */}
      <div className="sticky -top-11 z-30 -mx-3 mb-6 flex items-center gap-3 rounded-2xl border bg-background/85 px-2 py-1.5 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={leaveArticle}>
          <ArrowLeft aria-hidden />
          返回
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">{article.title}</p>
        <div className="flex shrink-0 items-center gap-2 pr-2 text-xs font-semibold text-muted-foreground">
          <span className="tabular-nums">
            {selected === null ? 0 : selected + 1}/{total}
          </span>
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="阅读进度">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </span>
        </div>
      </div>

      <header className="mb-8 space-y-4">
        <h1 className="font-display text-[34px] leading-tight font-semibold tracking-tight">{article.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {domain ? (
            <a
              href={article.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-secondary-foreground hover:underline"
            >
              {domain}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <Badge variant="outline">粘贴文本</Badge>
          )}
          <span>{total} 段</span>
          <span aria-hidden>·</span>
          <span>约 {wordCount.toLocaleString("en-US")} 词</span>
          <span aria-hidden>·</span>
          <span>约 {minutes} 分钟</span>
        </div>
        {analysis ? <ArticleLevel analysis={analysis} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={explainingAll || glossingIndex !== null}
            onClick={() => void explainArticleAll()}
          >
            <ScrollText aria-hidden />
            {explainingAll ? "讲解生成中…" : "生成本篇讲解"}
          </Button>
        </div>
      </header>

      {explainingAll ? (
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground" role="status">
          {statusMessage || "正在生成本篇讲解"}
          <span className="typing-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </p>
      ) : null}

      <div className="prose" data-deliver="article" aria-busy={explainingAll}>
        {article.paragraphs.map((p) => {
          const active = selected === p.index;
          const hasExplain = paragraphHasExplain(p);
          const showExplain = revealedExplain.has(p.index);
          const paraExtractions = showExplain
            ? extractions.filter((item) => item.paragraphIndex === p.index)
            : [];
          return (
            <article key={p.index} className={active ? "para active" : "para"}>
              <span className="para-no" aria-hidden>
                {String(p.index + 1).padStart(2, "0")}
              </span>
              <button type="button" className="para-btn" onClick={() => setSelected(p.index)}>
                {(() => {
                  // English always comes from paragraph.text (stable keys).
                  // Chinese notes stay mounted only while this paragraph is revealed.
                  const lines = linesFromParagraph(p.text, p.zh);
                  return (
                    <div
                      className="sentence-pairs"
                      {...(showExplain ? { "data-deliver": explainDeliverKey(p.index) } : {})}
                    >
                      {lines.map((line, i) => (
                        <div key={`${p.index}-s${i}`} className="sentence-pair">
                          <p className="en">
                            <GlossableText text={line.en} marks={marks} />
                          </p>
                          {showExplain && line.zh ? <p className="zh">{line.zh}</p> : null}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </button>

              {active ? (
                <div className="toolbar">
                  <Button
                    onClick={() => {
                      setTranslateOpen(true);
                      setViewLens("translate");
                    }}
                  >
                    <PenLine aria-hidden />
                    自己译
                  </Button>
                  {hasExplain ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRevealedExplain((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.index)) next.delete(p.index);
                          else next.add(p.index);
                          return next;
                        });
                      }}
                    >
                      <Languages aria-hidden />
                      {showExplain ? "收起讲解" : "看讲解"}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={glossingIndex === p.index || explainingAll}
                      onClick={() => void explainWithModel(p.index)}
                    >
                      <Languages aria-hidden />
                      {glossingIndex === p.index ? "讲解中…" : "生成讲解"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => speak(p.text, p.index)}>
                    {speakingIndex === p.index ? <Square aria-hidden /> : <Volume2 aria-hidden />}
                    {speakingIndex === p.index ? "停止" : "朗读"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => askCoach(`请帮我讲解第 ${p.index + 1} 段的难点和句子结构`)}
                  >
                    <MessageCircleQuestion aria-hidden />
                    问教练
                  </Button>
                </div>
              ) : null}

              {paraExtractions.length > 0 ? (
                <ul className="para-gloss">
                  {paraExtractions.map((item) => (
                      <li key={item.id} className="gloss-frame">
                        <Badge variant={item.kind === "phrase" ? "secondary" : "default"}>
                          {item.kind === "phrase" ? "短语" : "生词"}
                        </Badge>
                        <b>
                          <GlossableText text={item.text} />
                        </b>
                        <span>{item.gloss}</span>
                        <SaveWordButton text={item.text} gloss={item.gloss} sentence={item.sentence} source="explain" className="ml-auto self-center" />
                      </li>
                    ))}
                </ul>
              ) : null}

              {active && translateOpen ? (
                <div className="editor">
                  <p className="mb-2 text-sm font-bold">自己翻译这一段</p>
                  <Textarea
                    value={translateDraft}
                    onChange={(e) => setTranslateDraft(e.target.value)}
                    rows={4}
                    placeholder="写下这段的中文,写完点「检查」让教练批改"
                    className="rounded-xl border-2 bg-card text-base"
                  />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{translateDraft.trim().length} 字</span>
                    <Button
                      disabled={!translateDraft.trim()}
                      onClick={async () => {
                        await saveDraft();
                        askCoach(
                          `检查第 ${p.index + 1} 段的翻译。请把问题说清楚：哪里意思偏了、为什么、更好的中文可以怎么写。`,
                        );
                      }}
                    >
                      检查
                    </Button>
                  </div>
                  {feedback ? (
                    <p data-deliver="translation-feedback" className="mt-3 rounded-xl bg-accent px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-accent-foreground">
                      {feedback}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {finished ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primary/30 bg-accent/60 px-5 py-4">
          <div>
            <p className="font-bold text-accent-foreground">读到最后一段了</p>
            <p className="text-sm text-muted-foreground">趁热打铁,去做几道题巩固一下?</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setRoute("library")}>
              回资产
            </Button>
            <Button onClick={() => setRoute("drill")}>
              去出题
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {(() => {
        const visibleExtractions = extractions.filter((item) =>
          revealedExplain.has(item.paragraphIndex),
        );
        if (visibleExtractions.length === 0) return null;
        return (
          <aside className="mt-8 rounded-2xl border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              短语和生词
              <Badge variant="secondary">{visibleExtractions.length}</Badge>
            </h2>
            <ul className="divide-y">
              {visibleExtractions.map((item) => (
                <li key={item.id} className="gloss-frame flex items-start gap-3 py-2.5">
                  <Badge variant={item.kind === "phrase" ? "secondary" : "default"} className="mt-0.5">
                    {item.kind === "phrase" ? "短语" : "生词"}
                  </Badge>
                  <div className="min-w-0 text-sm">
                    <b className="font-display text-base font-semibold">
                      <GlossableText text={item.text} />
                    </b>
                    <span className="ml-2 text-muted-foreground">{item.gloss}</span>
                    {item.sentence ? (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        <GlossableText text={item.sentence} />
                      </p>
                    ) : null}
                  </div>
                  <SaveWordButton text={item.text} gloss={item.gloss} sentence={item.sentence} source="explain" className="ml-auto" />
                </li>
              ))}
            </ul>
          </aside>
        );
      })()}
    </section>
  );
}
