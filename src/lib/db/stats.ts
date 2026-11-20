import { getDb } from "@/lib/db";
import { buildStats, type GradedDrillRow, type Stats, type UsageRow } from "@/lib/usage-stats";

export type { DayPoint, GradedDrillRow, SourceUsage, Stats, UsageRow } from "@/lib/usage-stats";
export { buildStats } from "@/lib/usage-stats";

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

export function getStats(windowDays: number): Stats {
  ensureUsageTable();
  const db = getDb();
  const usageRows = db
    .prepare(`SELECT ts, source, input_tokens AS input, output_tokens AS output FROM llm_usage`)
    .all() as UsageRow[];
  const drillRows = db
    .prepare(`SELECT created_at AS createdAt, grades_json AS gradesJson FROM drills WHERE grades_json IS NOT NULL`)
    .all() as GradedDrillRow[];
  return buildStats(usageRows, drillRows, windowDays);
}
