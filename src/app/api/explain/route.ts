import { NextResponse } from "next/server";
import { explainParagraph } from "@/lib/explain/paragraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { articleId?: unknown; paragraphIndex?: unknown };
  try {
    body = (await request.json()) as { articleId?: unknown; paragraphIndex?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const articleId = typeof body.articleId === "string" ? body.articleId : "";
  const paragraphIndex =
    typeof body.paragraphIndex === "number" && Number.isInteger(body.paragraphIndex)
      ? body.paragraphIndex
      : -1;
  if (!articleId || paragraphIndex < 0) {
    return NextResponse.json(
      { error: "articleId and paragraphIndex required" },
      { status: 400 },
    );
  }

  try {
    const result = await explainParagraph(articleId, paragraphIndex);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "讲解失败";
    const status = message.startsWith("找不到") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
