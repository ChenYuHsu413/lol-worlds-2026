import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE, cacheSeconds, type GameDetail } from "../lib/games";
import { bundle, fixture, tournament } from "./helpers";

const FINAL = "113475871524050783"; // 最後一局結束約 2025-11-09 11:20 UTC

// 參賽隊伍名單改用 2025 fixtures，避免打線上 API
vi.mock("../lib/worlds", async (orig) => {
  const mod = await orig<typeof import("../lib/worlds")>();
  return {
    ...mod,
    fixturesEnabled: () => false,
    loadWorlds: async () => ({ data: mod.buildWorldsData(bundle("2025"), tournament("2025"), "t", () => {}), error: null }),
  };
});

let leaguepedia: "empty" | "full" = "empty";
const lpCalls: string[] = [];

function fakeFetch(input: string | URL) {
  const url = new URL(String(input));
  const g = (name: string) => Response.json(fixture("games", name));
  if (url.host === "esports-api.lolesports.com") return g(`eventDetails_${url.searchParams.get("id")}.json`);
  if (url.host === "feed.lolesports.com") {
    const id = url.pathname.split("/").pop();
    // 與真實 feed 相同：未來的 startingTime 回 400（disallowed window）
    const at = url.searchParams.get("startingTime");
    if (at && Date.parse(at) > Date.now()) return new Response('{"errorCode":"BAD_QUERY_PARAMETER"}', { status: 400 });
    return g(`window_${id}_${url.searchParams.has("startingTime") ? "end" : "start"}.json`);
  }
  if (url.host === "lol.fandom.com") {
    lpCalls.push(leaguepedia);
    return Response.json(leaguepedia === "full" ? fixture("games", "leaguepedia_2025_main.json") : []);
  }
  if (url.pathname.endsWith("versions.json")) return g("ddragon_versions.json");
  if (url.pathname.includes("/zh_TW/")) return g("ddragon_champion_zh_TW.json");
  if (url.pathname.includes("/en_US/")) return g("ddragon_champion_en_US.json");
  return new Response("not found", { status: 404 });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (u: string | URL) => fakeFetch(u)));
  vi.stubEnv("ESPORTS_API_KEY", "test-key");
  vi.useFakeTimers({ toFake: ["Date"] });
  lpCalls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Leaguepedia 賽後才補資料的快取策略", () => {
  it("第一次抓不到 Ban/Pick → 快取 10 分鐘；之後抓到 → 改為永久快取", async () => {
    const { loadMatchGames } = await import("../lib/game-source");
    vi.setSystemTime(new Date("2025-11-09T12:00:00Z")); // 賽後不到 1 小時

    leaguepedia = "empty";
    const first = await loadMatchGames(FINAL, null);
    expect(first.cacheSeconds).toBe(CACHE.retry);
    expect(first.data!.games.every((g) => g.draft === null && g.winnerSource === "inferred")).toBe(true);

    vi.setSystemTime(new Date("2025-11-09T12:10:00Z")); // 10 分鐘後重抓
    leaguepedia = "full";
    const second = await loadMatchGames(FINAL, null);
    expect(second.cacheSeconds).toBe(CACHE.forever);
    expect(second.data!.games.every((g) => g.draft?.length === 20 && g.winnerSource === "leaguepedia")).toBe(true);
    expect(lpCalls).toEqual(["empty", "full"]);
  });

  it("超過 24 小時仍不完整 → 停止 10 分鐘重抓，改為快取 1 小時", async () => {
    const { loadMatchGames } = await import("../lib/game-source");
    vi.setSystemTime(new Date("2025-11-11T00:00:00Z"));
    leaguepedia = "empty";
    expect((await loadMatchGames(FINAL, null)).cacheSeconds).toBe(CACHE.giveUp);
  });
});

describe("剛完賽的局（開局未滿 4 小時）", () => {
  it("不送出未來的 startingTime，仍取得終局數據", async () => {
    const { loadMatchGames } = await import("../lib/game-source");
    // 決賽第 1 局 07:32 開打；11:30 時「開局 + 4 小時」仍在未來
    vi.setSystemTime(new Date("2025-11-09T11:30:00Z"));
    leaguepedia = "full";
    const { data } = await loadMatchGames(FINAL, null);
    expect(data!.games.every((g) => g.blue.kills !== null && g.blue.players.every((p) => p.kills !== null))).toBe(true);
  });
});

describe("cacheSeconds", () => {
  const game = (over: Partial<GameDetail>): GameDetail =>
    ({ state: "completed", winnerSource: "leaguepedia", draft: [], endedAt: "2025-11-09T11:00:00Z", ...over }) as GameDetail;
  const now = Date.parse("2025-11-09T12:00:00Z");

  it("進行中 30 秒；尚有未開打的局 60 秒；全部完整 → 永久", () => {
    expect(cacheSeconds([game({}), game({ state: "inProgress" })], now)).toBe(CACHE.live);
    expect(cacheSeconds([game({}), game({ state: "unstarted" })], now)).toBe(CACHE.pending);
    expect(cacheSeconds([], now)).toBe(CACHE.pending);
    expect(cacheSeconds([game({}), game({})], now)).toBe(CACHE.forever);
  });

  it("勝方只是推估或缺 Ban/Pick 都算不完整", () => {
    expect(cacheSeconds([game({ winnerSource: "inferred" })], now)).toBe(CACHE.retry);
    expect(cacheSeconds([game({ draft: null })], now)).toBe(CACHE.retry);
    expect(cacheSeconds([game({ draft: null })], now + 25 * 3600_000)).toBe(CACHE.giveUp);
  });
});
