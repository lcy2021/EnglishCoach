"use client";

import { create } from "zustand";

export const LEVELS: ReadonlyArray<{ rank: number; label: string; hint: string }> = [
  { rank: 1, label: "初中", hint: "中考词汇" },
  { rank: 2, label: "高中", hint: "高考词汇" },
  { rank: 3, label: "四级", hint: "大学英语四级" },
  { rank: 4, label: "六级", hint: "大学英语六级" },
  { rank: 5, label: "考研", hint: "考研英语" },
  { rank: 6, label: "雅思/托福", hint: "出国考试" },
];

const KEY = "english-coach:level";

interface LevelState {
  level: number;
  highlight: boolean;
  hydrate: () => void;
  setLevel: (level: number) => void;
  setHighlight: (on: boolean) => void;
}

function persist(level: number, highlight: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ level, highlight }));
  } catch {
    /* storage unavailable */
  }
}

export const useLevel = create<LevelState>((set, get) => ({
  level: 3,
  highlight: true,
  hydrate: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { level?: number; highlight?: boolean } | null;
      if (saved) {
        set({
          level: LEVELS.some((l) => l.rank === saved.level) ? (saved.level as number) : 3,
          highlight: saved.highlight !== false,
        });
      }
    } catch {
      /* keep defaults */
    }
  },
  setLevel: (level) => {
    set({ level });
    persist(level, get().highlight);
  },
  setHighlight: (highlight) => {
    set({ highlight });
    persist(get().level, highlight);
  },
}));

export function levelLabel(rank: number): string {
  return LEVELS.find((l) => l.rank === rank)?.label ?? "四级";
}
