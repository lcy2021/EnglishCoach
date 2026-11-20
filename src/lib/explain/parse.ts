import {
  alignSentencePairs,
  encodeZhLines,
  splitEnglishSentences,
  type SentencePair,
} from "@/lib/explain/sentences";

export interface ExplainNote {
  text: string;
  gloss: string;
  sentence: string;
}

export interface ExplainPayload {
  /** Encoded sentence pairs stored in paragraph.zh */
  zh: string;
  pairs: SentencePair[];
  phrases: ExplainNote[];
  words: ExplainNote[];
}

const NOTE_CAP = 4;

function asNote(value: unknown): ExplainNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.trim() : "";
  const gloss = typeof row.gloss === "string" ? row.gloss.trim() : "";
  if (!text || !gloss) return null;
  const sentence = typeof row.sentence === "string" ? row.sentence.trim() : "";
  return { text, gloss, sentence };
}

function asPair(value: unknown): { en?: string; zh: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const zh = typeof row.zh === "string" ? row.zh.trim() : "";
  if (!zh) return null;
  const en = typeof row.en === "string" ? row.en.trim() : undefined;
  return { en, zh };
}

/**
 * Pull sentence-aligned Chinese + notes out of a model reply.
 * `english` is the source paragraph (or pre-split sentences) used to lock order.
 */
export function parseExplainPayload(raw: string, english: string): ExplainPayload {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("讲解没有返回可用的内容");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("讲解没有返回可用的内容");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("讲解没有返回可用的内容");
  }
  const body = parsed as Record<string, unknown>;
  const englishSentences = splitEnglishSentences(english);

  let pairs: SentencePair[] = [];
  if (Array.isArray(body.sentences) && body.sentences.length > 0) {
    const modelPairs = body.sentences
      .map(asPair)
      .filter((item): item is { en?: string; zh: string } => item !== null);
    pairs = alignSentencePairs(englishSentences, modelPairs);
  } else if (typeof body.zh === "string" && body.zh.trim()) {
    // Legacy whole-block zh: keep as one pair so older replies still work.
    pairs = [{ en: english.trim(), zh: body.zh.trim() }];
  }

  if (pairs.length === 0 || pairs.every((pair) => !pair.zh || pair.zh === "（暂无译文）")) {
    throw new Error("讲解没有写出中文");
  }

  const phrases = Array.isArray(body.phrases)
    ? body.phrases
        .map(asNote)
        .filter((item): item is ExplainNote => item !== null)
        .slice(0, NOTE_CAP)
    : [];
  const words = Array.isArray(body.words)
    ? body.words
        .map(asNote)
        .filter((item): item is ExplainNote => item !== null)
        .slice(0, NOTE_CAP)
    : [];

  return {
    // Store Chinese only — the reader always renders English from paragraph.text.
    zh: encodeZhLines(pairs.map((pair) => pair.zh)),
    pairs,
    phrases,
    words,
  };
}
