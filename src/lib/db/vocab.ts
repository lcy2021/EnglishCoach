import { getDb } from "@/lib/db";
import { clampPage, type Page } from "@/lib/db/page";
import {
  MASTERED_BOX,
  schedule,
  type Rating,
  type VocabSummary,
  type VocabWord,
  type VocabWordForm,
} from "@/lib/vocab/srs";

function ensureVocabTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocab (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL UNIQUE COLLATE NOCASE,
      gloss TEXT NOT NULL DEFAULT '',
      phonetic TEXT NOT NULL DEFAULT '',
      sentence TEXT NOT NULL DEFAULT '',
      article_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      box INTEGER NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      due_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vocab_due ON vocab(due_at);
    CREATE INDEX IF NOT EXISTS idx_vocab_created ON vocab(created_at);
  `);
  const columns = db.prepare(`PRAGMA table_info(vocab)`).all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("pos")) {
    db.exec(`ALTER TABLE vocab ADD COLUMN pos TEXT NOT NULL DEFAULT ''`);
  }
  if (!names.has("forms_json")) {
    db.exec(`ALTER TABLE vocab ADD COLUMN forms_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

const SELECT = `SELECT id, text, gloss, phonetic, sentence, pos, forms_json AS formsJson,
  article_id AS articleId, source, box, reps, lapses,
  due_at AS dueAt, last_reviewed_at AS lastReviewedAt, created_at AS createdAt FROM vocab`;

interface VocabRow {
  id: string;
  text: string;
  gloss: string;
  phonetic: string;
  sentence: string;
  pos: string;
  formsJson: string;
  articleId: string | null;
  source: string;
  box: number;
  reps: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
  createdAt: string;
}

function readForms(json: string | null | undefined): VocabWordForm[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const forms: VocabWordForm[] = [];
  const seen = new Set<string>();
  for (const row of parsed) {
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
  return forms;
}

function toVocabWord(row: VocabRow): VocabWord {
  const forms = readForms(row.formsJson);
  return {
    id: row.id,
    text: row.text,
    gloss: row.gloss,
    phonetic: row.phonetic,
    sentence: row.sentence,
    articleId: row.articleId,
    source: row.source,
    box: row.box,
    reps: row.reps,
    lapses: row.lapses,
    dueAt: row.dueAt,
    lastReviewedAt: row.lastReviewedAt,
    createdAt: row.createdAt,
    ...(row.pos ? { pos: row.pos } : {}),
    ...(forms.length > 0 ? { forms } : {}),
  };
}

function newId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function vocabCounts(): Pick<VocabSummary, "total" | "due" | "mastered"> {
  ensureVocabTable();
  const db = getDb();
  const now = new Date().toISOString();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM vocab`).get() as { n: number }).n;
  const due = (db.prepare(`SELECT COUNT(*) AS n FROM vocab WHERE due_at <= ?`).get(now) as { n: number }).n;
  const mastered = (
    db.prepare(`SELECT COUNT(*) AS n FROM vocab WHERE box >= ?`).get(MASTERED_BOX) as { n: number }
  ).n;
  return { total, due, mastered };
}

export function vocabSummary(): VocabSummary {
  const counts = vocabCounts();
  const keys = (getDb().prepare(`SELECT lower(text) AS t FROM vocab`).all() as Array<{ t: string }>).map((row) => row.t);
  return { ...counts, keys };
}

function vocabLike(query: string): string | null {
  const needle = query.trim().replace(/[%_]/g, "");
  return needle ? `%${needle}%` : null;
}

export function listVocabPage(query = "", page = 1, pageSize = 10): Page<VocabWord> {
  ensureVocabTable();
  const db = getDb();
  const like = vocabLike(query);
  const where = like ? `WHERE text LIKE ? OR gloss LIKE ?` : ``;
  const args = like ? [like, like] : [];
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM vocab ${where}`).get(...args) as { n: number }).n;
  const clamped = clampPage(page, pageSize, total);
  const items = (
    db
      .prepare(`${SELECT} ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...args, clamped.pageSize, clamped.offset) as VocabRow[]
  ).map(toVocabWord);
  return { items, total, page: clamped.page, pageSize: clamped.pageSize };
}

export function listVocab(query = "", limit = 20): VocabWord[] {
  return listVocabPage(query, 1, limit).items;
}

export function findVocab(query: string): VocabWord | null {
  ensureVocabTable();
  const needle = query.trim();
  if (!needle) return null;
  const row = getDb().prepare(`${SELECT} WHERE id = ? OR text = ? COLLATE NOCASE LIMIT 1`).get(needle, needle) as
    | VocabRow
    | undefined;
  return row ? toVocabWord(row) : null;
}

export function dueVocab(limit = 20): VocabWord[] {
  ensureVocabTable();
  return (
    getDb()
      .prepare(`${SELECT} WHERE due_at <= ? ORDER BY due_at ASC LIMIT ?`)
      .all(new Date().toISOString(), limit) as VocabRow[]
  ).map(toVocabWord);
}

export function addVocab(input: {
  text: string;
  gloss?: string;
  phonetic?: string;
  sentence?: string;
  pos?: string;
  forms?: VocabWordForm[];
  articleId?: string | null;
  source?: string;
}): VocabWord {
  ensureVocabTable();
  const db = getDb();
  const text = input.text.trim().slice(0, 80);
  if (!text) throw new Error("单词不能为空");
  const existing = db.prepare(`${SELECT} WHERE text = ?`).get(text) as VocabRow | undefined;
  const gloss = (input.gloss ?? "").trim().slice(0, 300);
  const sentence = (input.sentence ?? "").trim().slice(0, 400);
  const phonetic = (input.phonetic ?? "").trim().slice(0, 60);
  const pos = (input.pos ?? "").trim().slice(0, 40);
  const formsJson = JSON.stringify((input.forms ?? []).slice(0, 12));
  if (existing) {
    // Fill in what the first save lacked; never reset the learning progress.
    const nextForms = existing.formsJson && existing.formsJson !== "[]" ? existing.formsJson : formsJson;
    db.prepare(
      `UPDATE vocab SET gloss = ?, sentence = ?, phonetic = ?, pos = ?, forms_json = ? WHERE id = ?`,
    ).run(
      existing.gloss || gloss,
      existing.sentence || sentence,
      existing.phonetic || phonetic,
      existing.pos || pos,
      nextForms,
      existing.id,
    );
    return toVocabWord(db.prepare(`${SELECT} WHERE id = ?`).get(existing.id) as VocabRow);
  }
  const now = new Date().toISOString();
  const id = newId();
  db.prepare(
    `INSERT INTO vocab (id, text, gloss, phonetic, pos, forms_json, sentence, article_id, source, box, reps, lapses, due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
  ).run(
    id,
    text,
    gloss,
    phonetic,
    pos,
    formsJson,
    sentence,
    input.articleId ?? null,
    input.source ?? "manual",
    now,
    now,
  );
  return toVocabWord(db.prepare(`${SELECT} WHERE id = ?`).get(id) as VocabRow);
}

export function reviewVocab(id: string, rating: Rating): VocabWord {
  ensureVocabTable();
  const db = getDb();
  const word = db.prepare(`${SELECT} WHERE id = ?`).get(id) as VocabRow | undefined;
  if (!word) throw new Error("找不到这个词");
  const next = schedule(word.box, rating);
  const now = new Date();
  db.prepare(
    `UPDATE vocab SET box = ?, reps = reps + 1, lapses = lapses + ?, due_at = ?, last_reviewed_at = ? WHERE id = ?`,
  ).run(next.box, rating === "again" ? 1 : 0, new Date(now.getTime() + next.dueInMs).toISOString(), now.toISOString(), id);
  return toVocabWord(db.prepare(`${SELECT} WHERE id = ?`).get(id) as VocabRow);
}

export function deleteVocab(id: string): boolean {
  ensureVocabTable();
  return getDb().prepare(`DELETE FROM vocab WHERE id = ?`).run(id).changes > 0;
}
