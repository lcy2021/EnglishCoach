import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { saveArticle } from "@/lib/db";
import { fetchAndExtract, organizePlainText } from "@/lib/fetch/extract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      text?: string;
      title?: string;
    };

    const extracted = body.url
      ? await fetchAndExtract(body.url)
      : organizePlainText(body.text ?? "", body.title || "Pasted text");

    const article = saveArticle({
      id: randomUUID(),
      url: extracted.url,
      title: body.title || extracted.title,
      paragraphs: extracted.paragraphs,
    });

    return NextResponse.json({ article, removed: extracted.removed ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
