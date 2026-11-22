import { DRILL_LEVELS, type DrillLevel } from "@/lib/drill/parse";

export interface PracticePrefs {
  tags: string[];
  difficulty: DrillLevel;
  topic: string;
}

const CONVERSE_KEY = "english-coach:converse-prefs";
const DRILL_KEY = "english-coach:drill-prefs";

function readPrefs(key: string): PracticePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<PracticePrefs> | null;
    if (!raw || typeof raw !== "object") return null;
    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [];
    const difficulty = DRILL_LEVELS.includes(raw.difficulty as DrillLevel)
      ? (raw.difficulty as DrillLevel)
      : "进阶";
    const topic = typeof raw.topic === "string" ? raw.topic : "";
    return { tags, difficulty, topic };
  } catch {
    return null;
  }
}

function writePrefs(key: string, prefs: PracticePrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        tags: prefs.tags.slice(0, 8),
        difficulty: prefs.difficulty,
        topic: prefs.topic.slice(0, 80),
      }),
    );
  } catch {
    /* storage unavailable */
  }
}

/** Keep only labels that still exist in the tag catalog. */
export function keepKnownTags(selected: string[], catalog: Array<{ label: string }>): string[] {
  return selected.filter((label) => catalog.some((tag) => tag.label === label));
}

export function loadConversePrefs(): PracticePrefs | null {
  return readPrefs(CONVERSE_KEY);
}

export function saveConversePrefs(prefs: PracticePrefs): void {
  writePrefs(CONVERSE_KEY, prefs);
}

export function loadDrillPrefs(): PracticePrefs | null {
  return readPrefs(DRILL_KEY);
}

export function saveDrillPrefs(prefs: PracticePrefs): void {
  writePrefs(DRILL_KEY, prefs);
}
