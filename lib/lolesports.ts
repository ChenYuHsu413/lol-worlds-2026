// LoL Esports persisted/gw API client（僅在伺服器端使用）

import type {
  ApiTournament,
  GetLeaguesResponse,
  GetScheduleResponse,
  GetStandingsResponse,
  GetTeamsResponse,
  GetTournamentsResponse,
} from "./api-types";

const BASE = "https://esports-api.lolesports.com/persisted/gw";
const HL = "zh-TW";

export class ApiError extends Error {
  status: number | null; // null = 網路錯誤
  constructor(status: number | null, message: string) {
    super(message);
    this.status = status;
  }
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

function apiKey(): string {
  const key = process.env.ESPORTS_API_KEY;
  if (!key) throw new ApiError(401, "未設定 ESPORTS_API_KEY");
  return key;
}

export async function apiGet<T>(
  endpoint: string,
  params: Record<string, string>,
  revalidate: number,
): Promise<T> {
  const qs = new URLSearchParams({ hl: HL, ...params });
  let res: Response;
  try {
    res = await fetch(`${BASE}/${endpoint}?${qs}`, {
      headers: { "x-api-key": apiKey() },
      next: { revalidate },
    });
  } catch (err) {
    throw new ApiError(null, `${endpoint} 連線失敗：${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(res.status, `${endpoint} 回應 ${res.status}`);
  return res.json() as Promise<T>;
}

export async function findTournament(leagueSlug: string, tournamentSlug: string) {
  const leagues = await apiGet<GetLeaguesResponse>("getLeagues", {}, 86400);
  const league = leagues.data.leagues.find((l) => l.slug === leagueSlug);
  if (!league) throw new ApiError(404, `找不到聯賽 ${leagueSlug}`);
  const res = await apiGet<GetTournamentsResponse>(
    "getTournamentsForLeague",
    { leagueId: league.id },
    3600,
  );
  const tournament = res.data.leagues[0]?.tournaments.find((t) => t.slug === tournamentSlug);
  if (!tournament) throw new ApiError(404, `找不到賽事 ${tournamentSlug}`);
  return { leagueId: league.id, tournament };
}

export function getStandings(tournamentId: string, revalidate: number) {
  return apiGet<GetStandingsResponse>("getStandings", { tournamentId }, revalidate);
}

export function getTeams(slugs: string[]) {
  return apiGet<GetTeamsResponse>("getTeams", { id: slugs.join(",") }, 86400);
}

// ---- getSchedule 分頁 ----
// getSchedule 以 league 為單位跨年度分頁，無 token 時回傳「目前」頁。
// 只翻到涵蓋賽事起訖日期的頁面為止，並快取這組 token（token 綁定 event id，翻頁結果穩定）。

type SchedulePage = GetScheduleResponse["data"]["schedule"];
export type PageFetcher = (pageToken: string | null) => Promise<SchedulePage>;

const MAX_PAGES = 10;
const tokenCache = new Map<string, (string | null)[]>();

export function tournamentRange(t: ApiTournament) {
  // startDate/endDate 為日期字串；前後各放寬一天以涵蓋美洲當地時間跨日
  const start = new Date(`${t.startDate}T00:00:00Z`).getTime() - 86400_000;
  const end = new Date(`${t.endDate}T23:59:59Z`).getTime() + 86400_000;
  return { start, end };
}

function covers(pages: SchedulePage[], range: { start: number; end: number }) {
  const first = pages[0];
  const last = pages[pages.length - 1];
  const earliest = first.events[0] ? Date.parse(first.events[0].startTime) : Infinity;
  const lastEvent = last.events[last.events.length - 1];
  const latest = lastEvent ? Date.parse(lastEvent.startTime) : -Infinity;
  return (earliest <= range.start || !first.pages.older) && (latest >= range.end || !last.pages.newer);
}

export async function fetchSchedulePages(
  t: ApiTournament,
  fetchPage: PageFetcher,
): Promise<SchedulePage[]> {
  const range = tournamentRange(t);

  const cached = tokenCache.get(t.id);
  if (cached) {
    const pages = await Promise.all(cached.map(fetchPage));
    if (covers(pages, range)) return pages;
  }

  const current = await fetchPage(null);
  const tokens: (string | null)[] = [null];
  const pages = [current];

  let page = current;
  while (page.pages.older && pages.length < MAX_PAGES) {
    const earliest = page.events[0] ? Date.parse(page.events[0].startTime) : Infinity;
    if (earliest <= range.start) break;
    const token = page.pages.older;
    page = await fetchPage(token);
    tokens.unshift(token);
    pages.unshift(page);
  }

  page = current;
  while (page.pages.newer && pages.length < MAX_PAGES) {
    const last = page.events[page.events.length - 1];
    if (last && Date.parse(last.startTime) >= range.end) break;
    const token = page.pages.newer;
    page = await fetchPage(token);
    if (page.events.length === 0) break;
    tokens.push(token);
    pages.push(page);
  }

  tokenCache.set(t.id, tokens);
  return pages;
}

export function liveSchedulePageFetcher(leagueId: string, revalidate: number): PageFetcher {
  return async (pageToken) => {
    const params: Record<string, string> = { leagueId };
    if (pageToken) params.pageToken = pageToken;
    const res = await apiGet<GetScheduleResponse>("getSchedule", params, revalidate);
    return res.data.schedule;
  };
}
