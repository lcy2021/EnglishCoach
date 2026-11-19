import { NextResponse } from "next/server";
import { getStats } from "@/lib/db/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? 14);
  return NextResponse.json(getStats(Number.isFinite(days) ? days : 14));
}
