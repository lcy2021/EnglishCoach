import { randomUUID } from "node:crypto";
import { getChatModel } from "@/lib/agent/model";
import {
  getArticle,
  listExtractions,
  replaceParagraphExtractions,
  saveExplainCache,
  updateParagraphZh,
} from "@/lib/db";
import { explainDeliverKey } from "@/lib/explain/deliver";
import { parseExplainPayload } from "@/lib/explain/parse";
import {
  joinZhLines,
  linesFromParagraph,
  splitEnglishSentences,
} from "@/lib/explain/sentences";
import type { Article, Extraction } from "@/lib/types";

export { explainDeliverKey };

export type ExplainStreamEvent =
  | { type: "status"; text: string }
  | {
      type: "paragraph";
      index: number;
      zh: string;
      article: Article;
      extractions: Extraction[];
      done: number;
      total: number;
    }
  | { type: "done"; article: Article; extractions: Extraction[] };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
}

/**
 * One streaming model call. Model emits NDJSON (one paragraph object per line)
 * with sentence-aligned Chinese; each finished line is saved and yielded.
 */
export async function* streamExplainArticle(
  articleId: string,
  range?: { from?: number; to?: number },
): AsyncGenerator<ExplainStreamEvent> {
  const article = getArticle(articleId);
  if (!article) throw new Error("找不到这篇文章");

  const from = range?.from ?? 0;
  const to = range?.to ?? article.paragraphs.length - 1;
  const slice = article.paragraphs.filter((p) => p.index >= from && p.index <= to);
  if (slice.length === 0) throw new Error("找不到要讲解的段落");

  const total = slice.length;
  const byIndex = new Map(slice.map((p) => [p.index, p]));
  const completed = new Set<number>();

  yield { type: "status", text: `正在为 ${total} 个段落生成讲解` };

  const model = getChatModel(true, "generate-explain");
  const stream = await model.stream([
    {
      role: "system",
      content:
        'You write sentence-aligned Chinese for English learners. Reply with NDJSON only: one JSON object per paragraph, each on its own line, covering EVERY input paragraph in order. No markdown fences, no array wrapper, no commentary. Each line: {"index":number,"sentences":[{"en":string,"zh":string}],"phrases":[{"text":string,"gloss":string,"sentence":string}],"words":[{"text":string,"gloss":string,"sentence":string}]}. For each paragraph, sentences MUST match the given sentence list in length and order; copy each English sentence into en exactly; zh is fluent Chinese for that sentence only. At most 4 phrases and 4 words per paragraph; skip function words.',
    },
    {
      role: "user",
      content: JSON.stringify({
        title: article.title,
        paragraphs: slice.map((p) => ({
          index: p.index,
          sentences: splitEnglishSentences(p.text).map((text, i) => ({ i, text })),
        })),
      }),
    },
  ]);

  let carry = "";
  const flushLine = function* (line: string): Generator<ExplainStreamEvent> {
    const trimmed = line.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    if (!trimmed.startsWith("{")) return;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }
    const index = typeof body.index === "number" ? body.index : -1;
    const paragraph = byIndex.get(index);
    if (!paragraph || completed.has(index)) return;

    let payload;
    try {
      payload = parseExplainPayload(trimmed, paragraph.text);
    } catch {
      return;
    }

    updateParagraphZh(articleId, index, payload.zh);
    const notes: Extraction[] = [
      ...payload.phrases.map((item) => ({
        id: randomUUID(),
        articleId,
        kind: "phrase" as const,
        text: item.text,
        gloss: item.gloss,
        sentence: item.sentence,
        paragraphIndex: index,
        status: "unset" as const,
      })),
      ...payload.words.map((item) => ({
        id: randomUUID(),
        articleId,
        kind: "word" as const,
        text: item.text,
        gloss: item.gloss,
        sentence: item.sentence,
        paragraphIndex: index,
        status: "unset" as const,
      })),
    ];
    replaceParagraphExtractions(articleId, index, notes);
    completed.add(index);

    const refreshed = getArticle(articleId);
    if (!refreshed) throw new Error("找不到这篇文章");
    yield {
      type: "paragraph",
      index,
      zh: joinZhLines(payload.pairs.map((pair) => ({ en: pair.en, zh: pair.zh }))),
      article: refreshed,
      extractions: listExtractions(articleId),
      done: completed.size,
      total,
    };
    yield {
      type: "status",
      text: `已完成 ${completed.size}/${total} 段`,
    };
  };

  for await (const chunk of stream) {
    carry += textOf(chunk.content);
    while (true) {
      const nl = carry.indexOf("\n");
      if (nl < 0) break;
      const line = carry.slice(0, nl);
      carry = carry.slice(nl + 1);
      yield* flushLine(line);
    }
  }
  if (carry.trim()) yield* flushLine(carry);

  if (completed.size === 0) throw new Error("讲解没有写出中文");

  const refreshed = getArticle(articleId);
  if (!refreshed) throw new Error("找不到这篇文章");
  const extractions = listExtractions(articleId);
  saveExplainCache(
    articleId,
    {
      paragraphs: refreshed.paragraphs
        .filter((p) => p.zh)
        .map((p) => ({ index: p.index, zh: p.zh as string })),
      phrases: extractions
        .filter((item) => item.kind === "phrase")
        .map((item) => ({
          text: item.text,
          gloss: item.gloss,
          sentence: item.sentence,
          paragraphIndex: item.paragraphIndex,
        })),
      words: extractions
        .filter((item) => item.kind === "word")
        .map((item) => ({
          text: item.text,
          gloss: item.gloss,
          sentence: item.sentence,
          paragraphIndex: item.paragraphIndex,
        })),
    },
    extractions,
  );

  if (completed.size < total) {
    yield {
      type: "status",
      text: `已完成 ${completed.size}/${total} 段（其余未返回）`,
    };
  }
  yield { type: "done", article: refreshed, extractions };
}

/** Await the full explain (agent tools / non-SSE callers). */
export async function explainArticle(
  articleId: string,
  range?: { from?: number; to?: number },
  onProgress?: (text: string) => void,
): Promise<{ article: Article; extractions: Extraction[] }> {
  let done: { article: Article; extractions: Extraction[] } | null = null;
  for await (const event of streamExplainArticle(articleId, range)) {
    if (event.type === "status") onProgress?.(event.text);
    if (event.type === "done") done = { article: event.article, extractions: event.extractions };
  }
  if (!done) throw new Error("讲解失败");
  return done;
}

/** Concatenate Chinese sides for a full-article throw (rarely used). */
export function explainDeliverText(article: Article): string {
  return article.paragraphs
    .map((p) => joinZhLines(linesFromParagraph(p.text, p.zh)))
    .join("");
}
