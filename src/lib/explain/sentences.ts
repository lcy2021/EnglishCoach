/** Display line: English always from the source paragraph; Chinese optional. */
export interface SentenceLine {
  en: string;
  zh: string | null;
}

/** @deprecated kept for parse helpers that still build en+zh before encoding */
export interface SentencePair {
  en: string;
  zh: string;
}

interface StoredZhLines {
  v: 1;
  /** Chinese only — English is always taken from paragraph.text */
  zh: string[];
}

interface LegacyStoredPairs {
  v: 1;
  pairs: SentencePair[];
}

/** Split English on . ? ! while keeping the trailing mark with the sentence. */
export function splitEnglishSentences(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?]+(?:[.!?]+["']?|(?=$))/g);
  const sentences = (parts ?? [trimmed])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return sentences.length > 0 ? sentences : [trimmed];
}

/** Split Chinese on 。！？ and Latin terminals. */
export function splitChineseSentences(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^。！？!?]+(?:[。！？!?]+|(?=$))/g);
  const sentences = (parts ?? [trimmed])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return sentences.length > 0 ? sentences : [trimmed];
}

/** Persist Chinese lines only (aligned to splitEnglishSentences order). */
export function encodeZhLines(zhLines: string[]): string {
  const zh = zhLines.map((item) => item.trim()).filter(Boolean);
  const payload: StoredZhLines = { v: 1, zh };
  return JSON.stringify(payload);
}

/** @deprecated use encodeZhLines */
export function encodeSentencePairs(pairs: SentencePair[]): string {
  return encodeZhLines(pairs.map((pair) => pair.zh));
}

function tryDecodeZhLines(raw: string, expectCount: number): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<StoredZhLines & LegacyStoredPairs>;
    if (parsed?.v !== 1) return null;

    if (Array.isArray(parsed.zh) && parsed.zh.every((item) => typeof item === "string")) {
      return alignZhCount(
        parsed.zh.map((item) => item.trim()).filter(Boolean),
        expectCount,
      );
    }

    if (Array.isArray(parsed.pairs)) {
      const fromPairs = parsed.pairs
        .map((item) => (item && typeof item.zh === "string" ? item.zh.trim() : ""))
        .filter(Boolean);
      return alignZhCount(fromPairs, expectCount);
    }
    return null;
  } catch {
    return null;
  }
}

function alignZhCount(zhLines: string[], expectCount: number): string[] {
  if (expectCount <= 0) return zhLines;
  if (zhLines.length === expectCount) return zhLines;
  if (zhLines.length > expectCount) return zhLines.slice(0, expectCount);
  // Fewer Chinese lines than English: pad empty so indexes stay stable.
  return [...zhLines, ...Array.from({ length: expectCount - zhLines.length }, () => "")];
}

/**
 * English lines always from paragraph.text; Chinese filled from stored zh when present.
 * This keeps English DOM stable — only .zh nodes mount after explain.
 */
export function linesFromParagraph(
  english: string,
  zh: string | null | undefined,
): SentenceLine[] {
  const ens = splitEnglishSentences(english);
  if (ens.length === 0) return [];

  if (!zh?.trim()) {
    return ens.map((en) => ({ en, zh: null }));
  }

  const decoded = tryDecodeZhLines(zh, ens.length);
  if (decoded) {
    return ens.map((en, index) => ({
      en,
      zh: decoded[index]?.trim() ? decoded[index]! : null,
    }));
  }

  // Legacy plain Chinese block.
  const zhSentences = splitChineseSentences(zh);
  if (zhSentences.length === ens.length) {
    return ens.map((en, index) => ({ en, zh: zhSentences[index]! }));
  }
  if (ens.length === 1) {
    return [{ en: ens[0]!, zh: zh.trim() }];
  }
  // Can't align: put whole Chinese under the last sentence only.
  return ens.map((en, index) => ({
    en,
    zh: index === ens.length - 1 ? zh.trim() : null,
  }));
}

/** @deprecated prefer linesFromParagraph */
export function pairsFromParagraph(
  english: string,
  zh: string | null | undefined,
): SentencePair[] | null {
  const lines = linesFromParagraph(english, zh);
  if (!lines.some((line) => line.zh)) return null;
  return lines
    .filter((line): line is SentenceLine & { zh: string } => Boolean(line.zh))
    .map((line) => ({ en: line.en, zh: line.zh }));
}

/** Flatten Chinese sides for TextThrow matching. */
export function joinZhLines(lines: SentenceLine[]): string {
  return lines.map((line) => line.zh ?? "").join("");
}

/** @deprecated */
export function joinPairZh(pairs: SentencePair[]): string {
  return pairs.map((pair) => pair.zh).join("");
}

/** Align model output Chinese to our English sentence list (ignore model en copies). */
export function alignSentencePairs(
  englishSentences: string[],
  modelPairs: Array<{ en?: string; zh?: string }>,
): SentencePair[] {
  return englishSentences.map((en, index) => {
    const row = modelPairs[index];
    const zh = typeof row?.zh === "string" && row.zh.trim() ? row.zh.trim() : "";
    return { en, zh: zh || "（暂无译文）" };
  });
}
