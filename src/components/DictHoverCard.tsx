"use client";

import { useLayoutEffect, useRef } from "react";
import { Star, Volume2 } from "lucide-react";
import { speak } from "@/lib/speech";
import { sentenceAround, useVocab } from "@/lib/store/vocab";
import { useWorkspace } from "@/lib/store/workspace";

export interface DictHoverSense {
  pos: string;
  text: string;
}

export interface DictHoverForm {
  label: string;
  text: string;
}

/** Full dictionary payload shown in the shared hover tip (article, drill, vocab, …). */
export interface DictHoverData {
  phrase: string;
  phonetic: string;
  gloss: string;
  senses: DictHoverSense[];
  forms: DictHoverForm[];
  lemma?: string;
}

/**
 * Unified ECDICT hover card: headword, phonetic, every sense with POS,
 * every dictionary inflection, and save-to-word-book.
 */
export function DictHoverCard({
  data,
  paragraph,
  className = "tip",
}: {
  data: DictHoverData;
  /** Surrounding English used when starring the word. */
  paragraph: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const word = data.phrase || data.gloss;
  const saved = useVocab((s) => s.keys.has(word.trim().toLowerCase()));
  const saveWord = useVocab((s) => s.save);
  const senses =
    data.senses.length > 0 ? data.senses : [{ pos: "", text: data.gloss || "未收录" }];
  const lemma =
    data.lemma && data.lemma.toLowerCase() !== word.trim().toLowerCase() ? data.lemma : "";

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const frame =
      tip.closest(".gloss-frame, .prose, .sheet, .stage")?.getBoundingClientRect() ??
      new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const pad = 10;
    const maxWidth = Math.min(360, Math.max(180, frame.width - pad * 2));
    tip.style.maxWidth = `${Math.round(maxWidth)}px`;
    tip.classList.remove("tip-below");
    tip.style.setProperty("--tip-shift", "0px");

    const clipTop = Math.max(frame.top, pad);
    let bounds = tip.getBoundingClientRect();
    if (bounds.top < clipTop) {
      tip.classList.add("tip-below");
      bounds = tip.getBoundingClientRect();
    }

    const minLeft = frame.left + pad;
    const maxRight = frame.right - pad;
    let shift = 0;
    if (bounds.right > maxRight) shift -= bounds.right - maxRight;
    if (bounds.left + shift < minLeft) shift += minLeft - (bounds.left + shift);
    tip.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
  }, [data]);

  return (
    <span ref={ref} className={className} role="tooltip">
      <span className="tip-head">
        <span className="tip-word">{word}</span>
        {data.phonetic ? <span className="tip-phonetic">{data.phonetic}</span> : null}
        {word ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`朗读 ${word}`}
            title="朗读"
            onClick={(event) => {
              event.stopPropagation();
              speak(word);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") event.currentTarget.click();
            }}
            className="ml-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-primary"
          >
            <Volume2 className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </span>
      {lemma ? <span className="tip-lemma">原形 {lemma}</span> : null}

      <span className="tip-senses">
        {senses.map((sense, index) => (
          <span key={`${sense.pos}-${index}`} className={sense.pos ? "tip-sense" : "tip-sense bare"}>
            {sense.pos ? <span className="tip-pos">{sense.pos}</span> : null}
            <span className="tip-def">{sense.text}</span>
          </span>
        ))}
      </span>

      {data.forms.length > 0 ? (
        <span className="tip-forms">
          {data.forms.map((form) => (
            <span key={`${form.label}-${form.text}`} className="tip-form">
              <span className="tip-form-label">{form.label}</span>
              <span className="tip-form-text">{form.text}</span>
            </span>
          ))}
        </span>
      ) : null}

      <span
        role="button"
        tabIndex={0}
        aria-pressed={saved}
        onClick={(event) => {
          event.stopPropagation();
          if (saved) return;
          const gloss =
            data.senses.length > 0
              ? data.senses.map((sense) => `${sense.pos} ${sense.text}`.trim()).join("; ")
              : data.gloss;
          const pos = [
            ...new Set(data.senses.map((sense) => sense.pos.trim()).filter(Boolean)),
          ].join(" · ");
          void saveWord({
            text: word,
            gloss,
            phonetic: data.phonetic,
            pos: pos || undefined,
            forms: data.forms.length > 0 ? data.forms : undefined,
            sentence: sentenceAround(paragraph, word),
            source: "hover",
            articleId: useWorkspace.getState().article?.id ?? null,
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") event.currentTarget.click();
        }}
        className={`mt-2 inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
          saved ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground hover:bg-amber-100 hover:text-amber-700"
        }`}
      >
        <Star className={`size-3.5 ${saved ? "fill-current" : ""}`} aria-hidden />
        {saved ? "已收藏" : "收藏到生词本"}
      </span>
    </span>
  );
}
