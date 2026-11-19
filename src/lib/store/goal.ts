"use client";

import { create } from "zustand";
import { DEFAULT_GOAL, GOAL_CHOICES } from "@/lib/goals";

const KEY = "english-coach:goal";

interface GoalState {
  goal: number;
  hydrate: () => void;
  setGoal: (goal: number) => void;
}

export const useGoal = create<GoalState>((set) => ({
  goal: DEFAULT_GOAL,
  hydrate: () => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if ((GOAL_CHOICES as readonly number[]).includes(saved)) set({ goal: saved });
    } catch {
      /* keep default */
    }
  },
  setGoal: (goal) => {
    set({ goal });
    try {
      localStorage.setItem(KEY, String(goal));
    } catch {
      /* storage unavailable */
    }
  },
}));
