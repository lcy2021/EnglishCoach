import { NextResponse } from "next/server";
import { deleteArticle, getArticle, listArticles } from "@/lib/db";

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
  return NextResponse.json({ articles: listArticles() });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "缺少文章" }, { status: 400 });
  if (!deleteArticle(id)) {
    return NextResponse.json({ error: "找不到这篇文章" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
