"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
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
import { throwText } from "@/components/TextThrow";
import { speak as speakAloud, speechSupported, stopSpeaking } from "@/lib/speech";
import { SaveWordButton } from "@/components/SaveWordButton";
import { ArticleLevel } from "@/components/ArticleLevel";
import type { Analysis } from "@/lib/glossary/level";
import { useLevel } from "@/lib/store/level";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ReaderView() {
  const article = useWorkspace((s) => s.article);
  const selected = useWorkspace((s) => s.selectedParagraphIndex);
  const viewLens = useWorkspace((s) => s.viewLens);
  const translateOpen = useWorkspace((s) => s.translateOpen);
  const translateDraft = useWorkspace((s) => s.translateDraft);
  const feedback = useWorkspace((s) => s.translationFeedback);
  const extractions = useWorkspace((s) => s.explainExtractions);
  const setSelected = useWorkspace((s) => s.setSelectedParagraph);
  const setViewLens = useWorkspace((s) => s.setViewLens);
  const setTranslateOpen = useWorkspace((s) => s.setTranslateOpen);
  const setTranslateDraft = useWorkspace((s) => s.setTranslateDraft);
  const applyPatch = useWorkspace((s) => s.applyPatch);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [glossingIndex, setGlossingIndex] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const setRoute = useWorkspace((s) => s.setRoute);
  const level = useLevel((s) => s.level);
  const highlight = useLevel((s) => s.highlight);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const articleId = article?.id ?? null;

  // Rate the article against the learner's level (dictionary lookups, no model call).
  useEffect(() => {
    if (!articleId) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    (async () => {
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
    return () => {
      cancelled = true;
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
    (async () => {
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
    return () => {
      cancelled = true;
    };
  }, [article, selected, setTranslateDraft]);

  async function handleFetch() {
    if (!url.trim()) return;
    setFetching(true);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
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
      applyPatch({
        statusMessage:
          error instanceof Error ? error.message : "拉取失败",
      });
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
    if (!article) return;
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
      };
      if (!res.ok || !data.article) throw new Error(data.error || "讲解失败");
      applyPatch({
        article: data.article,
        viewLens: "explain",
        translateOpen: false,
        explainExtractions: data.extractions ?? [],
        statusMessage: "这段的中文已写好",
      });
    } catch (error) {
      applyPatch({
        statusMessage: error instanceof Error ? error.message : "讲解失败",
      });
    } finally {
      setGlossingIndex(null);
    }
  }

  function askCoach(text: string) {
    window.dispatchEvent(
      new CustomEvent("english-coach:send", { detail: { text } }),
    );
  }

  if (!article) {
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
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleFetch();
            }}
            placeholder="粘贴文章链接"
            className="h-11 rounded-xl border-2 px-4 text-base"
          />
          <Button size="lg" className="h-11 px-5" disabled={fetching} onClick={handleFetch}>
            {fetching ? "拉取中" : "拉取"}
          </Button>
        </div>
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
  const hasZh = article.paragraphs.some((p) => p.zh);
  const progress = selected === null ? 0 : (selected + 1) / Math.max(total, 1);
  const finished = selected !== null && selected === total - 1;

  return (
    <section className="sheet !max-w-[760px]">
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
          <div role="group" aria-label="显示方式" className="inline-flex rounded-xl border bg-card p-1">
            {(
              [
                ["read", "仅英文", BookOpenText],
                ["explain", "中英对照", Languages],
              ] as const
            ).map(([key, label, Icon]) => {
              const on = key === "explain" ? viewLens === "explain" : viewLens !== "explain";
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (key === "explain" && !hasZh) {
                      askCoach("生成本篇讲解，中英对照并提炼短语和生词");
                      return;
                    }
                    setViewLens(key);
                    setTranslateOpen(false);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                    on ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
          <Button variant="secondary" onClick={() => askCoach("生成本篇讲解，中英对照并提炼短语和生词")}>
            <ScrollText aria-hidden />
            生成本篇讲解
          </Button>
        </div>
      </header>

      <div className="prose" data-deliver="article">
        {article.paragraphs.map((p) => {
          const active = selected === p.index;
          return (
            <article key={p.index} className={active ? "para active" : "para"}>
              <span className="para-no" aria-hidden>
                {String(p.index + 1).padStart(2, "0")}
              </span>
              <button type="button" className="para-btn" onClick={() => setSelected(p.index)}>
                <p>
                  <GlossableText text={p.text} marks={marks} />
                </p>
                {viewLens === "explain" && p.zh ? <p className="zh">{p.zh}</p> : null}
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
                  <Button
                    variant="secondary"
                    disabled={glossingIndex === p.index}
                    onClick={() => void explainWithModel(p.index)}
                  >
                    <Languages aria-hidden />
                    {glossingIndex === p.index ? "讲解中…" : "看讲解"}
                  </Button>
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

              {viewLens === "explain" &&
              extractions.some((item) => item.paragraphIndex === p.index) ? (
                <ul className="para-gloss" data-deliver="explain">
                  {extractions
                    .filter((item) => item.paragraphIndex === p.index)
                    .map((item) => (
                      <li key={item.id}>
                        <Badge variant={item.kind === "phrase" ? "secondary" : "default"}>
                          {item.kind === "phrase" ? "短语" : "生词"}
                        </Badge>
                        <b>{item.text}</b>
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
              回文章库
            </Button>
            <Button onClick={() => setRoute("drill")}>
              去出题
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {extractions.length > 0 ? (
        <aside className="mt-8 rounded-2xl border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            短语和生词
            <Badge variant="secondary">{extractions.length}</Badge>
          </h2>
          <ul className="divide-y">
            {extractions.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                <Badge variant={item.kind === "phrase" ? "secondary" : "default"} className="mt-0.5">
                  {item.kind === "phrase" ? "短语" : "生词"}
                </Badge>
                <div className="min-w-0 text-sm">
                  <b className="font-display text-base font-semibold">{item.text}</b>
                  <span className="ml-2 text-muted-foreground">{item.gloss}</span>
                  {item.sentence ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.sentence}</p>
                  ) : null}
                </div>
                <SaveWordButton text={item.text} gloss={item.gloss} sentence={item.sentence} source="explain" className="ml-auto" />
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}
