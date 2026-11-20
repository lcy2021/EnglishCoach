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

export interface UsageRow {
  ts: string;
  source: string;
  input: number;
  output: number;
}

export interface GradedDrillRow {
  createdAt: string;
  gradesJson: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function localKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function emptyDay(date: string): DayPoint {
  return { date, input: 0, output: 0, calls: 0, drills: 0, perfect: 0 };
}

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Fold usage and graded drills into the stats payload.
 * `windowDays <= 0` means the whole history, so the window total equals `allTime.tokens`.
 */
export function buildStats(
  usageRows: UsageRow[],
  drillRows: GradedDrillRow[],
  windowDays: number,
  now = new Date(),
): Stats {
  const allTimeRange = windowDays <= 0;
  const span = allTimeRange ? 0 : Math.min(Math.max(Math.floor(windowDays), 1), 90);

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
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);
  const boundedStart = new Date(todayDate);
  if (!allTimeRange) boundedStart.setDate(boundedStart.getDate() - (span - 1));
  const startKey = allTimeRange ? "" : localKey(boundedStart);

  let allTokens = 0;
  for (const row of usageRows) {
    allTokens += row.input + row.output;
    const key = localKey(new Date(row.ts));
    const point = dayAt(key);
    point.input += row.input;
    point.output += row.output;
    point.calls += 1;
    if (allTimeRange || key >= startKey) {
      const entry = sourceTotals.get(row.source) ?? { source: row.source, tokens: 0, calls: 0 };
      entry.tokens += row.input + row.output;
      entry.calls += 1;
      sourceTotals.set(row.source, entry);
    }
  }

  let allDrills = 0;
  for (const row of drillRows) {
    allDrills += 1;
    const point = dayAt(localKey(new Date(row.createdAt)));
    point.drills += 1;
    try {
      const grades = JSON.parse(row.gradesJson) as Array<{ status: string }>;
      if (Array.isArray(grades) && grades.length > 0 && grades.every((grade) => grade.status === "correct")) {
        point.perfect += 1;
      }
    } catch {
      /* malformed row counts as practiced, not perfect */
    }
  }

  let rangeStart = boundedStart;
  if (allTimeRange) {
    const keys = [...byDay.keys()].filter((key) => DATE_KEY.test(key)).sort();
    rangeStart = keys.length > 0 ? parseKey(keys[0]) : new Date(todayDate);
  }

  const days: DayPoint[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const endKey = localKey(todayDate);
  for (let i = 0; i < 3660 && localKey(cursor) <= endKey; i += 1) {
    const key = localKey(cursor);
    days.push(byDay.get(key) ?? emptyDay(key));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (days.length === 0) days.push(emptyDay(endKey));

  // Streak: consecutive practice days ending today (or yesterday, if today is still empty).
  let streakDays = 0;
  const walk = new Date(todayDate);
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

  const todayKey = localKey(todayDate);
  return {
    days,
    today: days.find((day) => day.date === todayKey) ?? days[days.length - 1],
    window,
    allTime: { drills: allDrills, tokens: allTokens },
    streakDays,
    bySource: [...sourceTotals.values()].sort((a, b) => b.tokens - a.tokens),
  };
}
