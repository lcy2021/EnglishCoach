/** Daily goal and weekly comparison. Pure, so it can be tested without a DB. */

export const GOAL_CHOICES = [1, 3, 5, 10] as const;
export const DEFAULT_GOAL = 3;

export interface DayLike {
  date: string;
  drills: number;
  perfect: number;
}

export interface WeekSummary {
  drills: number;
  perfect: number;
  activeDays: number;
  /** Whole-number percent, or null when there was nothing to rate. */
  perfectRate: number | null;
}

function summarize(days: DayLike[]): WeekSummary {
  const drills = days.reduce((n, d) => n + d.drills, 0);
  const perfect = days.reduce((n, d) => n + d.perfect, 0);
  return {
    drills,
    perfect,
    activeDays: days.filter((d) => d.drills > 0).length,
    perfectRate: drills > 0 ? Math.round((perfect / drills) * 100) : null,
  };
}

/** `days` is oldest → newest; the last 7 are this week, the 7 before are last week. */
export function weekCompare(days: DayLike[]): { thisWeek: WeekSummary; lastWeek: WeekSummary } {
  const recent = days.slice(-7);
  const before = days.slice(-14, -7);
  return { thisWeek: summarize(recent), lastWeek: summarize(before) };
}

export function goalProgress(done: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(1, done / goal);
}
