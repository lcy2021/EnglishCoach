import { NextResponse } from "next/server";
import { streamExplainArticle } from "@/lib/explain/article";
import { explainParagraph } from "@/lib/explain/paragraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export async function POST(request: Request) {
  let body: { articleId?: unknown; paragraphIndex?: unknown };
  try {
    body = (await request.json()) as { articleId?: unknown; paragraphIndex?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const articleId = typeof body.articleId === "string" ? body.articleId : "";
  if (!articleId) {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }

  const hasParagraph =
    typeof body.paragraphIndex === "number" && Number.isInteger(body.paragraphIndex);
  const paragraphIndex = hasParagraph ? (body.paragraphIndex as number) : -1;
  if (hasParagraph && paragraphIndex < 0) {
    return NextResponse.json({ error: "paragraphIndex invalid" }, { status: 400 });
  }

  // Single paragraph stays JSON; whole-article explain streams paragraph by paragraph.
  if (hasParagraph) {
    try {
      const result = await explainParagraph(articleId, paragraphIndex);
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "讲解失败";
      const status = message.startsWith("找不到") ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of streamExplainArticle(articleId)) {
          send(event);
        }
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "讲解失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
