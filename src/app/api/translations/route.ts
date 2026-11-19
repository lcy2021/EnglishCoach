import { NextResponse } from "next/server";
import { getTranslation, saveTranslation } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");
  const paragraphIndex = Number(searchParams.get("paragraphIndex"));
  if (!articleId || Number.isNaN(paragraphIndex)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  return NextResponse.json({
    translation: getTranslation(articleId, paragraphIndex),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    articleId: string;
    paragraphIndex: number;
    draftZh: string;
  };
  const saved = saveTranslation(body);
  return NextResponse.json({ translation: saved });
}
