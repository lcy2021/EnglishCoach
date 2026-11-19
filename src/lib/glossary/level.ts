/** Rate how hard an article is for a learner, using ECDICT's exam tags and frequency rank. Pure: the dictionary is injected. */

import {
  formatPhonetic,
  lemmaFromExchange,
  parseSenses,
  type DictEntry,
  type DictLookup,
} from "./match.ts";

/** 1 = middle school ... 7 = GRE. A word's rank is the first exam level that teaches it. */
export const TAG_RANK: Record<string, number> = {
  zk: 1,
  gk: 2,
  cet4: 3,
  cet6: 4,
  ky: 5,
  toefl: 6,
  ielts: 6,
  gre: 7,
};

export const TAG_LABEL: Record<number, string> = {
  1: "初中",
  2: "高中",
  3: "四级",
  4: "六级",
  5: "考研",
  6: "雅思/托福",
  7: "GRE",
  8: "超纲/罕见",
};

/** Words with no exam tag fall back to how common they are in modern English (smaller frq = more common). */
function frqRank(frq: number): number {
  if (frq <= 0) return 8;
  if (frq <= 1500) return 1;
  if (frq <= 3500) return 2;
  if (frq <= 6000) return 3;
  if (frq <= 9000) return 4;
  if (frq <= 14000) return 5;
  if (frq <= 25000) return 6;
  return 7;
}

export function entryRank(entry: DictEntry): number {
  const ranks = entry.tag
    .split(/\s+/)
    .map((tag) => TAG_RANK[tag])
    .filter((rank): rank is number => typeof rank === "number");
  if (ranks.length > 0) return Math.min(...ranks);
  return frqRank(entry.frq);
}

export type Band = "easy" | "fit" | "stretch" | "hard";

export function bandOf(coverage: number): Band {
  if (coverage >= 0.98) return "easy";
  if (coverage >= 0.95) return "fit";
  if (coverage >= 0.9) return "stretch";
  return "hard";
}

export interface HardWord {
  /** Dictionary form, e.g. "neuron". */
  lemma: string;
  /** Spellings seen in the text, lower-cased. */
  forms: string[];
  count: number;
  rank: number;
  level: string;
  gloss: string;
  phonetic: string;
  sentence: string;
}

export interface Analysis {
  level: number;
  totalWords: number;
  knownWords: number;
  coverage: number;
  band: Band;
  hard: HardWord[];
  /** Every spelling to underline in the text. */
  hardForms: string[];
}

interface Occurrence {
  form: string;
  paragraph: number;
  surface: string;
}

const WORD_RE = /[A-Za-z](?:[A-Za-z'’-]*[A-Za-z])?/g;

/** Words worth rating: skips names mid-sentence, acronyms and numbers. */
export function extractOccurrences(paragraphs: string[]): Occurrence[] {
  const out: Occurrence[] = [];
  paragraphs.forEach((text, paragraph) => {
    for (const match of text.matchAll(WORD_RE)) {
      const surface = match[0];
      const index = match.index ?? 0;
      if (surface.length >= 2 && surface === surface.toUpperCase()) continue; // NASA, MIT
      if (/^[A-Z]/.test(surface)) {
        const before = text.slice(0, index).replace(/[\s"'“‘(\[]+$/u, "");
        if (before.length > 0 && !/[.!?:;]$/.test(before)) continue; // a name in mid-sentence
      }
      let form = surface.toLowerCase().replace(/’/g, "'");
      if (form.includes("'")) form = form.split("'")[0];
      if (form.length < 1) continue;
      out.push({ form, paragraph, surface });
    }
  });
  return out;
}

function sentenceWith(paragraph: string, surface: string): string {
  const needle = surface.toLowerCase();
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  return (sentences.find((s) => s.toLowerCase().includes(needle)) ?? paragraph).slice(0, 300);
}

function shortGloss(entry: DictEntry): string {
  const senses = parseSenses(entry.translation, entry.pos, entry.exchange, false);
  return senses
    .slice(0, 2)
    .map((sense) => (sense.pos ? `${sense.pos} ${sense.text}` : sense.text))
    .join("; ")
    .slice(0, 80);
}

export function analyzeParagraphs(paragraphs: string[], level: number, lookup: DictLookup): Analysis {
  const occurrences = extractOccurrences(paragraphs);
  const forms = [...new Set(occurrences.map((o) => o.form))];
  const entries = lookup(forms);

  const lemmaNames = new Set<string>();
  for (const form of forms) {
    const entry = entries.get(form);
    const lemma = entry ? lemmaFromExchange(entry.exchange) : null;
    if (lemma) lemmaNames.add(lemma);
  }
  const lemmaEntries = lemmaNames.size > 0 ? lookup([...lemmaNames]) : new Map<string, DictEntry>();

  const parts = new Set<string>();
  for (const form of forms) {
    if (!entries.has(form) && form.includes("-")) form.split("-").forEach((p) => p && parts.add(p));
  }
  const partEntries = parts.size > 0 ? lookup([...parts]) : new Map<string, DictEntry>();

  interface Rated {
    rank: number;
    lemma: string;
    entry: DictEntry | null;
  }
  const rated = new Map<string, Rated>();
  for (const form of forms) {
    const entry = entries.get(form) ?? null;
    if (entry) {
      const lemma = lemmaFromExchange(entry.exchange);
      const lemmaEntry = lemma ? (lemmaEntries.get(lemma) ?? null) : null;
      const rank = lemmaEntry ? Math.min(entryRank(entry), entryRank(lemmaEntry)) : entryRank(entry);
      rated.set(form, { rank, lemma: lemmaEntry ? lemma! : form, entry: lemmaEntry ?? entry });
      continue;
    }
    if (form.includes("-")) {
      const ranks = form
        .split("-")
        .filter(Boolean)
        .map((part) => {
          const found = partEntries.get(part);
          return found ? entryRank(found) : 8;
        });
      rated.set(form, { rank: Math.max(...ranks, 1), lemma: form, entry: null });
      continue;
    }
    rated.set(form, { rank: 8, lemma: form, entry: null });
  }

  let known = 0;
  const hardByLemma = new Map<string, HardWord>();
  const hardForms = new Set<string>();
  for (const occ of occurrences) {
    const info = rated.get(occ.form);
    if (!info) continue;
    if (info.rank <= level) {
      known += 1;
      continue;
    }
    hardForms.add(occ.form);
    let word = hardByLemma.get(info.lemma);
    if (!word) {
      word = {
        lemma: info.lemma,
        forms: [],
        count: 0,
        rank: info.rank,
        level: TAG_LABEL[info.rank] ?? "超纲/罕见",
        gloss: info.entry ? shortGloss(info.entry) : "",
        phonetic: info.entry ? formatPhonetic(info.entry.phonetic) : "",
        sentence: sentenceWith(paragraphs[occ.paragraph] ?? "", occ.surface),
      };
      hardByLemma.set(info.lemma, word);
    }
    word.count += 1;
    if (!word.forms.includes(occ.form)) word.forms.push(occ.form);
  }

  const total = occurrences.length;
  const coverage = total === 0 ? 1 : known / total;
  const hard = [...hardByLemma.values()].sort((a, b) => b.count - a.count || a.rank - b.rank).slice(0, 80);
  return {
    level,
    totalWords: total,
    knownWords: known,
    coverage,
    band: bandOf(coverage),
    hard,
    hardForms: [...hardForms],
  };
}
