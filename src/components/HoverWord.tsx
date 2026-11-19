"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Star, Volume2 } from "lucide-react";
import { speak } from "@/lib/speech";
import { sentenceAround, useVocab } from "@/lib/store/vocab";
import { normalizeToken } from "@/lib/glossary/match";
import { useWorkspace } from "@/lib/store/workspace";

interface GlossSense {
  pos: string;
  text: string;
}

interface GlossHit {
  phrase: string;
  gloss: string;
  phonetic: string;
  senses: GlossSense[];
  start: number;
  end: number;
}

interface Part {
  text: string;
  wordIndex: number | null;
}

const HOVER_DELAY_MS = 90;

export function splitForGloss(text: string): Part[] {
  const parts: Part[] = [];
  let wordIndex = 0;
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue;
    if (/^\s+$/.test(token) || !/\p{L}/u.test(token)) {
      parts.push({ text: token, wordIndex: null });
      continue;
    }
    parts.push({ text: token, wordIndex });
    wordIndex += 1;
  }
  return parts;
}

function GlossTip({ hit, paragraph }: { hit: GlossHit; paragraph: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const word = hit.phrase || hit.gloss;
  const saved = useVocab((s) => s.keys.has(word.trim().toLowerCase()));
  const saveWord = useVocab((s) => s.save);
  const senses =
    hit.senses.length > 0 ? hit.senses : [{ pos: "", text: hit.gloss || "未收录" }];

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const frame = tip.closest(".prose")?.getBoundingClientRect();
    const pad = 10;
    const maxWidth = Math.min(320, Math.max(160, (frame?.width ?? 320) - pad * 2));
    tip.style.maxWidth = `${Math.round(maxWidth)}px`;
    tip.style.setProperty("--tip-shift", "0px");
    const bounds = tip.getBoundingClientRect();
    const minLeft = (frame?.left ?? pad) + pad;
    const maxRight = (frame?.right ?? window.innerWidth - pad) - pad;
    let shift = 0;
    if (bounds.right > maxRight) shift -= bounds.right - maxRight;
    if (bounds.left + shift < minLeft) shift += minLeft - (bounds.left + shift);
    tip.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
  }, [hit]);

  return (
    <span ref={ref} className="tip" role="tooltip">
      <span className="tip-head">
        <span className="tip-word">{hit.phrase || hit.gloss}</span>
        {hit.phonetic ? <span className="tip-phonetic">{hit.phonetic}</span> : null}
        {hit.phrase ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`朗读 ${hit.phrase}`}
            title="朗读"
            onClick={(event) => {
              event.stopPropagation();
              speak(hit.phrase);
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
      <span className="tip-senses">
        {senses.map((sense, index) => (
          <span key={`${sense.pos}-${index}`} className={sense.pos ? "tip-sense" : "tip-sense bare"}>
            {sense.pos ? <span className="tip-pos">{sense.pos}</span> : null}
            <span className="tip-def">{sense.text}</span>
          </span>
        ))}
      </span>
      <span
        role="button"
        tabIndex={0}
        aria-pressed={saved}
        onClick={(event) => {
          event.stopPropagation();
          if (saved) return;
          const gloss =
            hit.senses.length > 0
              ? hit.senses.map((sense) => `${sense.pos} ${sense.text}`.trim()).join("; ")
              : hit.gloss;
          void saveWord({
            text: word,
            gloss,
            phonetic: hit.phonetic,
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

function wordTokens(text: string): string[] {
  return splitForGloss(text)
    .filter((part) => part.wordIndex !== null)
    .map((part) => part.text);
}

export function GlossableText({ text, marks }: { text: string; marks?: ReadonlySet<string> }) {
  const parts = splitForGloss(text);
  const savedWords = useVocab((s) => s.keys);
  const [hover, setHover] = useState<number | null>(null);
  const [hit, setHit] = useState<GlossHit | null>(null);
  // Leaving gets a short grace period so the pointer can travel from the word into its tip.
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelLeave = () => clearTimeout(leaveTimer.current);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (hover === null) return;
    if (hit && hover >= hit.start && hover <= hit.end) return;

    let cancelled = false;
    const tokens = wordTokens(text);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/define", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens, index: hover }),
        });
        const data = (await res.json()) as Partial<GlossHit>;
        if (cancelled) return;
        setHit({
          phrase: data.phrase ?? tokens[hover] ?? "",
          gloss: data.gloss ?? "未收录",
          phonetic: data.phonetic ?? "",
          senses: Array.isArray(data.senses) ? data.senses : [],
          start: data.start ?? hover,
          end: data.end ?? hover,
        });
      } catch {
        if (!cancelled) {
          setHit({
            phrase: tokens[hover] ?? "",
            gloss: "查词失败",
            phonetic: "",
            senses: [],
            start: hover,
            end: hover,
          });
        }
      }
    }, HOVER_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hover, hit, text]);

  return (
    <span
      onMouseEnter={cancelLeave}
      onMouseLeave={() => {
        cancelLeave();
        leaveTimer.current = setTimeout(() => {
          setHover(null);
          setHit(null);
        }, 260);
      }}
    >
      {parts.map((part, index) => {
        if (part.wordIndex === null) {
          return <span key={index}>{part.text}</span>;
        }
        const covered =
          hover !== null &&
          hit !== null &&
          part.wordIndex >= hit.start &&
          part.wordIndex <= hit.end;
        const showTip = hover === part.wordIndex && hit !== null;
        return (
          <span
            key={index}
            className={[
              "word",
              covered ? "hit" : "",
              marks?.has(normalizeToken(part.text)) ? "hard" : "",
              savedWords.has(normalizeToken(part.text)) ? "saved" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => {
              cancelLeave();
              const next = part.wordIndex;
              if (next === null) return;
              setHover(next);
              setHit((current) =>
                current && next >= current.start && next <= current.end ? current : null,
              );
            }}
          >
            {part.text}
            {showTip ? <GlossTip hit={hit} paragraph={text} /> : null}
          </span>
        );
      })}
    </span>
  );
}
