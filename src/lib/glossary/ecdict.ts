import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  collectParagraphGlosses,
  matchAt,
  type DictEntry,
  type GlossMatch,
  type ParagraphGloss,
} from "@/lib/glossary/match";

interface StarDictRow {
  word: string;
  sw?: string;
  phonetic: string | null;
  translation: string | null;
  pos: string | null;
  exchange: string | null;
  collins: number | null;
  oxford: number | null;
  tag: string | null;
  frq: number | null;
}

const QUERY_CHUNK = 200;

let database: Database.Database | null = null;
let strippedWordColumn: boolean | null = null;

/** Alphanumeric key used by ECDICT's `sw` column. */
export function stripWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function ecdictPath(): string | null {
  const candidates = [
    process.env.ECDICT_PATH,
    path.join(process.cwd(), "data", "stardict.db"),
    path.join(process.cwd(), "data", "ecdict.db"),
  ].filter((item): item is string => Boolean(item));
  return candidates.find((item) => fs.existsSync(item)) ?? null;
}

export function ecdictReady(): boolean {
  return ecdictPath() !== null;
}

function getDict(): Database.Database {
  if (database) return database;
  const file = ecdictPath();
  if (!file) {
    throw new Error("ECDICT database not found. Run npm run dict:fetch");
  }
  database = new Database(file, { readonly: true, fileMustExist: true });
  const columns = database.prepare(`PRAGMA table_info(stardict)`).all() as { name: string }[];
  strippedWordColumn = columns.some((column) => column.name === "sw");
  return database;
}

function toEntry(row: StarDictRow): DictEntry {
  return {
    word: row.word,
    phonetic: row.phonetic ?? "",
    translation: row.translation ?? "",
    pos: row.pos ?? "",
    exchange: row.exchange ?? "",
    collins: row.collins ?? 0,
    oxford: row.oxford ?? 0,
    tag: row.tag ?? "",
    frq: row.frq ?? 0,
  };
}

function pickByStrippedWord(phrase: string, options: StarDictRow[]): StarDictRow | null {
  const target = stripWord(phrase);
  const pool = options.filter((row) => stripWord(row.word) === target);
  if (pool.length === 0) return null;
  const exact = pool.find((row) => row.word.toLowerCase() === phrase);
  if (exact) return exact;
  return [...pool].sort((a, b) => {
    const lengthDelta =
      Math.abs(a.word.length - phrase.length) - Math.abs(b.word.length - phrase.length);
    if (lengthDelta !== 0) return lengthDelta;
    return (b.collins ?? 0) - (a.collins ?? 0);
  })[0] ?? null;
}

/** Exact headword match, then `sw` fallback for hyphens and spacing. */
export function lookupEntries(phrases: string[]): Map<string, DictEntry> {
  const result = new Map<string, DictEntry>();
  const unique = [
    ...new Set(phrases.map((phrase) => phrase.trim().toLowerCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return result;

  const dict = getDict();
  for (let offset = 0; offset < unique.length; offset += QUERY_CHUNK) {
    const chunk = unique.slice(offset, offset + QUERY_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = dict
      .prepare(
        `SELECT word, phonetic, translation, pos, exchange, collins, oxford, tag, frq
         FROM stardict WHERE word IN (${placeholders})`,
      )
      .all(...chunk) as StarDictRow[];

    const byWord = new Map(rows.map((row) => [row.word.toLowerCase(), row]));
    const missing: string[] = [];
    for (const phrase of chunk) {
      const row = byWord.get(phrase);
      if (row) result.set(phrase, toEntry(row));
      else missing.push(phrase);
    }
    const swMissing = missing.filter((phrase) => !phrase.includes(" "));
    if (swMissing.length === 0 || !strippedWordColumn) continue;

    const swValues = [...new Set(swMissing.map(stripWord).filter(Boolean))];
    if (swValues.length === 0) continue;
    const swPlaceholders = swValues.map(() => "?").join(",");
    const swRows = dict
      .prepare(
        `SELECT word, sw, phonetic, translation, pos, exchange, collins, oxford, tag, frq
         FROM stardict WHERE sw IN (${swPlaceholders})`,
      )
      .all(...swValues) as StarDictRow[];

    const bySw = new Map<string, StarDictRow[]>();
    for (const row of swRows) {
      const key = (row.sw || stripWord(row.word)).toLowerCase();
      const list = bySw.get(key) ?? [];
      list.push(row);
      bySw.set(key, list);
    }
    for (const phrase of swMissing) {
      const row = pickByStrippedWord(phrase, bySw.get(stripWord(phrase)) ?? []);
      if (row) result.set(phrase, toEntry(row));
    }
  }

  return result;
}

export function defineTokens(tokens: string[], index: number): GlossMatch | null {
  return matchAt(tokens, index, lookupEntries);
}

export function glossParagraph(tokens: string[]): ParagraphGloss[] {
  return collectParagraphGlosses(tokens, lookupEntries);
}
