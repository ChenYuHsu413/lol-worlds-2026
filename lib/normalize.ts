// 把 API 資料（standings × schedule × teams）合併成內部模型

import { STAGE_SLUGS } from "../config/format-2026";
import type {
  ApiScheduleEvent,
  ApiStandingsTeam,
  ApiTeam,
  GetStandingsResponse,
} from "./api-types";
import type { Match, MatchState, Stage, Team } from "./types";

export type Warn = (msg: string, detail?: unknown) => void;
export const consoleWarn: Warn = (msg, detail) =>
  detail === undefined ? console.warn(`[worlds] ${msg}`) : console.warn(`[worlds] ${msg}`, detail);

export interface RawBundle {
  standings: GetStandingsResponse;
  events: ApiScheduleEvent[]; // 已翻頁合併的 schedule events（可能含其他年度）
  teams: ApiTeam[];
}

export interface MergeResult {
  matches: Match[];
  teams: Team[];
  standingsOnly: string[]; // standings 有、schedule 配不到的 match id
  scheduleOnly: string[]; // 賽事期間內 schedule 有、standings 沒有的 match id
}

const isTbd = (t: ApiStandingsTeam) => t.id === "0" || t.code === "TBD";

export function mergeMatches(
  bundle: RawBundle,
  range: { start: number; end: number },
  warn: Warn = consoleWarn,
): MergeResult {
  const eventById = new Map(bundle.events.map((e) => [e.match.id, e]));
  const apiById = new Map(bundle.teams.map((t) => [t.id, t]));
  const teams = new Map<string, Team>();

  const toTeam = (t: ApiStandingsTeam): Team | null => {
    if (isTbd(t)) return null;
    let team = teams.get(t.id);
    if (!team) {
      // API 給 http:// 圖片網址，改用 https 避免 mixed content
      const logo = t.image.replace(/^http:\/\//, "https://");
      const home = apiById.get(t.id)?.homeLeague;
      team = { id: t.id, code: t.code, name: t.name, logo, region: home?.region ?? null, league: home?.name ?? null, seed: null };
      teams.set(t.id, team);
    }
    return team;
  };

  const matches: Match[] = [];
  const standingsOnly: string[] = [];
  const seen = new Set<string>();

  for (const stage of bundle.standings.data.standings[0]?.stages ?? []) {
    const internal = STAGE_SLUGS[stage.slug as keyof typeof STAGE_SLUGS] as Stage | undefined;
    if (!internal) {
      warn(`未知的 stage slug「${stage.slug}」，略過其 ${stage.sections.length} 個 section`);
      continue;
    }
    for (const section of stage.sections) {
      for (const m of section.matches) {
        seen.add(m.id);
        const event = eventById.get(m.id);
        if (!event) standingsOnly.push(m.id);
        const [a, b] = m.teams;
        matches.push({
          id: m.id,
          stage: internal,
          round: null,
          bestOf: event?.match.strategy.count ?? 0,
          teamA: a ? toTeam(a) : null,
          teamB: b ? toTeam(b) : null,
          scoreA: a?.result?.gameWins ?? 0,
          scoreB: b?.result?.gameWins ?? 0,
          winner: a?.result?.outcome === "win" ? "A" : b?.result?.outcome === "win" ? "B" : null,
          state: (event?.state ?? m.state) as MatchState,
          startTime: event?.startTime ?? "",
          blockName: event?.blockName ?? stage.name,
        });
      }
    }
  }

  const scheduleOnly = bundle.events
    .filter((e) => {
      const t = Date.parse(e.startTime);
      return t >= range.start && t <= range.end && !seen.has(e.match.id);
    })
    .map((e) => e.match.id);

  if (standingsOnly.length) warn(`standings 有 ${standingsOnly.length} 場在 schedule 配不到`, standingsOnly);
  if (scheduleOnly.length) warn(`schedule 有 ${scheduleOnly.length} 場不在 standings`, scheduleOnly);

  return { matches, teams: [...teams.values()], standingsOnly, scheduleOnly };
}

export function teamSlugs(standings: GetStandingsResponse): string[] {
  const slugs = new Set<string>();
  for (const stage of standings.data.standings[0]?.stages ?? [])
    for (const sec of stage.sections)
      for (const m of sec.matches) for (const t of m.teams) if (!isTbd(t)) slugs.add(t.slug);
  return [...slugs];
}
