// 組裝 Worlds 資料：抓取 → 合併 → 各階段視圖。只在伺服器端使用

import { readFile } from "node:fs/promises";
import path from "node:path";
import { SWISS, TOURNAMENT_SLUG, WORLDS_LEAGUE_SLUG } from "../config/format-2026";
import type {
  ApiTournament,
  GetScheduleResponse,
  GetStandingsResponse,
  GetTeamsResponse,
  GetTournamentsResponse,
} from "./api-types";
import { buildKnockout } from "./knockout";
import {
  ApiError,
  fetchSchedulePages,
  findTournament,
  getStandings,
  getTeams,
  liveSchedulePageFetcher,
  tournamentRange,
} from "./lolesports";
import { consoleWarn, mergeMatches, teamSlugs, type RawBundle, type Warn } from "./normalize";
import { buildPlayIn } from "./playin";
import { buildSwiss, crossCheckRecords } from "./swiss";
import { buildProfiles, type TeamsConfig } from "./teams";
import teamsConfig2026 from "../config/teams-2026.json";
import type { DataErrorKind, Match, Stage, WorldsData, WorldsPayload } from "./types";

export const REVALIDATE_LIVE = 60;
export const REVALIDATE_IDLE = 600;

export function isLiveWindow(matches: Match[], now = Date.now()): boolean {
  return matches.some((m) => {
    if (m.state === "inProgress") return true;
    if (m.state === "completed" || !m.startTime) return false;
    const start = Date.parse(m.startTime);
    // 開賽前 15 分鐘起，到預估最長賽程（每局 75 分鐘）結束
    return now >= start - 15 * 60_000 && now <= start + Math.max(m.bestOf, 1) * 75 * 60_000;
  });
}

function currentStage(matches: Match[]): Stage {
  const live = matches.find((m) => m.state === "inProgress");
  if (live) return live.stage;
  const next = matches
    .filter((m) => m.state === "unstarted" && m.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  return next?.stage ?? "knockout";
}

export function buildWorldsData(
  bundle: RawBundle,
  tournament: ApiTournament,
  source: string,
  warn: Warn = consoleWarn,
): WorldsData {
  const range = tournamentRange(tournament);
  const { matches, teams } = mergeMatches(bundle, range, warn);
  const of = (s: Stage) => matches.filter((m) => m.stage === s);

  const swiss = buildSwiss(of("swiss"), warn, SWISS).view;
  const swissIds = new Set(of("swiss").map((m) => m.id));
  crossCheckRecords(swiss.records, bundle.events.filter((e) => swissIds.has(e.match.id)), warn);

  const config = (teamsConfig2026 as TeamsConfig).tournamentSlug === tournament.slug ? (teamsConfig2026 as TeamsConfig) : null;
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const profiles = buildProfiles(bundle.teams, teamMap, of("playin"), config, warn);

  return {
    tournamentId: tournament.id,
    source,
    teams: [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    profiles,
    matches,
    swiss,
    playin: buildPlayIn(of("playin"), warn),
    knockout: buildKnockout(of("knockout"), swiss.records, warn),
    currentStage: currentStage(matches),
    fetchedAt: new Date().toISOString(),
    revalidateSeconds: isLiveWindow(matches) ? REVALIDATE_LIVE : REVALIDATE_IDLE,
  };
}

// ---- 線上資料 ----

let lastGood: WorldsData | null = null; // 同一個 server instance 內最後一次成功的資料

async function loadLive(): Promise<WorldsData> {
  const revalidate = lastGood && !isLiveWindow(lastGood.matches) ? REVALIDATE_IDLE : REVALIDATE_LIVE;
  const { leagueId, tournament } = await findTournament(WORLDS_LEAGUE_SLUG, TOURNAMENT_SLUG);
  const [standings, pages] = await Promise.all([
    getStandings(tournament.id, revalidate),
    fetchSchedulePages(tournament, liveSchedulePageFetcher(leagueId, revalidate)),
  ]);
  const slugs = [...new Set([...teamSlugs(standings), ...(teamsConfig2026 as TeamsConfig).teams.map((t) => t.slug)])];
  // getTeams 補地區、選手名單（快取 1 小時），失敗不影響賽程資料
  const teams = slugs.length
    ? await getTeams(slugs).then((r) => r.data.teams).catch((err) => (consoleWarn("getTeams 失敗", err), []))
    : [];
  return buildWorldsData({ standings, events: pages.flatMap((p) => p.events), teams }, tournament, "live");
}

// ---- 開發用 fixtures（?fixture=2025 / ?fixture=synthetic-xxx）----

const readJson = async <T>(...parts: string[]): Promise<T> =>
  JSON.parse(await readFile(path.join(process.cwd(), "fixtures", ...parts), "utf8")) as T;

interface SyntheticFixture {
  tournamentSlug: string;
  standings: GetStandingsResponse;
  events: GetScheduleResponse["data"]["schedule"]["events"];
  teams: GetTeamsResponse["data"]["teams"];
}

export async function loadFixture(name: string): Promise<WorldsData> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`fixture 名稱不合法：${name}`);
  const tournaments = await readJson<GetTournamentsResponse>("getTournamentsForLeague.json");
  const findT = (slug: string) => {
    const t = tournaments.data.leagues[0].tournaments.find((x) => x.slug === slug);
    if (!t) throw new Error(`fixtures 中找不到 ${slug}`);
    return t;
  };

  if (name.startsWith("synthetic-")) {
    const fx = await readJson<SyntheticFixture>("synthetic", `${name.slice("synthetic-".length)}.json`);
    return buildWorldsData(fx, findT(fx.tournamentSlug), name);
  }
  if (!/^\d{4}$/.test(name)) throw new Error(`未知的 fixture：${name}`);
  const [standings, pages, teams] = await Promise.all([
    readJson<GetStandingsResponse>(`getStandings_${name}.json`),
    readJson<GetScheduleResponse[]>("getSchedule.json"),
    readJson<GetTeamsResponse>(`getTeams_${name}.json`),
  ]);
  return buildWorldsData(
    { standings, events: pages.flatMap((p) => p.data.schedule.events), teams: teams.data.teams },
    findT(`worlds_${name}`),
    `fixture-${name}`,
  );
}

export const fixturesEnabled = () => process.env.NODE_ENV === "development";

function errorKind(err: unknown): DataErrorKind {
  if (err instanceof ApiError) return err.isAuth ? "auth" : err.status === null ? "network" : "upstream";
  return "upstream";
}

const ERROR_MESSAGES: Record<DataErrorKind, string> = {
  auth: "資料來源金鑰失效",
  network: "無法連線到資料來源",
  upstream: "資料來源回應異常",
};

export async function loadWorlds(fixture?: string | null): Promise<WorldsPayload> {
  if (fixture && fixturesEnabled()) {
    try {
      return { data: await loadFixture(fixture), error: null };
    } catch (err) {
      return { data: null, error: { kind: "upstream", message: (err as Error).message } };
    }
  }
  try {
    lastGood = await loadLive();
    return { data: lastGood, error: null };
  } catch (err) {
    consoleWarn("載入資料失敗", err);
    const kind = errorKind(err);
    return { data: lastGood, error: { kind, message: ERROR_MESSAGES[kind] } };
  }
}
