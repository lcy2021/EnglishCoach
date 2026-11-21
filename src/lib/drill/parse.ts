import type { WordForm } from "@/lib/glossary/match";

export const DRILL_LEVELS = ["入门", "进阶", "较难"] as const;

export type DrillLevel = (typeof DRILL_LEVELS)[number];

export type { WordForm };

export interface DrillLexItem {
  kind: "phrase" | "word";
  text: string;
  gloss: string;
  /** Chinese part-of-speech label, filled from ECDICT when available. */
  pos?: string;
  phonetic?: string;
  /** Tense / number / degree variants (过去式, 复数, …). */
  forms?: WordForm[];
}

export interface DrillPrompt {
  zh: string;
  words: string[];
  end: "." | "?" | "!";
  /** Key phrases and words for the sentence, shown under the blanks. */
  lex: DrillLexItem[];
}

/** Word-count band and the instruction the model sees for that band. */
export function drillLevelSpec(level: string): { level: DrillLevel; min: number; max: number; note: string } {
  const name: DrillLevel = (DRILL_LEVELS as readonly string[]).includes(level)
    ? (level as DrillLevel)
    : "进阶";
  if (name === "入门") {
    return { level: name, min: 5, max: 8, note: "Everyday words only. One simple clause." };
  }
  if (name === "较难") {
    return {
      level: name,
      min: 12,
      max: 16,
      note: "Precise field wording and one subordinate clause.",
    };
  }
  return { level: name, min: 8, max: 12, note: "One or two field terms. Still one sentence." };
}

export type SlotStatus = "correct" | "close" | "wrong";

export interface SlotGrade {
  status: SlotStatus;
  expected: string;
}

export interface SavedDrill {
  id: string;
  industry: string;
  difficulty: DrillLevel;
  zh: string;
  words: string[];
  end: "." | "?" | "!";
  lex: DrillLexItem[];
  attempt: string[] | null;
  grades: SlotGrade[] | null;
  summary: string;
  createdAt: string;
}

export interface DrillListItem {
  id: string;
  industry: string;
  difficulty: DrillLevel;
  zh: string;
  createdAt: string;
  graded: boolean;
}

const WORD_MIN = 4;
const WORD_MAX = 16;

/** Compare spellings without case or edge punctuation. Apostrophes stay. */
export function normalizeWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
}

function readJson(raw: string): Record<string, unknown> {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("出题没有返回可用的内容");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("出题没有返回可用的内容");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("出题没有返回可用的内容");
  return parsed as Record<string, unknown>;
}

function readForms(value: unknown): WordForm[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const forms: WordForm[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const label =
      typeof (row as { label?: unknown }).label === "string" ? (row as { label: string }).label.trim() : "";
    const text =
      typeof (row as { text?: unknown }).text === "string" ? (row as { text: string }).text.trim() : "";
    if (!label || !text) continue;
    const key = `${label}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push({ label, text });
  }
  return forms.length > 0 ? forms : undefined;
}

function readLexList(value: unknown, kind: DrillLexItem["kind"], limit: number): DrillLexItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: DrillLexItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const text = typeof (row as { text?: unknown }).text === "string" ? (row as { text: string }).text.trim() : "";
    const gloss =
      typeof (row as { gloss?: unknown }).gloss === "string" ? (row as { gloss: string }).gloss.trim() : "";
    if (!text || !gloss) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pos =
      typeof (row as { pos?: unknown }).pos === "string" ? (row as { pos: string }).pos.trim() : "";
    const phonetic =
      typeof (row as { phonetic?: unknown }).phonetic === "string"
        ? (row as { phonetic: string }).phonetic.trim()
        : "";
    const forms = readForms((row as { forms?: unknown }).forms);
    items.push({
      kind,
      text,
      gloss,
      ...(pos ? { pos } : {}),
      ...(phonetic ? { phonetic } : {}),
      ...(forms ? { forms } : {}),
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Pull one Chinese sentence and the English word list out of a model reply. */
export function parseDrillPrompt(raw: string): DrillPrompt {
  const body = readJson(raw);
  const zh = typeof body.zh === "string" ? body.zh.trim() : "";
  const words = Array.isArray(body.words)
    ? body.words
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => normalizeWord(item).length > 0)
    : [];
  if (!zh) throw new Error("出题没有写出中文");
  if (words.length < WORD_MIN || words.length > WORD_MAX) {
    throw new Error("出题的词数不合适");
  }
  const end = body.end === "?" || body.end === "!" ? body.end : ".";
  const phrases = readLexList(body.phrases, "phrase", 4);
  const vocab = readLexList(body.vocab, "word", 6);
  // Prefer phrases first, then words; drop word rows that duplicate a phrase.
  const phraseKeys = new Set(phrases.map((item) => item.text.toLowerCase()));
  const lex = [...phrases, ...vocab.filter((item) => !phraseKeys.has(item.text.toLowerCase()))];
  return { zh, words, end, lex };
}

/** Mark each blank against the reference. Same word is correct; anything else is wrong. */
export function gradeLocally(expected: string[], attempt: string[]): SlotGrade[] {
  return expected.map((word, index) => ({
    status: normalizeWord(attempt[index] ?? "") === normalizeWord(word) ? "correct" : "wrong",
    expected: word,
  }));
}

/**
 * Let a model upgrade wrong blanks to correct or close.
 * A blank that already matches the reference stays correct.
 */
export function mergeGrades(local: SlotGrade[], model: SlotGrade[] | null): SlotGrade[] {
  if (!model || model.length !== local.length) return local;
  return local.map((slot, index) => {
    if (slot.status === "correct") return slot;
    const next = model[index];
    if (!next) return slot;
    if (next.status === "correct" || next.status === "close") {
      return { status: next.status, expected: slot.expected };
    }
    return slot;
  });
}

export function parseDrillGrade(
  raw: string,
  expected: string[],
): { slots: SlotGrade[]; summary: string } | null {
  let body: Record<string, unknown>;
  try {
    body = readJson(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(body.slots) || body.slots.length !== expected.length) return null;
  const slots: SlotGrade[] = [];
  for (let index = 0; index < expected.length; index += 1) {
    const row = body.slots[index];
    const status =
      row && typeof row === "object" && "status" in row
        ? (row as { status?: unknown }).status
        : null;
    if (status !== "correct" && status !== "close" && status !== "wrong") return null;
    slots.push({ status, expected: expected[index] ?? "" });
  }
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  return { slots, summary };
}

export function gradeSummary(slots: SlotGrade[], modelSummary: string): string {
  const missed = slots.filter((slot) => slot.status === "wrong").length;
  const close = slots.filter((slot) => slot.status === "close").length;
  if (missed === 0 && close === 0) return "每个词都对。";
  const trimmed = modelSummary.trim();
  if (trimmed) return trimmed;
  if (missed === 0) return `有 ${close} 个词可以，参考答案写在下面。`;
  return `有 ${missed} 个词需要改。`;
}
