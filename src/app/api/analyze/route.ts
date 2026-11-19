import { NextResponse } from "next/server";
import { ecdictReady, lookupEntries } from "@/lib/glossary/ecdict";
import { analyzeParagraphs } from "@/lib/glossary/level";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PARAGRAPHS = 400;
const MAX_CHARS = 6000;

export async function POST(request: Request) {
  let body: { paragraphs?: unknown; level?: unknown };
  try {
    body = (await request.json()) as { paragraphs?: unknown; level?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!ecdictReady()) {
    return NextResponse.json({ error: "ECDICT database missing" }, { status: 503 });
  }
  const paragraphs = Array.isArray(body.paragraphs)
    ? body.paragraphs
        .filter((item): item is string => typeof item === "string")
        .slice(0, MAX_PARAGRAPHS)
        .map((text) => text.slice(0, MAX_CHARS))
    : [];
  const level = Math.min(Math.max(Math.round(Number(body.level) || 3), 1), 7);
  return NextResponse.json(analyzeParagraphs(paragraphs, level, lookupEntries));
}
