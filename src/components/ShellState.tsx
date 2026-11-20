"use client";

import { useEffect, useRef } from "react";
import { useToday, type TodaySnapshot } from "@/lib/store/today";
import { useVocab } from "@/lib/store/vocab";
import { useWorkspace } from "@/lib/store/workspace";
import type { VocabSummary } from "@/lib/vocab/srs";

/**
 * Sidebar numbers travel with the first document, not as extra API calls.
 * Later page changes leave them alone. A finished coach turn may have added
 * drills, tokens, or words, so that is the moment to reload.
 */
export function ShellState({
  today,
  vocab,
  children,
}: {
  today: TodaySnapshot;
  vocab: VocabSummary;
  children: React.ReactNode;
}) {
  const stamp = `${today.drills}:${today.tokens}:${vocab.total}:${vocab.due}:${vocab.mastered}:${vocab.keys.join("\0")}`;
  const seen = useRef<string | null>(null);
  if (seen.current === null) {
    seen.current = stamp;
    useToday.getState().setToday(today);
    useVocab.setState({
      keys: new Set(vocab.keys),
      total: vocab.total,
      due: vocab.due,
      mastered: vocab.mastered,
    });
  }

  useEffect(() => {
    if (seen.current === stamp) return;
    seen.current = stamp;
    useToday.getState().setToday(today);
    useVocab.setState({
      keys: new Set(vocab.keys),
      total: vocab.total,
      due: vocab.due,
      mastered: vocab.mastered,
    });
  }, [stamp, today, vocab]);

  const busy = useWorkspace((s) => s.busy);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    void useToday.getState().refresh();
    void useVocab.getState().refresh();
  }, [busy]);

  return children;
}
