"use client";

import { create } from "zustand";

export interface TodaySnapshot {
  drills: number;
  tokens: number;
}

interface TodayState extends TodaySnapshot {
  ready: boolean;
  setToday: (today: TodaySnapshot) => void;
  /** Reload after a drill or a coach turn. Page changes do not call this. */
  refresh: () => Promise<void>;
}

export const useToday = create<TodayState>((set) => ({
  drills: 0,
  tokens: 0,
  ready: false,
  setToday: (today) => set({ ...today, ready: true }),
  refresh: async () => {
    try {
      const res = await fetch("/api/stats?days=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { today: { drills: number; input: number; output: number } };
      set({ drills: data.today.drills, tokens: data.today.input + data.today.output, ready: true });
    } catch {
      /* the sidebar card is decorative */
    }
  },
}));
