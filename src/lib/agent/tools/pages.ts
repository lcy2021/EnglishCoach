import { tool } from "@langchain/core/tools";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentSessionContext } from "@/lib/agent/context";
import { pushPatch, reportProgress } from "@/lib/agent/context";
import {
  addDrillTag,
  deleteArticle,
  getDrill,
  listDrillTags,
  lookupArticle,
  searchArticles,
  listDrills,
  saveDrill,
  updateDrillResult,
} from "@/lib/db";
import { getStats } from "@/lib/db/stats";
import { addVocab, deleteVocab, dueVocab, findVocab, listVocab, reviewVocab, vocabSummary } from "@/lib/db/vocab";
import { createDrill, gradeDrill } from "@/lib/drill/drill";
import { DRILL_LEVELS, type DrillPrompt } from "@/lib/drill/parse";
import { GOAL_CHOICES } from "@/lib/goals";
import type { AppRoute, PageCommand, WorkspacePatch } from "@/lib/types";
import type { Rating } from "@/lib/vocab/srs";

const ROUTES = [
  "practice",
  "drill",
  "wrong-book",
  "library",
  "drill-bank",
  "vocab",
  "stats",
  "settings",
] as const satisfies readonly AppRoute[];

const ROUTE_LABEL: Record<AppRoute, string> = {
  practice: "文章阅读",
  drill: "AI出题",
  vocab: "生词本",
  "wrong-book": "复习",
  library: "资产·文章",
  "drill-bank": "资产·题目",
  stats: "学习总览",
  settings: "设置",
};

function showPage(
  ctx: AgentSessionContext,
  route: AppRoute,
  command: Omit<PageCommand, "id" | "route"> = {},
  extra: WorkspacePatch = {},
): void {
  pushPatch(ctx, {
    ...extra,
    route,
    statusMessage: extra.statusMessage ?? `已打开${ROUTE_LABEL[route]}`,
    pageCommand: { id: randomUUID(), route, ...command },
  });
}

const LEVEL_LABELS = ["初中", "高中", "四级", "六级", "考研", "雅思/托福"] as const;

function compactWord(word: { id: string; text: string; gloss: string; box: number; dueAt: string }) {
  return { id: word.id, text: word.text, gloss: word.gloss, box: word.box, dueAt: word.dueAt };
}

export function buildPageTools(ctx: AgentSessionContext) {
  const navigate = tool(
    async ({ route }) => {
      const refresh =
        route === "library"
          ? (["library"] as const)
          : route === "drill-bank"
            ? (["drill-bank"] as const)
            : route === "wrong-book"
              ? (["wrong-book"] as const)
              : route === "drill"
                ? (["drill"] as const)
                : route === "vocab"
                  ? (["vocab"] as const)
                  : route === "stats"
                    ? (["stats"] as const)
                    : undefined;
      showPage(ctx, route, refresh ? { refresh: [...refresh] } : {});
      return JSON.stringify({ ok: true, route, label: ROUTE_LABEL[route] });
    },
    {
      name: "navigate",
      description:
        "Open a bare page only when no specialized tool fits. Routes: practice (文章阅读), drill (AI出题), vocab (生词本), wrong-book (复习/错题), library (资产·文章), drill-bank (资产·题目), stats (学习总览), settings (设置). Prefer list_vocab (incl. startReview for 复习生词), list_wrong_book, list_library, list_drills, get_stats, create_drill, or update_settings instead.",
      schema: z.object({ route: z.enum(ROUTES) }),
    },
  );

  const list_library = tool(
    async ({ query }) => {
      const articles = searchArticles(query ?? "", 20).map((item) => ({
          id: item.id,
          title: item.title,
          paragraphCount: item.paragraphCount,
          updatedAt: item.updatedAt,
        }));
      showPage(ctx, "library", { refresh: ["library"] });
      return JSON.stringify({ count: articles.length, articles });
    },
    {
      name: "list_library",
      description:
        "Open 资产·文章 and list saved articles. Prefer this over navigate(library). Optional title filter.",
      schema: z.object({ query: z.string().optional() }),
    },
  );

  const delete_article = tool(
    async ({ articleId, title }) => {
      const target = lookupArticle(articleId || title || "");
      if (!target) throw new Error("找不到这篇文章");
      if (!deleteArticle(target.id)) throw new Error("删除失败");
      const cleared = ctx.articleId === target.id;
      showPage(
        ctx,
        "library",
        { refresh: ["library"] },
        cleared
          ? {
              article: null,
              selectedParagraphIndex: null,
              viewLens: "read",
              translateOpen: false,
              explainExtractions: [],
              statusMessage: `已删除《${target.title}》`,
            }
          : { statusMessage: `已删除《${target.title}》` },
      );
      return JSON.stringify({ ok: true, id: target.id, title: target.title });
    },
    {
      name: "delete_article",
      description: "Delete a saved article by id or title, then show the library.",
      schema: z.object({
        articleId: z.string().optional(),
        title: z.string().optional(),
      }),
    },
  );

  const create_drill = tool(
    async ({ tags, topic, difficulty }) => {
      const chosen = (tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
      const extra = (topic ?? "").trim();
      if (chosen.length === 0 && !extra) {
        throw new Error("需要至少一个标签或一个出题方向");
      }
      for (const tag of chosen) addDrillTag(tag);
      reportProgress(ctx, "正在出题");
      const level = DRILL_LEVELS.includes(difficulty as (typeof DRILL_LEVELS)[number])
        ? (difficulty as (typeof DRILL_LEVELS)[number])
        : "进阶";
      const prompt = await createDrill(chosen.length > 0 ? chosen : extra ? [extra] : [], level, extra);
      const industry = [chosen.join("、"), extra].filter(Boolean).join(" · ");
      const saved = saveDrill({
        id: randomUUID(),
        industry,
        difficulty: level,
        zh: prompt.zh,
        words: prompt.words,
        end: prompt.end,
        lex: prompt.lex,
      });
      showPage(ctx, "drill", { drillId: saved.id, refresh: ["drill"] }, { statusMessage: "题目已出好", deliver: { target: "drill-question", text: saved.zh } });
      return JSON.stringify({
        ok: true,
        id: saved.id,
        zh: saved.zh,
        wordCount: saved.words.length,
        lexCount: saved.lex.length,
        difficulty: saved.difficulty,
        industry: saved.industry,
      });
    },
    {
      name: "create_drill",
      description:
        "Create one Chinese-to-English fill-in drill and open it. Use for 出一道题 / 开始练习 — not navigate(drill). Tags can be 生活用语, 职场, 四级, or a new label. Difficulty is 入门, 进阶, or 较难.",
      schema: z.object({
        tags: z.array(z.string()).optional(),
        topic: z.string().optional().describe("Extra direction, such as 面试自我介绍"),
        difficulty: z.enum(DRILL_LEVELS).optional(),
      }),
    },
  );

  const list_drills = tool(
    async () => {
      const drills = listDrills(40).map((item) => ({
        id: item.id,
        industry: item.industry,
        difficulty: item.difficulty,
        zh: item.zh,
        graded: item.graded,
      }));
      const tags = listDrillTags().map((tag) => tag.label);
      showPage(ctx, "drill-bank", { refresh: ["drill-bank"] });
      return JSON.stringify({ tags, drills });
    },
    {
      name: "list_drills",
      description:
        "Open 资产·题目 and list saved drills plus available tags. Prefer this over navigate(drill-bank).",
      schema: z.object({}),
    },
  );

  const open_drill = tool(
    async ({ id }) => {
      const drill = getDrill(id);
      if (!drill) throw new Error("找不到这道题");
      showPage(ctx, "drill", { drillId: drill.id }, { statusMessage: "已打开这道题" });
      return JSON.stringify({
        ok: true,
        id: drill.id,
        zh: drill.zh,
        wordCount: drill.words.length,
        graded: Boolean(drill.grades),
        summary: drill.summary,
      });
    },
    {
      name: "open_drill",
      description: "Open a saved drill by id on the drill page.",
      schema: z.object({ id: z.string() }),
    },
  );

  const grade_drill = tool(
    async ({ id, attempt }) => {
      const drill = getDrill(id);
      if (!drill) throw new Error("找不到这道题");
      if (attempt.length !== drill.words.length) {
        throw new Error(`这道题有 ${drill.words.length} 个空，答案词数对不上`);
      }
      const prompt: DrillPrompt = { zh: drill.zh, words: drill.words, end: drill.end, lex: drill.lex };
      reportProgress(ctx, "正在批改");
      const result = await gradeDrill(prompt, attempt);
      updateDrillResult(id, attempt, result.slots, result.summary);
      showPage(ctx, "drill", { drillId: id, refresh: ["drill"] }, { statusMessage: "批改完成", deliver: { target: "drill-result", text: result.summary } });
      return JSON.stringify({ ok: true, summary: result.summary, slots: result.slots });
    },
    {
      name: "grade_drill",
      description:
        "Grade a drill only when the user supplied their English attempt, one token per blank. Do not invent the attempt.",
      schema: z.object({
        id: z.string(),
        attempt: z.array(z.string()).min(4).max(16),
      }),
    },
  );

  const list_vocab = tool(
    async ({ query, dueOnly, startReview }) => {
      const reviewing = Boolean(startReview);
      const dueList = dueOnly || reviewing;
      const words = (dueList ? dueVocab(20) : listVocab(query ?? "", 20)).map(compactWord);
      const summary = vocabSummary();
      showPage(
        ctx,
        "vocab",
        {
          refresh: ["vocab"],
          vocab: {
            tab: dueList || !query ? "review" : "all",
            query: reviewing ? "" : (query ?? ""),
            startReview: reviewing,
          },
        },
        {
          statusMessage: reviewing
            ? summary.due > 0
              ? "已开始复习生词"
              : "生词本已打开，暂无到期词"
            : undefined,
        },
      );
      return JSON.stringify({
        total: summary.total,
        due: summary.due,
        mastered: summary.mastered,
        startedReview: reviewing,
        words,
      });
    },
    {
      name: "list_vocab",
      description:
        "Open the word book on the page. For 开始复习生词 / 复习生词 / 背单词, pass startReview true so the card session starts (not navigate). dueOnly lists words due now. Without startReview, only the book opens.",
      schema: z.object({
        query: z.string().optional(),
        dueOnly: z.boolean().optional().describe("List due words without starting the card session."),
        startReview: z
          .boolean()
          .optional()
          .describe("True starts the on-page review session with due words. Required for 开始复习生词."),
      }),
    },
  );

  const add_vocab = tool(
    async ({ text, gloss, sentence }) => {
      const word = addVocab({
        text,
        gloss,
        sentence,
        articleId: ctx.articleId,
        source: "coach",
      });
      const summary = vocabSummary();
      showPage(
        ctx,
        "vocab",
        { refresh: ["vocab"], vocab: { tab: "all", query: word.text } },
        { statusMessage: `已加入生词「${word.text}」` },
      );
      return JSON.stringify({ ok: true, word: compactWord(word), due: summary.due, total: summary.total });
    },
    {
      name: "add_vocab",
      description: "Save a word or phrase into the word book and show it.",
      schema: z.object({
        text: z.string().min(1),
        gloss: z.string().optional(),
        sentence: z.string().optional(),
      }),
    },
  );

  const review_vocab = tool(
    async ({ id, text, rating }) => {
      const word = findVocab(id || text || "");
      if (!word) throw new Error("生词本里没有这个词");
      const updated = reviewVocab(word.id, rating as Rating);
      showPage(
        ctx,
        "vocab",
        { refresh: ["vocab"], vocab: { tab: "review" } },
        { statusMessage: `已记录「${updated.text}」：${rating}` },
      );
      return JSON.stringify({ ok: true, word: compactWord(updated) });
    },
    {
      name: "review_vocab",
      description:
        "Record one rating after the user already judged a word: again (忘了), hard (模糊), good (记得). Does not start a review session — use list_vocab with startReview for that.",
      schema: z.object({
        id: z.string().optional(),
        text: z.string().optional(),
        rating: z.enum(["again", "hard", "good"]),
      }),
    },
  );

  const remove_vocab = tool(
    async ({ id, text }) => {
      const word = findVocab(id || text || "");
      if (!word) throw new Error("生词本里没有这个词");
      deleteVocab(word.id);
      showPage(
        ctx,
        "vocab",
        { refresh: ["vocab"], vocab: { tab: "all", query: "" } },
        { statusMessage: `已从生词本移除「${word.text}」` },
      );
      return JSON.stringify({ ok: true, text: word.text });
    },
    {
      name: "remove_vocab",
      description: "Remove a word from the word book by id or exact text.",
      schema: z.object({
        id: z.string().optional(),
        text: z.string().optional(),
      }),
    },
  );

  const get_stats = tool(
    async ({ days }) => {
      const span = days === 0 || days === 7 || days === 14 || days === 30 ? days : 14;
      const stats = getStats(span);
      const tokens = stats.window.input + stats.window.output;
      showPage(ctx, "stats", { statsDays: span, refresh: ["stats"] }, { statusMessage: "已打开学习总览" });
      return JSON.stringify({
        days: span,
        tokens,
        input: stats.window.input,
        output: stats.window.output,
        today: stats.today,
        window: stats.window,
        allTime: stats.allTime,
        streakDays: stats.streakDays,
      });
    },
    {
      name: "get_stats",
      description:
        "Open 学习总览 and return the token total shown there. Prefer this over navigate(stats) for 打开学习总览 / 看统计 / token 用量. Pass days 0 for the all-time total (the page selects the all-time range). Pass 7, 14, or 30 for that many days; omit days for 14. tokens is input plus output for that range and matches the page. For days 0, tokens equals allTime.tokens. Quote tokens. Never quote today's tokens for an all-time question, and never say the total is unknown.",
      schema: z.object({
        days: z
          .union([z.literal(0), z.literal(7), z.literal(14), z.literal(30)])
          .optional()
          .describe("0 is all-time. 7, 14, or 30 is that window. Omit for 14 days."),
      }),
    },
  );

  const update_settings = tool(
    async ({ goal, level, highlight, accent, rate, autoPlay }) => {
      const settings: NonNullable<PageCommand["settings"]> = {};
      if (goal !== undefined) {
        if (!(GOAL_CHOICES as readonly number[]).includes(goal)) {
          throw new Error("每日目标只能是 1、3、5 或 10");
        }
        settings.goal = goal;
      }
      if (level !== undefined) {
        const aliases: Record<string, number> = { 雅思: 6, 托福: 6 };
        const rank =
          typeof level === "number"
            ? level
            : (aliases[level] ?? LEVEL_LABELS.indexOf(level as (typeof LEVEL_LABELS)[number]) + 1);
        if (rank < 1 || rank > LEVEL_LABELS.length) {
          throw new Error("水平可以是 初中、高中、四级、六级、考研、雅思/托福");
        }
        settings.level = rank;
      }
      if (highlight !== undefined) settings.highlight = highlight;
      if (accent) settings.accent = accent;
      if (rate !== undefined) settings.rate = Math.min(1.2, Math.max(0.6, Math.round(rate * 10) / 10));
      if (autoPlay !== undefined) settings.autoPlay = autoPlay;
      if (Object.keys(settings).length === 0) throw new Error("没有要修改的设置");
      showPage(ctx, "settings", { settings }, { statusMessage: "设置已更新" });
      return JSON.stringify({ ok: true, settings });
    },
    {
      name: "update_settings",
      description:
        "Change settings and open the settings page. Prefer this over navigate(settings) when the user asked to change a value. goal is 1, 3, 5, or 10. level is 初中, 高中, 四级, 六级, 考研, or 雅思/托福. accent is en-US or en-GB. rate is 0.6 to 1.2. autoPlay reads a vocab card aloud. highlight marks words above the learner's level.",
      schema: z.object({
        goal: z.number().int().optional(),
        level: z.union([z.number().int(), z.string()]).optional(),
        highlight: z.boolean().optional(),
        accent: z.enum(["en-US", "en-GB"]).optional(),
        rate: z.number().optional(),
        autoPlay: z.boolean().optional(),
      }),
    },
  );

  return [
    navigate,
    list_library,
    delete_article,
    create_drill,
    list_drills,
    open_drill,
    grade_drill,
    list_vocab,
    add_vocab,
    review_vocab,
    remove_vocab,
    get_stats,
    update_settings,
  ];
}
