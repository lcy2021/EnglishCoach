import { NextResponse } from "next/server";
import { deleteArticle, getArticle, listArticlesPage } from "@/lib/db";
import { readPage } from "@/lib/db/page";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const article = getArticle(id);
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ article });
  }
  const pageSize = readPage(searchParams.get("pageSize"), 7);
  const result = listArticlesPage(readPage(searchParams.get("page"), 1), pageSize);
  return NextResponse.json({
    articles: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "缺少文章" }, { status: 400 });
  if (!deleteArticle(id)) {
    return NextResponse.json({ error: "找不到这篇文章" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
