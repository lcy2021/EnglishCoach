import { NextResponse } from "next/server";
import { continueConverse, startConverse, type ConverseTurn } from "@/lib/converse/converse";
import { drillLevelSpec } from "@/lib/drill/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function readHistory(value: unknown): ConverseTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ConverseTurn[] = [];
  for (const item of value.slice(-12)) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      role?: unknown;
      en?: unknown;
      zh?: unknown;
      feedback?: unknown;
      tip?: unknown;
      native?: unknown;
    };
    const role = row.role === "assistant" || row.role === "user" ? row.role : null;
    const en = typeof row.en === "string" ? row.en.trim() : "";
    if (!role || !en) continue;
    const feedback =
      typeof row.feedback === "string"
        ? row.feedback
        : typeof row.tip === "string"
          ? row.tip
          : undefined;
    turns.push({
      role,
      en,
      zh: typeof row.zh === "string" ? row.zh : undefined,
      feedback,
      native: typeof row.native === "string" ? row.native : undefined,
    });
  }
  return turns;
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    tags?: unknown;
    topic?: unknown;
    difficulty?: unknown;
    history?: unknown;
    message?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const tags = readTags(body.tags);
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (tags.length === 0 && !topic) {
    return NextResponse.json({ error: "先选标签或写下方向" }, { status: 400 });
  }
  const difficulty = drillLevelSpec(
    typeof body.difficulty === "string" ? body.difficulty : "",
  ).level;

  try {
    if (body.action === "start") {
      const reply = await startConverse(tags, difficulty, topic);
      return NextResponse.json({ reply });
    }

    if (body.action === "reply") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        return NextResponse.json({ error: "先写一句英文再发送" }, { status: 400 });
      }
      const reply = await continueConverse(
        tags,
        difficulty,
        topic,
        readHistory(body.history),
        message,
      );
      return NextResponse.json({ reply });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "对话失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
