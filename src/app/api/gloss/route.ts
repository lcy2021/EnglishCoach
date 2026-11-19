import { NextResponse } from "next/server";
import { ecdictReady, glossParagraph } from "@/lib/glossary/ecdict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_LIMIT = 400;

export async function POST(request: Request) {
  let body: { tokens?: unknown };
  try {
    body = (await request.json()) as { tokens?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const tokens = Array.isArray(body.tokens)
    ? body.tokens.filter((item): item is string => typeof item === "string").slice(0, TOKEN_LIMIT)
    : [];
  if (!ecdictReady()) {
    return NextResponse.json(
      { error: "ECDICT database missing", items: [], source: "ecdict" },
      { status: 503 },
    );
  }
  return NextResponse.json({ items: glossParagraph(tokens), source: "ecdict" });
}
