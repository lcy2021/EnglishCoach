"use client";

import { useEffect, useRef, useState } from "react";
import { DictHoverCard, type DictHoverData } from "@/components/DictHoverCard";
import { normalizeToken } from "@/lib/glossary/match";
import { useVocab } from "@/lib/store/vocab";

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

function wordTokens(text: string): string[] {
  return splitForGloss(text)
    .filter((part) => part.wordIndex !== null)
    .map((part) => part.text);
}

function emptyHit(phrase: string, gloss: string, index: number): DictHoverData & { start: number; end: number } {
  return {
    phrase,
    gloss,
    phonetic: "",
    senses: gloss ? [{ pos: "", text: gloss }] : [],
    forms: [],
    lemma: phrase,
    start: index,
    end: index,
  };
}

/**
 * Wrap English text so each word can open the shared dictionary hover card.
 * Used on article, drill, vocab sentences, wrong-book, etc.
 */
export function GlossableText({ text, marks }: { text: string; marks?: ReadonlySet<string> }) {
  const parts = splitForGloss(text);
  const savedWords = useVocab((s) => s.keys);
  const [hover, setHover] = useState<number | null>(null);
  const [hit, setHit] = useState<(DictHoverData & { start: number; end: number }) | null>(null);
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
        const data = (await res.json()) as Partial<DictHoverData> & {
          start?: number;
          end?: number;
        };
        if (cancelled) return;
        setHit({
          phrase: data.phrase ?? tokens[hover] ?? "",
          gloss: data.gloss ?? "未收录",
          phonetic: data.phonetic ?? "",
          senses: Array.isArray(data.senses) ? data.senses : [],
          forms: Array.isArray(data.forms) ? data.forms : [],
          lemma: data.lemma ?? data.phrase ?? tokens[hover] ?? "",
          start: data.start ?? hover,
          end: data.end ?? hover,
        });
      } catch {
        if (!cancelled) setHit(emptyHit(tokens[hover] ?? "", "查词失败", hover));
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
            {showTip ? <DictHoverCard data={hit} paragraph={text} /> : null}
          </span>
        );
      })}
    </span>
  );
}

export { DictHoverCard } from "@/components/DictHoverCard";
export type { DictHoverData, DictHoverForm, DictHoverSense } from "@/components/DictHoverCard";
