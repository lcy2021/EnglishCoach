import { streamCoachAgent } from "@/lib/agent/run";
import type { AppRoute, ViewLens } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
    workspace?: {
      articleId: string | null;
      selectedParagraphIndex: number | null;
      viewLens: ViewLens;
      translateOpen: boolean;
      route?: AppRoute;
    };
  };

  if (!body.messages?.length) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      try {
        for await (const event of streamCoachAgent({
          messages: body.messages ?? [],
          workspace: body.workspace ?? {
            articleId: null,
            selectedParagraphIndex: null,
            viewLens: "read",
            translateOpen: false,
            route: "practice",
          },
        })) {
          send(event);
        }
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
