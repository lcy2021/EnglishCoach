import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  addWrongItem,
  getArticle,
  getExplainCache,
  getTranslation,
  getWrongItem,
  listArticles,
  listExtractions,
  listWrongItemsPage,
  markExtraction,
  resolveWrongItem,
  saveArticle,
  saveTranslation,
  updateParagraphZh,
} from "@/lib/db";
import {
  fetchAndExtract,
  organizePlainText,
} from "@/lib/fetch/extract";
import type { AgentSessionContext } from "@/lib/agent/context";
import { buildPageTools } from "@/lib/agent/tools/pages";
import { pushPatch, reportProgress } from "@/lib/agent/context";
import { getChatModel } from "@/lib/agent/model";
import { searchWeb } from "@/lib/agent/web-search";
import { resolveExplainRange, streamExplainArticle } from "@/lib/explain/article";
import { explainDeliverKey } from "@/lib/explain/deliver";
import { explainParagraph } from "@/lib/explain/paragraph";
import { joinZhLines, linesFromParagraph } from "@/lib/explain/sentences";
import type { ViewLens } from "@/lib/types";

function requireArticleId(ctx: AgentSessionContext): string {
  if (!ctx.articleId) {
    throw new Error("No article is open. Fetch or organize one first.");
  }
  return ctx.articleId;
}

export function buildCoachTools(ctx: AgentSessionContext) {
  const fetch_and_organize = tool(
    async ({ url, text, title }) => {
      const extracted = url
        ? await fetchAndExtract(url, (text) => reportProgress(ctx, text))
        : organizePlainText(text ?? "", title || "Pasted text");
      reportProgress(ctx, `正在保存《${title || extracted.title}》`);
      const article = saveArticle({
        id: randomUUID(),
        url: extracted.url,
        title: title || extracted.title,
        paragraphs: extracted.paragraphs,
      });
      pushPatch(ctx, {
        article,
        selectedParagraphIndex: 0,
        viewLens: "read",
        translateOpen: false,
        explainExtractions: [],
        route: "practice",
        deliver: { target: "article", text: article.paragraphs.map((p) => p.text).join("") },
        statusMessage: `已整理《${article.title}》（${article.paragraphs.length} 段）`,
      });
      return JSON.stringify({
        ok: true,
        articleId: article.id,
        title: article.title,
        paragraphCount: article.paragraphs.length,
      });
    },
    {
      name: "fetch_and_organize",
      description:
        "Fetch a URL or organize pasted English text into the reader as paragraphs.",
      schema: z.object({
        url: z.string().url().optional().describe("Article URL to fetch"),
        text: z.string().optional().describe("Pasted plain text to organize"),
        title: z.string().optional().describe("Optional title override"),
      }),
    },
  );

  const set_view_lens = tool(
    async ({ lens }) => {
      pushPatch(ctx, {
        viewLens: lens as ViewLens,
        translateOpen: lens === "translate" ? true : ctx.translateOpen,
      });
      if (lens === "explain" && ctx.articleId) {
        const cached = getExplainCache(ctx.articleId);
        if (cached) {
          const article = getArticle(ctx.articleId);
          if (article) {
            const payload = cached.payload as {
              paragraphs?: Array<{ index: number; zh: string }>;
            };
            for (const p of payload.paragraphs ?? []) {
              updateParagraphZh(article.id, p.index, p.zh);
            }
            pushPatch(ctx, {
              article: getArticle(ctx.articleId),
              explainExtractions: cached.extractions,
              viewLens: "explain",
            });
          }
        }
      }
      return JSON.stringify({ ok: true, viewLens: lens });
    },
    {
      name: "set_view_lens",
      description: "Switch reader lens: read | explain | translate.",
      schema: z.object({
        lens: z.enum(["read", "explain", "translate"]),
      }),
    },
  );

  const select_paragraph = tool(
    async ({ index }) => {
      const articleId = requireArticleId(ctx);
      const article = getArticle(articleId);
      if (!article || index < 0 || index >= article.paragraphs.length) {
        throw new Error("Paragraph index out of range.");
      }
      pushPatch(ctx, { selectedParagraphIndex: index });
      return JSON.stringify({
        ok: true,
        index,
        text: article.paragraphs[index].text,
      });
    },
    {
      name: "select_paragraph",
      description: "Focus a paragraph by zero-based index.",
      schema: z.object({ index: z.number().int().nonnegative() }),
    },
  );

  const open_translate_editor = tool(
    async ({ paragraphIndex }) => {
      const articleId = requireArticleId(ctx);
      const index =
        paragraphIndex ?? ctx.selectedParagraphIndex ?? 0;
      pushPatch(ctx, {
        selectedParagraphIndex: index,
        viewLens: "translate",
        translateOpen: true,
      });
      const draft = getTranslation(articleId, index);
      return JSON.stringify({
        ok: true,
        paragraphIndex: index,
        existingDraft: draft?.draftZh ?? "",
      });
    },
    {
      name: "open_translate_editor",
      description: "Open the Chinese translation editor for a paragraph.",
      schema: z.object({
        paragraphIndex: z.number().int().nonnegative().optional(),
      }),
    },
  );

  const save_translation = tool(
    async ({ paragraphIndex, draftZh }) => {
      const articleId = requireArticleId(ctx);
      const index = paragraphIndex ?? ctx.selectedParagraphIndex;
      if (index === null || index === undefined) {
        throw new Error("No paragraph selected.");
      }
      const saved = saveTranslation({
        articleId,
        paragraphIndex: index,
        draftZh,
      });
      pushPatch(ctx, {
        selectedParagraphIndex: index,
        translateOpen: true,
        viewLens: "translate",
      });
      return JSON.stringify({ ok: true, saved });
    },
    {
      name: "save_translation",
      description: "Save the user's Chinese translation draft for a paragraph.",
      schema: z.object({
        draftZh: z.string(),
        paragraphIndex: z.number().int().nonnegative().optional(),
      }),
    },
  );

  const check_translation = tool(
    async ({ paragraphIndex }) => {
      const articleId = requireArticleId(ctx);
      const index = paragraphIndex ?? ctx.selectedParagraphIndex;
      if (index === null || index === undefined) {
        throw new Error("No paragraph selected.");
      }
      const article = getArticle(articleId);
      if (!article) throw new Error("Article missing.");
      const para = article.paragraphs[index];
      const draft = getTranslation(articleId, index);
      if (!draft?.draftZh?.trim()) {
        throw new Error("No translation draft to check. Ask the user to write one.");
      }

      reportProgress(ctx, "正在对照原文批改你的翻译");
      const model = getChatModel(false, "check-translation");
      const raw = await model.invoke([
        {
          role: "system",
          content:
            'You check a Chinese learner\'s translation of one English paragraph. Reply ONLY JSON: {"ok":boolean,"feedback":string,"issues":string[],"shouldAddWrongBook":boolean,"hint":string}. feedback must be Chinese, 3 to 6 short sentences: (1) overall judgment, (2) where meaning drifted or wording felt stiff, with the English cue, (3) why that matters, (4) one clearer Chinese rewrite for the weak part. Do not only say "不对" or "还可以". issues is a short Chinese bullet list of concrete problems. hint is one better Chinese rendering of the hard clause. shouldAddWrongBook is true when meaning is wrong or a key phrase is missing. ok is true only when meaning is complete and natural enough.',
        },
        {
          role: "user",
          content: JSON.stringify({
            english: para.text,
            chinese: draft.draftZh,
          }),
        },
      ]);
      const content =
        typeof raw.content === "string"
          ? raw.content
          : JSON.stringify(raw.content);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch
        ? (JSON.parse(jsonMatch[0]) as {
            ok: boolean;
            feedback: string;
            issues: string[];
            shouldAddWrongBook: boolean;
            hint: string;
          })
        : {
            ok: false,
            feedback: content,
            issues: [],
            shouldAddWrongBook: true,
            hint: "",
          };

      saveTranslation({
        articleId,
        paragraphIndex: index,
        draftZh: draft.draftZh,
        lastCheckJson: JSON.stringify(parsed),
      });

      if (parsed.shouldAddWrongBook || !parsed.ok) {
        addWrongItem({
          id: randomUUID(),
          articleId,
          paragraphIndex: index,
          mode: "translate",
          snippet: para.text.slice(0, 280),
          userAnswer: draft.draftZh,
          expectedOrHint: parsed.hint || parsed.feedback,
          note: (parsed.issues ?? []).join("; "),
        });
      }

      pushPatch(ctx, {
        translationFeedback: parsed.feedback,
        deliver: { target: "translation-feedback", text: parsed.feedback },
        selectedParagraphIndex: index,
        translateOpen: true,
      });

      return JSON.stringify(parsed);
    },
    {
      name: "check_translation",
      description:
        "Check the user's Chinese translation for the selected paragraph; may add wrong-book items.",
      schema: z.object({
        paragraphIndex: z.number().int().nonnegative().optional(),
      }),
    },
  );

  const generate_explain = tool(
    async ({ paragraphFrom, paragraphTo }) => {
      const articleId = requireArticleId(ctx);
      const article = getArticle(articleId);
      if (!article) throw new Error("找不到这篇文章");

      const hasRange =
        typeof paragraphFrom === "number" || typeof paragraphTo === "number";
      const bounds = resolveExplainRange(
        article.paragraphs.length,
        hasRange ? { from: paragraphFrom, to: paragraphTo } : undefined,
      );

      // Single paragraph: dedicated path (same as the reader "看讲解" button).
      if (hasRange && bounds.from === bounds.to) {
        reportProgress(ctx, `正在讲解第 ${bounds.from + 1} 段`);
        const result = await explainParagraph(articleId, bounds.from);
        const paragraph = result.article.paragraphs.find((p) => p.index === bounds.from);
        const zh =
          result.deliverZh ||
          (paragraph
            ? joinZhLines(linesFromParagraph(paragraph.text, paragraph.zh))
            : "");
        pushPatch(ctx, {
          article: result.article,
          selectedParagraphIndex: bounds.from,
          viewLens: "explain",
          translateOpen: false,
          explainExtractions: result.extractions,
          deliver: zh ? { target: explainDeliverKey(bounds.from), text: zh } : undefined,
          statusMessage: `已完成第 ${bounds.from + 1} 段讲解`,
        });
        return JSON.stringify({
          ok: true,
          explainedFrom: bounds.from,
          explainedTo: bounds.to,
          explainedCount: 1,
          phraseCount: result.extractions.filter(
            (item) => item.kind === "phrase" && item.paragraphIndex === bounds.from,
          ).length,
          wordCount: result.extractions.filter(
            (item) => item.kind === "word" && item.paragraphIndex === bounds.from,
          ).length,
        });
      }

      const range = hasRange ? bounds : undefined;
      let done: {
        article: NonNullable<ReturnType<typeof getArticle>>;
        extractions: ReturnType<typeof listExtractions>;
      } | null = null;

      for await (const event of streamExplainArticle(articleId, range)) {
        if (event.type === "status") {
          reportProgress(ctx, event.text);
          continue;
        }
        if (event.type === "paragraph") {
          pushPatch(ctx, {
            article: event.article,
            viewLens: "explain",
            translateOpen: false,
            explainExtractions: event.extractions,
            deliver: {
              target: explainDeliverKey(event.index),
              text: event.zh,
            },
            statusMessage: `已完成 ${event.done}/${event.total} 段`,
          });
          continue;
        }
        done = { article: event.article, extractions: event.extractions };
        pushPatch(ctx, {
          article: event.article,
          viewLens: "explain",
          translateOpen: false,
          explainExtractions: event.extractions,
          statusMessage: "讲解已生成",
        });
      }

      if (!done) throw new Error("讲解失败");
      const explainedCount = bounds.to - bounds.from + 1;
      return JSON.stringify({
        ok: true,
        explainedFrom: bounds.from,
        explainedTo: bounds.to,
        explainedCount,
        phraseCount: done.extractions.filter((item) => item.kind === "phrase").length,
        wordCount: done.extractions.filter((item) => item.kind === "word").length,
      });
    },
    {
      name: "generate_explain",
      description:
        "Generate Chinese notes + phrase/word extraction on the page. Whole article (本篇/全文) → omit both args. One paragraph (第N段/这一段) → pass paragraphFrom AND paragraphTo as the same 0-based index (第2段 → both 1). A range → inclusive 0-based bounds. Passing only one bound is treated as that single paragraph, never as through the end of the article.",
      schema: z.object({
        paragraphFrom: z.number().int().nonnegative().optional(),
        paragraphTo: z.number().int().nonnegative().optional(),
      }),
    },
  );

  const explain_selection = tool(
    async ({ text }) => {
      const model = getChatModel(false, "explain-selection");
      const raw = await model.invoke([
        {
          role: "system",
          content:
            "Explain the English selection for a Chinese learner in concise Chinese with one natural paraphrase.",
        },
        { role: "user", content: text },
      ]);
      const explanation =
        typeof raw.content === "string"
          ? raw.content
          : JSON.stringify(raw.content);
      pushPatch(ctx, { translationFeedback: explanation });
      return explanation;
    },
    {
      name: "explain_selection",
      description: "Explain a selected English sentence/span without regenerating the whole article.",
      schema: z.object({ text: z.string().min(1) }),
    },
  );

  const mark_extraction = tool(
    async ({ extractionId, status }) => {
      const updated = markExtraction(extractionId, status);
      if (!updated) throw new Error("Extraction not found.");
      if (status === "unclear") {
        addWrongItem({
          id: randomUUID(),
          articleId: updated.articleId,
          paragraphIndex: updated.paragraphIndex,
          mode: "explain",
          snippet: updated.text,
          userAnswer: null,
          expectedOrHint: updated.gloss,
          note: updated.sentence,
        });
      }
      pushPatch(ctx, {
        explainExtractions: listExtractions(updated.articleId),
      });
      return JSON.stringify({ ok: true, extraction: updated });
    },
    {
      name: "mark_extraction",
      description: "Mark a phrase/word extraction as known or unclear.",
      schema: z.object({
        extractionId: z.string(),
        status: z.enum(["known", "unclear", "unset"]),
      }),
    },
  );

  const list_wrong_book = tool(
    async ({ unresolvedOnly }) => {
      const page = listWrongItemsPage(1, 20, unresolvedOnly ?? true);
      pushPatch(ctx, {
        route: "wrong-book",
        statusMessage: "已打开复习",
        pageCommand: { id: randomUUID(), route: "wrong-book", refresh: ["wrong-book"] },
      });
      return JSON.stringify({
        count: page.total,
        items: page.items,
      });
    },
    {
      name: "list_wrong_book",
      description:
        "Open the 复习 page (错题本) and list items. Prefer this over navigate(wrong-book) for 打开复习 / 看错题. Not for 复习生词 — use list_vocab with startReview. Default unresolved only.",
      schema: z.object({
        unresolvedOnly: z.boolean().optional(),
      }),
    },
  );

  const open_wrong_item = tool(
    async ({ id }) => {
      const item = getWrongItem(id);
      if (!item) throw new Error("Wrong-book item not found.");
      const article = getArticle(item.articleId);
      pushPatch(ctx, {
        route: "practice",
        article,
        selectedParagraphIndex: item.paragraphIndex,
        viewLens: item.mode === "explain" ? "explain" : "translate",
        translateOpen: item.mode === "translate",
        focusWrongItemId: id,
        statusMessage: "已跳转到错题对应段落",
      });
      return JSON.stringify({ ok: true, item });
    },
    {
      name: "open_wrong_item",
      description: "Open a wrong-book item and restore article/paragraph context.",
      schema: z.object({ id: z.string() }),
    },
  );

  const resolve_wrong_item = tool(
    async ({ id }) => {
      const item = resolveWrongItem(id);
      if (!item) throw new Error("Wrong-book item not found.");
      pushPatch(ctx, {
        route: "wrong-book",
        statusMessage: "已标记为掌握",
        pageCommand: { id: randomUUID(), route: "wrong-book", refresh: ["wrong-book"] },
      });
      return JSON.stringify({ ok: true, item });
    },
    {
      name: "resolve_wrong_item",
      description: "Mark a wrong-book item as resolved.",
      schema: z.object({ id: z.string() }),
    },
  );

  const open_article = tool(
    async ({ articleId }) => {
      const article = getArticle(articleId);
      if (!article) throw new Error("Article not found.");
      const extractions = listExtractions(articleId);
      pushPatch(ctx, {
        article,
        route: "practice",
        selectedParagraphIndex: 0,
        viewLens: "read",
        explainExtractions: extractions,
        deliver: { target: "article", text: article.paragraphs.map((p) => p.text).join("") },
      });
      return JSON.stringify({
        ok: true,
        title: article.title,
        paragraphCount: article.paragraphs.length,
      });
    },
    {
      name: "open_article",
      description: "Open an article from the library by id.",
      schema: z.object({ articleId: z.string() }),
    },
  );

  const web_search = tool(
    async ({ query }) => {
      reportProgress(ctx, `正在联网搜索「${query.slice(0, 24)}」，稍等片刻`);
      const result = await searchWeb(query);
      reportProgress(ctx, `找到 ${result.citations.length} 个来源，正在挑选文章`);
      pushPatch(ctx, { statusMessage: "已完成网页搜索" });
      return JSON.stringify(result);
    },
    {
      name: "web_search",
      description:
        "Search the public web (Tavily when configured, otherwise the model provider's hosted web_search). Use this when the user asks to find an article or look up a current fact. For reading practice, pick one English article URL from citations and then call fetch_and_organize.",
      schema: z.object({
        query: z
          .string()
          .min(2)
          .describe("Search question, preferably asking for a readable English article"),
      }),
    },
  );

  const get_workspace_snapshot = tool(
    async () => {
      const article = ctx.articleId ? getArticle(ctx.articleId) : null;
      return JSON.stringify({
        articleId: ctx.articleId,
        title: article?.title ?? null,
        paragraphCount: article?.paragraphs.length ?? 0,
        route: ctx.route,
        selectedParagraphIndex: ctx.selectedParagraphIndex,
        viewLens: ctx.viewLens,
        translateOpen: ctx.translateOpen,
        libraryPreview: listArticles(8),
      });
    },
    {
      name: "get_workspace_snapshot",
      description: "Read-only snapshot of the current workspace for grounding.",
      schema: z.object({
        includeLibrary: z
          .boolean()
          .optional()
          .describe("Include a short library preview"),
      }),
    },
  );

  return [
    fetch_and_organize,
    web_search,
    set_view_lens,
    select_paragraph,
    open_translate_editor,
    save_translation,
    check_translation,
    generate_explain,
    explain_selection,
    mark_extraction,
    list_wrong_book,
    open_wrong_item,
    resolve_wrong_item,
    open_article,
    get_workspace_snapshot,
    ...buildPageTools(ctx),
  ];
}
