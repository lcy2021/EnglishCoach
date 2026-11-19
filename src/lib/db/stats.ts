import { getDb } from "@/lib/db";

export interface UsageRecord {
  source: string;
  model: string;
  input: number;
  output: number;
}

function ensureUsageTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_llm_usage_ts ON llm_usage(ts);
  `);
}

/** Never throws: usage bookkeeping must not break a model call. */
export function recordUsage(record: UsageRecord): void {
  try {
    if (record.input <= 0 && record.output <= 0) return;
    ensureUsageTable();
    getDb()
      .prepare(
        `INSERT INTO llm_usage (ts, source, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(new Date().toISOString(), record.source, record.model, record.input, record.output);
  } catch (error) {
    console.warn("[usage] could not record token usage", error);
  }
}

export interface DayPoint {
  date: string; // YYYY-MM-DD, local time
  input: number;
  output: number;
  calls: number;
  drills: number;
  perfect: number;
}

export interface SourceUsage {
  source: string;
  tokens: number;
  calls: number;
}

export interface Stats {
  days: DayPoint[];
  today: DayPoint;
  window: { input: number; output: number; calls: number; drills: number; perfect: number };
  allTime: { drills: number; tokens: number };
  streakDays: number;
  bySource: SourceUsage[];
}

function localKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function emptyDay(date: string): DayPoint {
  return { date, input: 0, output: 0, calls: 0, drills: 0, perfect: 0 };
}

export function getStats(windowDays: number): Stats {
  ensureUsageTable();
  const db = getDb();
  const span = Math.min(Math.max(Math.floor(windowDays), 1), 90);

  const byDay = new Map<string, DayPoint>();
  const dayAt = (key: string) => {
    let point = byDay.get(key);
    if (!point) {
      point = emptyDay(key);
      byDay.set(key, point);
    }
    return point;
  };

  const sourceTotals = new Map<string, SourceUsage>();
  const startKey = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (span - 1));
    return localKey(start);
  })();

  let allTokens = 0;
  const usageRows = db
    .prepare(`SELECT ts, source, input_tokens AS input, output_tokens AS output FROM llm_usage`)
    .all() as Array<{ ts: string; source: string; input: number; output: number }>;
  for (const row of usageRows) {
    allTokens += row.input + row.output;
    const key = localKey(new Date(row.ts));
    const point = dayAt(key);
    point.input += row.input;
    point.output += row.output;
    point.calls += 1;
    if (key >= startKey) {
      const entry = sourceTotals.get(row.source) ?? { source: row.source, tokens: 0, calls: 0 };
      entry.tokens += row.input + row.output;
      entry.calls += 1;
      sourceTotals.set(row.source, entry);
    }
  }

  let allDrills = 0;
  const drillRows = db
    .prepare(`SELECT created_at AS createdAt, grades_json AS gradesJson FROM drills WHERE grades_json IS NOT NULL`)
    .all() as Array<{ createdAt: string; gradesJson: string }>;
  for (const row of drillRows) {
    allDrills += 1;
    const point = dayAt(localKey(new Date(row.createdAt)));
    point.drills += 1;
    try {
      const grades = JSON.parse(row.gradesJson) as Array<{ status: string }>;
      if (Array.isArray(grades) && grades.length > 0 && grades.every((g) => g.status === "correct")) {
        point.perfect += 1;
      }
    } catch {
      /* malformed row counts as practiced, not perfect */
    }
  }

  const days: DayPoint[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (span - 1));
  for (let i = 0; i < span; i += 1) {
    const key = localKey(cursor);
    days.push(byDay.get(key) ?? emptyDay(key));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Streak: consecutive practice days ending today (or yesterday, if today is still empty).
  let streakDays = 0;
  const walk = new Date();
  walk.setHours(0, 0, 0, 0);
  if ((byDay.get(localKey(walk))?.drills ?? 0) === 0) walk.setDate(walk.getDate() - 1);
  while ((byDay.get(localKey(walk))?.drills ?? 0) > 0) {
    streakDays += 1;
    walk.setDate(walk.getDate() - 1);
  }

  const window = days.reduce(
    (acc, day) => ({
      input: acc.input + day.input,
      output: acc.output + day.output,
      calls: acc.calls + day.calls,
      drills: acc.drills + day.drills,
      perfect: acc.perfect + day.perfect,
    }),
    { input: 0, output: 0, calls: 0, drills: 0, perfect: 0 },
  );

  return {
    days,
    today: days[days.length - 1],
    window,
    allTime: { drills: allDrills, tokens: allTokens },
    streakDays,
    bySource: [...sourceTotals.values()].sort((a, b) => b.tokens - a.tokens),
  };
}
