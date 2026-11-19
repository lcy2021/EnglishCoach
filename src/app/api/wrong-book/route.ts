import { NextResponse } from "next/server";
import {
  getWrongItem,
  listWrongItems,
  resolveWrongItem,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unresolvedOnly = searchParams.get("all") !== "1";
  return NextResponse.json({ items: listWrongItems(unresolvedOnly) });
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

export async function PUT(request: Request) {
  const body = (await request.json()) as { id: string };
  const item = getWrongItem(body.id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}
