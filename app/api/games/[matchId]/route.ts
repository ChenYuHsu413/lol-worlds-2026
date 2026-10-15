import { NextResponse, type NextRequest } from "next/server";
import { loadMatchGames } from "@/lib/game-source";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const payload = await loadMatchGames(matchId, req.nextUrl.searchParams.get("fixture"));
  const s = payload.cacheSeconds;
  return NextResponse.json(payload, {
    status: payload.data ? 200 : 503,
    headers: { "Cache-Control": s > 0 ? `public, s-maxage=${s}, stale-while-revalidate=${Math.min(s, 600)}` : "no-store" },
  });
}
