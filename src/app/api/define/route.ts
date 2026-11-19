import { NextResponse } from "next/server";
import { defineTokens, ecdictReady } from "@/lib/glossary/ecdict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_LIMIT = 400;

interface DefineBody {
  tokens?: unknown;
  index?: unknown;
  word?: unknown;
}

function missingDictionary(index: number) {
  return NextResponse.json(
    {
      error: "ECDICT database missing",
      gloss: "本地词典未就绪",
      phrase: "",
      phonetic: "",
      start: index,
      end: index,
      source: "ecdict",
    },
    { status: 503 },
  );
}

function lookup(tokens: string[], index: number) {
  if (!ecdictReady()) return missingDictionary(index);
  const hit = defineTokens(tokens, index);
  if (!hit) {
    return NextResponse.json({
      phrase: tokens[index] ?? "",
      gloss: "未收录",
      phonetic: "",
      start: index,
      end: index,
      source: "ecdict",
    });
  }
  return NextResponse.json({ ...hit, source: "ecdict" });
}

export async function POST(request: Request) {
  let body: DefineBody;
  try {
    body = (await request.json()) as DefineBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const tokens = Array.isArray(body.tokens)
    ? body.tokens.filter((item): item is string => typeof item === "string").slice(0, TOKEN_LIMIT)
    : [];
  const index = typeof body.index === "number" ? body.index : Number(body.index);
  if (!Number.isInteger(index)) {
    return NextResponse.json({ error: "index required" }, { status: 400 });
  }
  return lookup(tokens, index);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const word = (searchParams.get("word") ?? "").trim();
  if (!word) {
    return NextResponse.json({ error: "word required" }, { status: 400 });
  }
  return lookup([word], 0);
}
