import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDrill, listDrills, saveDrill, updateDrillResult } from "@/lib/db";
import { createDrill, gradeDrill } from "@/lib/drill/drill";
import { drillLevelSpec, type DrillPrompt } from "@/lib/drill/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const drill = getDrill(id);
    if (!drill) return NextResponse.json({ error: "找不到这道题" }, { status: 404 });
    return NextResponse.json({ drill });
  }
  return NextResponse.json({ drills: listDrills() });
}

function asWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 16);
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    industry?: unknown;
    tags?: unknown;
    topic?: unknown;
    difficulty?: unknown;
    zh?: unknown;
    words?: unknown;
    end?: unknown;
    attempt?: unknown;
    id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    if (body.action === "create") {
      const tags = Array.isArray(body.tags)
        ? body.tags
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      const legacy =
        typeof body.industry === "string" ? body.industry.trim() : "";
      if (tags.length === 0 && !topic && !legacy) {
        return NextResponse.json({ error: "先选标签或写下方向" }, { status: 400 });
      }
      const difficulty = drillLevelSpec(
        typeof body.difficulty === "string" ? body.difficulty : "",
      ).level;
      const prompt = await createDrill(
        tags.length > 0 ? tags : legacy ? [legacy] : [],
        difficulty,
        topic,
      );
      const industry =
        [tags.join("、"), topic].filter(Boolean).join(" · ") || legacy;
      const saved = saveDrill({
        id: randomUUID(),
        industry,
        difficulty,
        zh: prompt.zh,
        words: prompt.words,
        end: prompt.end,
        lex: prompt.lex,
      });
      return NextResponse.json(saved);
    }

    if (body.action === "grade") {
      const words = asWords(body.words);
      const zh = typeof body.zh === "string" ? body.zh.trim() : "";
      const end = body.end === "?" || body.end === "!" ? body.end : ".";
      if (!zh || words.length < 4) {
        return NextResponse.json({ error: "题目不完整" }, { status: 400 });
      }
      const prompt: DrillPrompt = { zh, words, end, lex: [] };
      const attempt = asWords(body.attempt);
      const result = await gradeDrill(prompt, attempt);
      const id = typeof body.id === "string" ? body.id : "";
      if (id) updateDrillResult(id, attempt, result.slots, result.summary);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "出题失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
