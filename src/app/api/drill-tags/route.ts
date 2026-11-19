import { NextResponse } from "next/server";
import { addDrillTag, listDrillTags, removeDrillTag } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tags: listDrillTags() });
}

export async function POST(request: Request) {
  let body: { label?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label : "";
  try {
    const tag = addDrillTag(label);
    return NextResponse.json({ tag, tags: listDrillTags() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "添加失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "缺少标签" }, { status: 400 });
  if (!removeDrillTag(id)) {
    return NextResponse.json({ error: "找不到这个标签" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, tags: listDrillTags() });
}
