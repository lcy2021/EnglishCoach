import { NextResponse } from "next/server";
import { listWrongItemsPage, resolveWrongItem } from "@/lib/db";
import { readPage } from "@/lib/db/page";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unresolvedOnly = searchParams.get("all") !== "1";
  const result = listWrongItemsPage(
    readPage(searchParams.get("page"), 1),
    readPage(searchParams.get("pageSize"), 6),
    unresolvedOnly,
  );
  return NextResponse.json({
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action: "resolve";
    id: string;
  };
  if (body.action === "resolve") {
    const item = resolveWrongItem(body.id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
