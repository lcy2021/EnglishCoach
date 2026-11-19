"use client";

import { Star } from "lucide-react";
import { useVocab } from "@/lib/store/vocab";
import { useWorkspace } from "@/lib/store/workspace";
import { cn } from "@/lib/utils";

/** Star toggle that puts a word into the word book (saving twice is a no-op). */
export function SaveWordButton({
  text,
  gloss,
  sentence,
  phonetic,
  source = "reader",
  className,
}: {
  text: string;
  gloss: string;
  sentence?: string;
  phonetic?: string;
  source?: string;
  className?: string;
}) {
  const saved = useVocab((s) => s.keys.has(text.trim().toLowerCase()));
  const save = useVocab((s) => s.save);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `${text} 已在生词本` : `收藏 ${text} 到生词本`}
      title={saved ? "已在生词本" : "收藏到生词本"}
      disabled={saved}
      onClick={(event) => {
        event.stopPropagation();
        void save({
          text,
          gloss,
          sentence,
          phonetic,
          source,
          articleId: useWorkspace.getState().article?.id ?? null,
        });
      }}
      className={cn(
        "inline-grid size-6 shrink-0 place-items-center rounded-full transition-colors",
        saved ? "text-amber-500" : "text-muted-foreground hover:bg-muted hover:text-amber-500",
        className,
      )}
    >
      <Star className={cn("size-4", saved && "fill-current")} aria-hidden />
    </button>
  );
}
