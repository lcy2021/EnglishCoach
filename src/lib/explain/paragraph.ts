import { randomUUID } from "node:crypto";
import { getChatModel, type UsageSource } from "@/lib/agent/model";
import {
  getArticle,
  listExtractions,
  replaceParagraphExtractions,
  updateParagraphZh,
} from "@/lib/db";
import type { Article, Extraction } from "@/lib/types";
import { parseExplainPayload } from "./parse";
import { splitEnglishSentences } from "./sentences";

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

/** Write sentence-aligned Chinese under one English paragraph. */
export async function explainParagraph(
  articleId: string,
  paragraphIndex: number,
  options?: { source?: UsageSource },
): Promise<{ article: Article; extractions: Extraction[]; deliverZh: string }> {
  const article = getArticle(articleId);
  if (!article) throw new Error("找不到这篇文章");
  const paragraph = article.paragraphs.find((item) => item.index === paragraphIndex);
  if (!paragraph) throw new Error("找不到这一段");

  const sentences = splitEnglishSentences(paragraph.text);
  const model = getChatModel(false, options?.source ?? "paragraph-explain");
  const raw = await model.invoke([
    {
      role: "system",
      content:
        'You write sentence-aligned Chinese for an English learner. Reply ONLY JSON: {"sentences":[{"en":string,"zh":string}],"phrases":[{"text":string,"gloss":string,"sentence":string}],"words":[{"text":string,"gloss":string,"sentence":string}]}. sentences MUST have the same length and order as the input list; copy each input English sentence into en exactly; zh is fluent written Chinese for that sentence only, never a word-for-word gloss. At most 4 phrases and 4 words for the whole paragraph. Skip function words. gloss is a short Chinese meaning.',
    },
    {
      role: "user",
      content: JSON.stringify({
        title: article.title,
        index: paragraph.index,
        sentences: sentences.map((text, i) => ({ i, text })),
      }),
    },
  ]);

  const payload = parseExplainPayload(textOf(raw.content), paragraph.text);
  updateParagraphZh(articleId, paragraphIndex, payload.zh);

  const extractions: Extraction[] = [
    ...payload.phrases.map((item) => ({
      id: randomUUID(),
      articleId,
      kind: "phrase" as const,
      text: item.text,
      gloss: item.gloss,
      sentence: item.sentence,
      paragraphIndex,
      status: "unset" as const,
    })),
    ...payload.words.map((item) => ({
      id: randomUUID(),
      articleId,
      kind: "word" as const,
      text: item.text,
      gloss: item.gloss,
      sentence: item.sentence,
      paragraphIndex,
      status: "unset" as const,
    })),
  ];
  replaceParagraphExtractions(articleId, paragraphIndex, extractions);

  const refreshed = getArticle(articleId);
  if (!refreshed) throw new Error("找不到这篇文章");
  return {
    article: refreshed,
    extractions: listExtractions(articleId),
    deliverZh: payload.pairs.map((pair) => pair.zh).join(""),
  };
}
