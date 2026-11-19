/** Spaced repetition for the word book: a small Leitner-style ladder. */

export type Rating = "again" | "hard" | "good";

/** Days to wait at each box. Box 0 is "new / forgotten". */
export const BOX_DAYS = [0, 1, 2, 4, 7, 15, 30, 60] as const;
export const TOP_BOX = BOX_DAYS.length - 1;
/** A word counts as mastered once it has survived the 15-day gap. */
export const MASTERED_BOX = 5;

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface Schedule {
  box: number;
  dueInMs: number;
}

function clampBox(box: number): number {
  return Math.min(Math.max(Math.round(box), 0), TOP_BOX);
}

/** Where a word goes after one review. */
export function schedule(box: number, rating: Rating): Schedule {
  const current = clampBox(box);
  if (rating === "again") {
    return { box: 0, dueInMs: 10 * MINUTE };
  }
  if (rating === "hard") {
    const next = Math.max(current, 1);
    const days = Math.max(1, Math.round(BOX_DAYS[next] / 2));
    return { box: next, dueInMs: days * DAY };
  }
  const next = Math.min(current + 1, TOP_BOX);
  return { box: next, dueInMs: BOX_DAYS[next] * DAY };
}

/** "10 分钟后" / "3 小时后" / "2 天后" for the rating buttons and the list. */
export function formatInterval(ms: number): string {
  if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))} 分钟后`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))} 小时后`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days} 天后`;
  return `${Math.round(days / 30)} 个月后`;
}

export function stageOf(box: number): "new" | "learning" | "mastered" {
  if (box <= 0) return "new";
  return box >= MASTERED_BOX ? "mastered" : "learning";
}

export interface VocabWord {
  id: string;
  text: string;
  gloss: string;
  phonetic: string;
  sentence: string;
  articleId: string | null;
  source: string;
  box: number;
  reps: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
  createdAt: string;
}

export interface VocabSummary {
  total: number;
  due: number;
  mastered: number;
  /** Lower-cased saved words, so the reader can show a filled star. */
  keys: string[];
}
