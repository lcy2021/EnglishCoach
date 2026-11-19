import { randomUUID } from "node:crypto";
import { getChatModel } from "@/lib/agent/model";
import {
  getArticle,
  listExtractions,
  replaceParagraphExtractions,
  updateParagraphZh,
} from "@/lib/db";
import type { Article, Extraction } from "@/lib/types";
import { parseExplainPayload } from "./parse";

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

/** Write a model translation for one paragraph without touching the others. */
export async function explainParagraph(
  articleId: string,
  paragraphIndex: number,
): Promise<{ article: Article; extractions: Extraction[] }> {
  const article = getArticle(articleId);
  if (!article) throw new Error("找不到这篇文章");
  const paragraph = article.paragraphs.find((item) => item.index === paragraphIndex);
  if (!paragraph) throw new Error("找不到这一段");

  const model = getChatModel(false, "paragraph-explain");
  const raw = await model.invoke([
    {
      role: "system",
      content:
        'You write a fluent Chinese rendering of one English paragraph for a learner who can already see the English. Reply ONLY JSON: {"zh":string,"phrases":[{"text":string,"gloss":string,"sentence":string}],"words":[{"text":string,"gloss":string,"sentence":string}]}. zh must read like normal written Chinese, in complete sentences, never a word-for-word gloss. At most 4 phrases and 4 words. Skip function words. gloss is a short Chinese meaning.',
    },
    {
      role: "user",
      content: JSON.stringify({
        title: article.title,
        index: paragraph.index,
        text: paragraph.text,
      }),
    },
  ]);

  const payload = parseExplainPayload(textOf(raw.content));
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
  return { article: refreshed, extractions: listExtractions(articleId) };
}
