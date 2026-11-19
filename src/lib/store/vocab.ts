"use client";

import { create } from "zustand";
import type { VocabSummary } from "@/lib/vocab/srs";

export interface SaveWordInput {
  text: string;
  gloss: string;
  phonetic?: string;
  sentence?: string;
  articleId?: string | null;
  source?: string;
}

interface VocabState {
  keys: Set<string>;
  total: number;
  due: number;
  mastered: number;
  refresh: () => Promise<void>;
  apply: (summary: VocabSummary) => void;
  save: (input: SaveWordInput) => Promise<boolean>;
}

export const useVocab = create<VocabState>((set, get) => ({
  keys: new Set(),
  total: 0,
  due: 0,
  mastered: 0,
  apply: (summary) =>
    set({ keys: new Set(summary.keys), total: summary.total, due: summary.due, mastered: summary.mastered }),
  refresh: async () => {
    try {
      const res = await fetch("/api/vocab", { cache: "no-store" });
      if (res.ok) get().apply((await res.json()) as VocabSummary);
    } catch {
      /* badge only; ignore */
    }
  },
  save: async (input) => {
    try {
      const res = await fetch("/api/vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", ...input }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { summary: VocabSummary };
      get().apply(data.summary);
      return true;
    } catch {
      return false;
    }
  },
}));

/** The sentence of a paragraph that contains the phrase (falls back to the paragraph start). */
export function sentenceAround(paragraph: string, phrase: string): string {
  const needle = phrase.toLowerCase();
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(needle));
  return (hit ?? paragraph).slice(0, 300);
}
