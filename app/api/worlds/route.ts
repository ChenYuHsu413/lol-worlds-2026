import { NextResponse, type NextRequest } from "next/server";
import { loadWorlds, REVALIDATE_LIVE } from "@/lib/worlds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const payload = await loadWorlds(req.nextUrl.searchParams.get("fixture"));
  const maxAge = payload.error ? REVALIDATE_LIVE : (payload.data?.revalidateSeconds ?? REVALIDATE_LIVE);
  return NextResponse.json(payload, {
    status: payload.data ? 200 : 503,
    headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` },
  });
}
