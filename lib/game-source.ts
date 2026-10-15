// 小局資料抓取（僅伺服器端）：使用者展開系列賽時才呼叫（lazy load）
// 快取：已完賽的局永久快取（force-cache），進行中的局 30 秒

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ApiEventDetails, GetEventDetailsResponse } from "./api-types";
import type { DDragonChampionFile, LeaguepediaGameRow, LiveWindow } from "./game-api-types";
import { assembleMatchGames, type MatchGames } from "./games";
import { apiGet } from "./lolesports";
import type { Player } from "./types";
import { fixturesEnabled, loadWorlds } from "./worlds";

const LIVE = "https://feed.lolesports.com/livestats/v1";
const DDRAGON = "https://ddragon.leagueoflegends.com";
const UA = { "user-agent": "lol-worlds-viz/0.1 (personal project)" };
export const LIVE_GAME_TTL = 30;

const tenSec = (ms: number) => new Date(Math.floor(ms / 10000) * 10000).toISOString().replace(/\.\d+Z$/, "Z");

type Cache = { cache: "force-cache" } | { next: { revalidate: number } };
async function getJson<T>(url: string, cache: Cache, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, ...cache });
    // live stats 對尚無資料的局回傳 204
    if (!res.ok || res.status === 204) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function ddragon(): Promise<{ zh: DDragonChampionFile; en: DDragonChampionFile } | null> {
  const versions = await getJson<string[]>(`${DDRAGON}/api/versions.json`, { next: { revalidate: 86400 } });
  const v = versions?.[0];
  if (!v) return null;
  const [zh, en] = await Promise.all(
    ["zh_TW", "en_US"].map((l) => getJson<DDragonChampionFile>(`${DDRAGON}/cdn/${v}/data/${l}/champion.json`, { cache: "force-cache" })),
  );
  return zh && en ? { zh, en } : null;
}

/** Leaguepedia（Special:CargoExport）：依時間範圍查 ScoreboardGames × PicksAndBansS7 */
async function leaguepedia(from: number, to: number, revalidate: number): Promise<LeaguepediaGameRow[] | null> {
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const fields = [
    "SG.GameId", "SG.Team1", "SG.Team2", "SG.Winner", "SG.DateTime_UTC", "SG.Gamelength_Number",
    "SG.Team1Picks", "SG.Team2Picks", "SG.Team1Bans", "SG.Team2Bans",
    ...[1, 2, 3, 4, 5].flatMap((i) => [`PB.Team1Ban${i}`, `PB.Team2Ban${i}`, `PB.Team1Pick${i}`, `PB.Team2Pick${i}`]),
  ];
  const url = new URL("https://lol.fandom.com/wiki/Special:CargoExport");
  url.search = new URLSearchParams({
    tables: "ScoreboardGames=SG,PicksAndBansS7=PB",
    join_on: "SG.GameId=PB.GameId",
    fields: fields.join(","),
    where: `SG.DateTime_UTC >= "${fmt(from)}" AND SG.DateTime_UTC <= "${fmt(to)}"`,
    limit: "100",
    format: "json",
  }).toString();
  const rows = await getJson<LeaguepediaGameRow[]>(url.toString(), { next: { revalidate } }, UA);
  return Array.isArray(rows) ? rows : null;
}

async function rosterLookup(fixture: string | null): Promise<(teamId: string) => Player[]> {
  const { data } = await loadWorlds(fixture);
  return (teamId) => data?.profiles.find((p) => p.team.id === teamId)?.players ?? [];
}

export interface GamesPayload {
  data: MatchGames | null;
  error: string | null;
  cacheSeconds: number;
}

async function loadLive(matchId: string): Promise<GamesPayload> {
  const ev = await apiGet<GetEventDetailsResponse>("getEventDetails", { id: matchId }, LIVE_GAME_TTL);
  const event: ApiEventDetails = ev.data.event;
  const now = Date.now();
  const windows: Record<string, { start: LiveWindow | null; end: LiveWindow | null }> = {};

  await Promise.all(
    event.match.games
      .filter((g) => g.state === "completed" || g.state === "inProgress")
      .map(async (g) => {
        const done = g.state === "completed";
        const start = await getJson<LiveWindow>(`${LIVE}/window/${g.id}`, done ? { cache: "force-cache" } : { next: { revalidate: LIVE_GAME_TTL } });
        const t0 = start?.frames[0] ? Date.parse(start.frames[0].rfc460Timestamp) : null;
        // 完賽：時間設在結束之後即回傳終局 frame；進行中：取 1 分鐘前（feed 有延遲）
        const at = t0 === null ? null : done ? tenSec(t0 + 4 * 3600_000) : tenSec(now - 60_000);
        const end = at
          ? await getJson<LiveWindow>(`${LIVE}/window/${g.id}?startingTime=${at}`, done ? { cache: "force-cache" } : { next: { revalidate: LIVE_GAME_TTL } })
          : null;
        windows[g.id] = { start, end };
      }),
  );

  const starts = Object.values(windows)
    .map((w) => (w.start?.frames[0] ? Date.parse(w.start.frames[0].rfc460Timestamp) : NaN))
    .filter(Number.isFinite);
  const allDone = event.match.games.every((g) => g.state === "completed" || g.state === "unneeded");
  const [dd, lp, rosterOf] = await Promise.all([
    ddragon(),
    starts.length ? leaguepedia(Math.min(...starts) - 3600_000, Math.max(...starts) + 3600_000, allDone ? 3600 : 600) : Promise.resolve(null),
    rosterLookup(null),
  ]);
  if (!dd) return { data: null, error: "無法取得 Data Dragon 英雄資料", cacheSeconds: 60 };

  const data = assembleMatchGames({ event, windows, leaguepedia: lp, zh: dd.zh, en: dd.en, rosterOf });
  const live = event.match.games.some((g) => g.state === "inProgress");
  // Leaguepedia 常在賽後才補資料：缺資料時 10 分鐘後再試
  const lpComplete = data.games.every((g) => g.draft !== null);
  return { data, error: null, cacheSeconds: live ? LIVE_GAME_TTL : allDone && lpComplete ? 31536000 : 600 };
}

// ---- 開發用 fixtures（fixtures/games/）----

const readFixture = async <T>(name: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "games", name), "utf8")) as T;
  } catch {
    return null;
  }
};

async function loadFixture(matchId: string, fixture: string): Promise<GamesPayload> {
  const ev = await readFixture<GetEventDetailsResponse>(`eventDetails_${matchId}.json`);
  if (!ev) return { data: null, error: "fixtures/games 沒有這場的小局資料（目前有：2025 決賽、八強 T1-AL、瑞士輪 VKS-TSW）", cacheSeconds: 0 };
  const windows: Record<string, { start: LiveWindow | null; end: LiveWindow | null }> = {};
  for (const g of ev.data.event.match.games)
    windows[g.id] = { start: await readFixture(`window_${g.id}_start.json`), end: await readFixture(`window_${g.id}_end.json`) };
  const [zh, en, lp] = await Promise.all([
    readFixture<DDragonChampionFile>("ddragon_champion_zh_TW.json"),
    readFixture<DDragonChampionFile>("ddragon_champion_en_US.json"),
    readFixture<LeaguepediaGameRow[]>("leaguepedia_2025_main.json"),
  ]);
  const data = assembleMatchGames({ event: ev.data.event, windows, leaguepedia: lp, zh: zh!, en: en!, rosterOf: await rosterLookup(fixture) });
  return { data, error: null, cacheSeconds: 0 };
}

export async function loadMatchGames(matchId: string, fixture: string | null): Promise<GamesPayload> {
  if (!/^\d+$/.test(matchId)) return { data: null, error: "match id 不合法", cacheSeconds: 0 };
  if (fixture && fixturesEnabled()) return loadFixture(matchId, fixture);
  try {
    return await loadLive(matchId);
  } catch (err) {
    console.warn("[games] 載入小局失敗", err);
    return { data: null, error: "暫時無法取得小局資料", cacheSeconds: 30 };
  }
}
