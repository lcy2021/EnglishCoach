import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { DrillLevel, DrillLexItem, DrillListItem, SavedDrill, SlotGrade } from "@/lib/drill/parse";
import { drillLevelSpec } from "@/lib/drill/parse";
import type {
  Article,
  Extraction,
  ExtractionStatus,
  Paragraph,
  TranslationDraft,
  WrongBookItem,
} from "@/lib/types";

const globalForDb = globalThis as unknown as { __englishCoachDb?: Database.Database };

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "english-coach.sqlite");
}

const DEFAULT_DRILL_TAGS = [
  "生活用语",
  "职场",
  "旅行",
  "科技",
  "金融",
  "医疗",
  "教育",
  "初中",
  "高中",
  "四级",
  "六级",
  "考研",
] as const;

function ensureDrillTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS drills (
      id TEXT PRIMARY KEY,
      industry TEXT NOT NULL,
      zh TEXT NOT NULL,
      words_json TEXT NOT NULL,
      end_mark TEXT NOT NULL,
      attempt_json TEXT,
      grades_json TEXT,
      summary TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '进阶',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drill_tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare(`PRAGMA table_info(drills)`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "difficulty")) {
    db.exec(`ALTER TABLE drills ADD COLUMN difficulty TEXT NOT NULL DEFAULT '进阶'`);
  }
  if (!columns.some((column) => column.name === "lex_json")) {
    db.exec(`ALTER TABLE drills ADD COLUMN lex_json TEXT NOT NULL DEFAULT '[]'`);
  }
  const tagCount = db.prepare(`SELECT COUNT(*) AS count FROM drill_tags`).get() as { count: number };
  if (tagCount.count === 0) {
    const insert = db.prepare(
      `INSERT INTO drill_tags (id, label, created_at) VALUES (?, ?, ?)`,
    );
    const createdAt = nowIso();
    for (const label of DEFAULT_DRILL_TAGS) {
      insert.run(randomTagId(), label, createdAt);
    }
  }
}

function randomTagId(): string {
  return `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getDb(): Database.Database {
  if (globalForDb.__englishCoachDb) {
    ensureDrillTable(globalForDb.__englishCoachDb);
    return globalForDb.__englishCoachDb;
  }
  const db = new Database(resolveDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      url TEXT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS paragraphs (
      article_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      zh TEXT,
      PRIMARY KEY (article_id, idx),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS translations (
      article_id TEXT NOT NULL,
      paragraph_index INTEGER NOT NULL,
      draft_zh TEXT NOT NULL DEFAULT '',
      last_check_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (article_id, paragraph_index),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS explain_cache (
      article_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS extractions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      gloss TEXT NOT NULL,
      sentence TEXT NOT NULL,
      paragraph_index INTEGER,
      status TEXT NOT NULL DEFAULT 'unset',
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS wrong_items (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      paragraph_index INTEGER,
      mode TEXT NOT NULL,
      snippet TEXT NOT NULL,
      user_answer TEXT,
      expected_or_hint TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
  `);
  ensureDrillTable(db);
  globalForDb.__englishCoachDb = db;
  return db;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function saveArticle(input: {
  id: string;
  url: string | null;
  title: string;
  paragraphs: string[];
}): Article {
  const db = getDb();
  const ts = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO articles (id, url, title, created_at, updated_at)
       VALUES (@id, @url, @title, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         url=excluded.url, title=excluded.title, updated_at=excluded.updated_at`,
    ).run({
      id: input.id,
      url: input.url,
      title: input.title,
      createdAt: ts,
      updatedAt: ts,
    });
    db.prepare(`DELETE FROM paragraphs WHERE article_id = ?`).run(input.id);
    const insertPara = db.prepare(
      `INSERT INTO paragraphs (article_id, idx, text, zh) VALUES (?, ?, ?, NULL)`,
    );
    input.paragraphs.forEach((text, index) => {
      insertPara.run(input.id, index, text);
    });
  });
  tx();
  return getArticle(input.id)!;
}

export function listArticles(): Array<{
  id: string;
  url: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  paragraphCount: number;
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.url, a.title, a.created_at AS createdAt, a.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM paragraphs p WHERE p.article_id = a.id) AS paragraphCount
       FROM articles a
       ORDER BY a.updated_at DESC`,
    )
    .all() as Array<{
    id: string;
    url: string | null;
    title: string;
    createdAt: string;
    updatedAt: string;
    paragraphCount: number;
  }>;
  return rows;
}

export function deleteArticle(id: string): boolean {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM articles WHERE id = ?`).get(id);
  if (!existing) return false;
  db.transaction(() => {
    db.prepare(`DELETE FROM paragraphs WHERE article_id = ?`).run(id);
    db.prepare(`DELETE FROM translations WHERE article_id = ?`).run(id);
    db.prepare(`DELETE FROM explain_cache WHERE article_id = ?`).run(id);
    db.prepare(`DELETE FROM extractions WHERE article_id = ?`).run(id);
    db.prepare(`DELETE FROM wrong_items WHERE article_id = ?`).run(id);
    db.prepare(`DELETE FROM articles WHERE id = ?`).run(id);
  })();
  return true;
}

export function getArticle(id: string): Article | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, url, title, created_at AS createdAt, updated_at AS updatedAt
       FROM articles WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        url: string | null;
        title: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  if (!row) return null;
  const paragraphs = db
    .prepare(
      `SELECT idx AS "index", text, zh FROM paragraphs WHERE article_id = ? ORDER BY idx ASC`,
    )
    .all(id) as Paragraph[];
  return { ...row, paragraphs };
}

export function updateParagraphZh(
  articleId: string,
  paragraphIndex: number,
  zh: string,
): void {
  getDb()
    .prepare(`UPDATE paragraphs SET zh = ? WHERE article_id = ? AND idx = ?`)
    .run(zh, articleId, paragraphIndex);
}

/** Replace notes for one paragraph and leave the rest of the article alone. */
export function replaceParagraphExtractions(
  articleId: string,
  paragraphIndex: number,
  extractions: Extraction[],
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM extractions WHERE article_id = ? AND paragraph_index = ?`,
    ).run(articleId, paragraphIndex);
    const insert = db.prepare(
      `INSERT INTO extractions (id, article_id, kind, text, gloss, sentence, paragraph_index, status)
       VALUES (@id, @articleId, @kind, @text, @gloss, @sentence, @paragraphIndex, @status)`,
    );
    for (const item of extractions) {
      insert.run({
        id: item.id,
        articleId,
        kind: item.kind,
        text: item.text,
        gloss: item.gloss,
        sentence: item.sentence,
        paragraphIndex,
        status: item.status ?? "unset",
      });
    }
  });
  tx();
}

export function saveTranslation(input: {
  articleId: string;
  paragraphIndex: number;
  draftZh: string;
  lastCheckJson?: string | null;
}): TranslationDraft {
  const updatedAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO translations (article_id, paragraph_index, draft_zh, last_check_json, updated_at)
       VALUES (@articleId, @paragraphIndex, @draftZh, @lastCheckJson, @updatedAt)
       ON CONFLICT(article_id, paragraph_index) DO UPDATE SET
         draft_zh=excluded.draft_zh,
         last_check_json=COALESCE(excluded.last_check_json, translations.last_check_json),
         updated_at=excluded.updated_at`,
    )
    .run({
      articleId: input.articleId,
      paragraphIndex: input.paragraphIndex,
      draftZh: input.draftZh,
      lastCheckJson: input.lastCheckJson ?? null,
      updatedAt,
    });
  return {
    articleId: input.articleId,
    paragraphIndex: input.paragraphIndex,
    draftZh: input.draftZh,
    lastCheckJson: input.lastCheckJson ?? null,
    updatedAt,
  };
}

export function getTranslation(
  articleId: string,
  paragraphIndex: number,
): TranslationDraft | null {
  const row = getDb()
    .prepare(
      `SELECT article_id AS articleId, paragraph_index AS paragraphIndex,
              draft_zh AS draftZh, last_check_json AS lastCheckJson, updated_at AS updatedAt
       FROM translations WHERE article_id = ? AND paragraph_index = ?`,
    )
    .get(articleId, paragraphIndex) as TranslationDraft | undefined;
  return row ?? null;
}

export function saveExplainCache(
  articleId: string,
  payload: unknown,
  extractions: Array<Omit<Extraction, "status"> & { status?: ExtractionStatus }>,
): void {
  const db = getDb();
  const ts = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO explain_cache (article_id, payload_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
    ).run(articleId, JSON.stringify(payload), ts);
    db.prepare(`DELETE FROM extractions WHERE article_id = ?`).run(articleId);
    const insert = db.prepare(
      `INSERT INTO extractions (id, article_id, kind, text, gloss, sentence, paragraph_index, status)
       VALUES (@id, @articleId, @kind, @text, @gloss, @sentence, @paragraphIndex, @status)`,
    );
    for (const item of extractions) {
      insert.run({
        id: item.id,
        articleId: item.articleId,
        kind: item.kind,
        text: item.text,
        gloss: item.gloss,
        sentence: item.sentence,
        paragraphIndex: item.paragraphIndex,
        status: item.status ?? "unset",
      });
    }
  });
  tx();
}

export function getExplainCache(articleId: string): {
  payload: unknown;
  extractions: Extraction[];
} | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT payload_json FROM explain_cache WHERE article_id = ?`)
    .get(articleId) as { payload_json: string } | undefined;
  if (!row) return null;
  const extractions = db
    .prepare(
      `SELECT id, article_id AS articleId, kind, text, gloss, sentence,
              paragraph_index AS paragraphIndex, status
       FROM extractions WHERE article_id = ?`,
    )
    .all(articleId) as Extraction[];
  return { payload: JSON.parse(row.payload_json), extractions };
}

export function markExtraction(
  id: string,
  status: ExtractionStatus,
): Extraction | null {
  getDb().prepare(`UPDATE extractions SET status = ? WHERE id = ?`).run(status, id);
  const row = getDb()
    .prepare(
      `SELECT id, article_id AS articleId, kind, text, gloss, sentence,
              paragraph_index AS paragraphIndex, status
       FROM extractions WHERE id = ?`,
    )
    .get(id) as Extraction | undefined;
  return row ?? null;
}

export function listExtractions(articleId: string): Extraction[] {
  return getDb()
    .prepare(
      `SELECT id, article_id AS articleId, kind, text, gloss, sentence,
              paragraph_index AS paragraphIndex, status
       FROM extractions WHERE article_id = ?`,
    )
    .all(articleId) as Extraction[];
}

export function addWrongItem(input: Omit<WrongBookItem, "createdAt" | "resolvedAt"> & {
  createdAt?: string;
  resolvedAt?: string | null;
}): WrongBookItem {
  const createdAt = input.createdAt ?? nowIso();
  getDb()
    .prepare(
      `INSERT INTO wrong_items
       (id, article_id, paragraph_index, mode, snippet, user_answer, expected_or_hint, note, created_at, resolved_at)
       VALUES (@id, @articleId, @paragraphIndex, @mode, @snippet, @userAnswer, @expectedOrHint, @note, @createdAt, @resolvedAt)`,
    )
    .run({
      id: input.id,
      articleId: input.articleId,
      paragraphIndex: input.paragraphIndex,
      mode: input.mode,
      snippet: input.snippet,
      userAnswer: input.userAnswer,
      expectedOrHint: input.expectedOrHint,
      note: input.note,
      createdAt,
      resolvedAt: input.resolvedAt ?? null,
    });
  return {
    id: input.id,
    articleId: input.articleId,
    paragraphIndex: input.paragraphIndex,
    mode: input.mode,
    snippet: input.snippet,
    userAnswer: input.userAnswer,
    expectedOrHint: input.expectedOrHint,
    note: input.note,
    createdAt,
    resolvedAt: input.resolvedAt ?? null,
  };
}

export function listWrongItems(unresolvedOnly = true): WrongBookItem[] {
  const sql = unresolvedOnly
    ? `SELECT id, article_id AS articleId, paragraph_index AS paragraphIndex, mode, snippet,
              user_answer AS userAnswer, expected_or_hint AS expectedOrHint, note,
              created_at AS createdAt, resolved_at AS resolvedAt
       FROM wrong_items WHERE resolved_at IS NULL ORDER BY created_at DESC`
    : `SELECT id, article_id AS articleId, paragraph_index AS paragraphIndex, mode, snippet,
              user_answer AS userAnswer, expected_or_hint AS expectedOrHint, note,
              created_at AS createdAt, resolved_at AS resolvedAt
       FROM wrong_items ORDER BY created_at DESC`;
  return getDb().prepare(sql).all() as WrongBookItem[];
}

export function getWrongItem(id: string): WrongBookItem | null {
  const row = getDb()
    .prepare(
      `SELECT id, article_id AS articleId, paragraph_index AS paragraphIndex, mode, snippet,
              user_answer AS userAnswer, expected_or_hint AS expectedOrHint, note,
              created_at AS createdAt, resolved_at AS resolvedAt
       FROM wrong_items WHERE id = ?`,
    )
    .get(id) as WrongBookItem | undefined;
  return row ?? null;
}

export function resolveWrongItem(id: string): WrongBookItem | null {
  getDb()
    .prepare(`UPDATE wrong_items SET resolved_at = ? WHERE id = ?`)
    .run(nowIso(), id);
  return getWrongItem(id);
}

function endMark(value: string): SavedDrill["end"] {
  return value === "?" || value === "!" ? value : ".";
}

function readStringList(json: string | null): string[] | null {
  if (!json) return null;
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((item): item is string => typeof item === "string");
}

function readGrades(json: string | null): SlotGrade[] | null {
  if (!json) return null;
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return null;
  const grades: SlotGrade[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") return null;
    const status = (row as { status?: unknown }).status;
    const expected = (row as { expected?: unknown }).expected;
    if (status !== "correct" && status !== "close" && status !== "wrong") return null;
    if (typeof expected !== "string") return null;
    grades.push({ status, expected });
  }
  return grades;
}

function readLex(json: string | null): DrillLexItem[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: DrillLexItem[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const kind = (row as { kind?: unknown }).kind;
    const text = (row as { text?: unknown }).text;
    const gloss = (row as { gloss?: unknown }).gloss;
    if ((kind !== "phrase" && kind !== "word") || typeof text !== "string" || typeof gloss !== "string") {
      continue;
    }
    const trimmed = text.trim();
    const meaning = gloss.trim();
    if (!trimmed || !meaning) continue;
    items.push({ kind, text: trimmed, gloss: meaning });
  }
  return items;
}

interface DrillRow {
  id: string;
  industry: string;
  difficulty: string | null;
  zh: string;
  words_json: string;
  end_mark: string;
  lex_json: string | null;
  attempt_json: string | null;
  grades_json: string | null;
  summary: string;
  createdAt: string;
}

function toSavedDrill(row: DrillRow): SavedDrill {
  return {
    id: row.id,
    industry: row.industry,
    difficulty: drillLevelSpec(row.difficulty ?? "").level,
    zh: row.zh,
    words: readStringList(row.words_json) ?? [],
    end: endMark(row.end_mark),
    lex: readLex(row.lex_json),
    attempt: readStringList(row.attempt_json),
    grades: readGrades(row.grades_json),
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

export function saveDrill(input: {
  id: string;
  industry: string;
  difficulty: DrillLevel;
  zh: string;
  words: string[];
  end: SavedDrill["end"];
  lex?: DrillLexItem[];
}): SavedDrill {
  const createdAt = nowIso();
  const lex = input.lex ?? [];
  getDb()
    .prepare(
      `INSERT INTO drills (id, industry, difficulty, zh, words_json, end_mark, lex_json, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
    )
    .run(
      input.id,
      input.industry,
      input.difficulty,
      input.zh,
      JSON.stringify(input.words),
      input.end,
      JSON.stringify(lex),
      createdAt,
    );
  return {
    ...input,
    lex,
    attempt: null,
    grades: null,
    summary: "",
    createdAt,
  };
}

export function updateDrillResult(
  id: string,
  attempt: string[],
  grades: SlotGrade[],
  summary: string,
): void {
  getDb()
    .prepare(
      `UPDATE drills SET attempt_json = ?, grades_json = ?, summary = ? WHERE id = ?`,
    )
    .run(JSON.stringify(attempt), JSON.stringify(grades), summary, id);
}

export function listDrills(limit = 200): DrillListItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, industry, difficulty, zh, created_at AS createdAt, grades_json AS gradesJson
       FROM drills ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    industry: string;
    difficulty: string | null;
    zh: string;
    createdAt: string;
    gradesJson: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    industry: row.industry,
    difficulty: drillLevelSpec(row.difficulty ?? "").level,
    zh: row.zh,
    createdAt: row.createdAt,
    graded: Boolean(row.gradesJson),
  }));
}

export function getDrill(id: string): SavedDrill | null {
  const row = getDb()
    .prepare(
      `SELECT id, industry, difficulty, zh, words_json, end_mark, lex_json, attempt_json, grades_json, summary,
              created_at AS createdAt
       FROM drills WHERE id = ?`,
    )
    .get(id) as DrillRow | undefined;
  return row ? toSavedDrill(row) : null;
}

export interface DrillTag {
  id: string;
  label: string;
  createdAt: string;
}

export function listDrillTags(): DrillTag[] {
  return getDb()
    .prepare(
      `SELECT id, label, created_at AS createdAt FROM drill_tags ORDER BY created_at ASC, label ASC`,
    )
    .all() as DrillTag[];
}

export function addDrillTag(label: string): DrillTag {
  const trimmed = label.trim().slice(0, 20);
  if (!trimmed) throw new Error("标签不能为空");
  const existing = getDb()
    .prepare(
      `SELECT id, label, created_at AS createdAt FROM drill_tags WHERE label = ? COLLATE NOCASE`,
    )
    .get(trimmed) as DrillTag | undefined;
  if (existing) return existing;
  const createdAt = nowIso();
  const id = randomTagId();
  getDb()
    .prepare(`INSERT INTO drill_tags (id, label, created_at) VALUES (?, ?, ?)`)
    .run(id, trimmed, createdAt);
  return { id, label: trimmed, createdAt };
}

export function removeDrillTag(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM drill_tags WHERE id = ?`).run(id);
  return result.changes > 0;
}
