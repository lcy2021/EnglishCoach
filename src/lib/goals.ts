/** Daily goal, achievements and weekly comparison. Pure, so it can be tested without a DB. */

export const GOAL_CHOICES = [1, 3, 5, 10] as const;
export const DEFAULT_GOAL = 3;

export interface Records {
  drills: number;
  perfect: number;
  longestStreak: number;
  bestDay: number;
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  /** Current value toward `target`. */
  value: number;
  target: number;
  unlocked: boolean;
}

interface Def {
  id: string;
  title: string;
  hint: string;
  target: number;
  pick: (r: Records) => number;
}

const DEFS: Def[] = [
  { id: "first", title: "迈出第一步", hint: "完成 1 道题", target: 1, pick: (r) => r.drills },
  { id: "ten", title: "小试牛刀", hint: "累计完成 10 道题", target: 10, pick: (r) => r.drills },
  { id: "fifty", title: "渐入佳境", hint: "累计完成 50 道题", target: 50, pick: (r) => r.drills },
  { id: "two-hundred", title: "笔耕不辍", hint: "累计完成 200 道题", target: 200, pick: (r) => r.drills },
  { id: "perfect-5", title: "一击即中", hint: "累计 5 道题全对", target: 5, pick: (r) => r.perfect },
  { id: "perfect-30", title: "稳准狠", hint: "累计 30 道题全对", target: 30, pick: (r) => r.perfect },
  { id: "streak-3", title: "三天不断", hint: "连续练习 3 天", target: 3, pick: (r) => r.longestStreak },
  { id: "streak-7", title: "一周坚持", hint: "连续练习 7 天", target: 7, pick: (r) => r.longestStreak },
  { id: "streak-30", title: "习惯养成", hint: "连续练习 30 天", target: 30, pick: (r) => r.longestStreak },
  { id: "big-day", title: "状态爆棚", hint: "单日完成 10 道题", target: 10, pick: (r) => r.bestDay },
];

export function achievements(records: Records): Achievement[] {
  return DEFS.map((def) => {
    const value = def.pick(records);
    return {
      id: def.id,
      title: def.title,
      hint: def.hint,
      target: def.target,
      value: Math.min(value, def.target),
      unlocked: value >= def.target,
    };
  });
}

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
