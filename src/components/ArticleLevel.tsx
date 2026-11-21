"use client";

import { useState } from "react";
import { ChevronDown, Highlighter, Star } from "lucide-react";
import { GlossableText } from "@/components/HoverWord";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveWordButton } from "@/components/SaveWordButton";
import type { Analysis, Band } from "@/lib/glossary/level";
import { useVocab } from "@/lib/store/vocab";
import { levelLabel, useLevel } from "@/lib/store/level";
import { useWorkspace } from "@/lib/store/workspace";
import { cn } from "@/lib/utils";

const BAND: Record<Band, { label: string; tone: string }> = {
  easy: { label: "很轻松", tone: "bg-emerald-50 text-emerald-800" },
  fit: { label: "刚刚好", tone: "bg-accent text-accent-foreground" },
  stretch: { label: "有点挑战", tone: "bg-amber-100 text-amber-900" },
  hard: { label: "偏难", tone: "bg-red-50 text-red-800" },
};

export function ArticleLevel({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const highlight = useLevel((s) => s.highlight);
  const setHighlight = useLevel((s) => s.setHighlight);
  const keys = useVocab((s) => s.keys);
  const setRoute = useWorkspace((s) => s.setRoute);
  const band = BAND[analysis.band];
  const percent = Math.round(analysis.coverage * 100);
  const unsaved = analysis.hard.filter((w) => !keys.has(w.lemma.toLowerCase()));

  async function saveAll() {
    setSaving(true);
    const articleId = useWorkspace.getState().article?.id ?? null;
    for (const word of unsaved) {
      await useVocab.getState().save({
        text: word.lemma,
        gloss: word.gloss,
        phonetic: word.phonetic,
        sentence: word.sentence,
        source: "preview",
        articleId,
      });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold", band.tone)}>
          难度 {band.label}
        </span>
        <span className="text-muted-foreground">
          {percent}% 的词在「{levelLabel(analysis.level)}」水平内 · 生词 {analysis.hard.length} 个
        </span>
        <button
          type="button"
          onClick={() => setRoute("settings")}
          className="text-xs font-semibold text-primary hover:underline"
        >
          修改水平
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={highlight}
          onClick={() => setHighlight(!highlight)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors",
            highlight ? "border-amber-300 bg-amber-50 text-amber-900" : "bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          <Highlighter className="size-4" aria-hidden />
          标出生词
        </button>
        {analysis.hard.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            生词预览({analysis.hard.length})
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="rounded-2xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">按出现次数排序,读之前先扫一眼。</p>
            <Button size="sm" variant="secondary" disabled={saving || unsaved.length === 0} onClick={() => void saveAll()}>
              <Star aria-hidden />
              {unsaved.length === 0 ? "已全部收藏" : saving ? "收藏中…" : `全部收藏(${unsaved.length})`}
            </Button>
          </div>
          <ul className="max-h-80 divide-y overflow-auto">
            {analysis.hard.map((w) => (
              <li key={w.lemma} className="gloss-frame flex items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="font-display text-base font-semibold">
                      <GlossableText text={w.lemma} />
                    </b>
                    {w.phonetic ? <span className="text-xs text-primary">{w.phonetic}</span> : null}
                    <Badge variant="outline">{w.level}</Badge>
                    {w.count > 1 ? <span className="text-xs text-muted-foreground">出现 {w.count} 次</span> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{w.gloss || "(词典暂无释义)"}</p>
                  {w.sentence ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      <GlossableText text={w.sentence} />
                    </p>
                  ) : null}
                </div>
                <SaveWordButton
                  text={w.lemma}
                  gloss={w.gloss}
                  phonetic={w.phonetic}
                  sentence={w.sentence}
                  source="preview"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
