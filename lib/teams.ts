// 參賽隊伍與選手：getTeams（logo、地區、選手照片）× config/teams-2026.json（種子序、起始階段、世界賽登錄名單）

import { LEAGUE_ORDER, ROLE_ORDER } from "../config/leagues";
import type { ApiPlayer, ApiTeam } from "./api-types";
import { consoleWarn, type Warn } from "./normalize";
import type { Match, Player, Role, Team, TeamProfile } from "./types";

export interface RosterEntry {
  name: string;
  role: Role;
  substitute?: boolean;
}
export interface TeamConfigEntry {
  slug: string; // LoL Esports team slug
  league?: string;
  seed?: number;
  startStage?: "playin" | "swiss";
  pool?: number;
  roster?: RosterEntry[];
  source?: string;
}
export interface TeamsConfig {
  tournamentSlug: string;
  teams: TeamConfigEntry[];
}

const https = (url: string | null | undefined) => (url ? url.replace(/^http:\/\//, "https://") : null);
const asRole = (r: string | undefined): Role | null =>
  r && (ROLE_ORDER as string[]).includes(r) ? (r as Role) : null;

export function teamFromApi(t: ApiTeam): Team {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    logo: https(t.image) ?? "",
    region: t.homeLeague?.region ?? null,
    league: t.homeLeague?.name ?? null,
    seed: null,
  };
}

function toPlayers(api: ApiPlayer[], roster: RosterEntry[] | undefined): Player[] {
  const fromApi = (p: ApiPlayer, substitute = false): Player => ({
    id: p.id,
    name: p.summonerName,
    role: asRole(p.role),
    photo: https(p.image),
    substitute,
  });
  // 沒有登錄名單時，退回 getTeams 的整個組織名單
  const players = roster?.length
    ? roster.map((r) => {
        const p = api.find((x) => x.summonerName.toLowerCase() === r.name.toLowerCase());
        return p
          ? { ...fromApi(p, !!r.substitute), role: asRole(p.role) ?? r.role }
          : { id: `roster:${r.name}`, name: r.name, role: r.role, photo: null, substitute: !!r.substitute };
      })
    : api.map((p) => fromApi(p));
  const rank = (p: Player) => (p.role ? ROLE_ORDER.indexOf(p.role) : ROLE_ORDER.length);
  return players.sort((a, b) => Number(a.substitute) - Number(b.substitute) || rank(a) - rank(b));
}

/**
 * 建立參賽隊伍資料，並把賽區/種子序寫回 Team（與比賽中的 Team 共用同一物件，供 tooltip 使用）。
 * config 為 null 時（例如 2025 fixture），參賽隊伍 = 在比賽中出現過的隊伍。
 */
export function buildProfiles(
  apiTeams: ApiTeam[],
  matchTeams: Map<string, Team>,
  playinMatches: Match[],
  config: TeamsConfig | null,
  warn: Warn = consoleWarn,
): TeamProfile[] {
  const bySlug = new Map(apiTeams.map((t) => [t.slug, t]));
  const entries: { api: ApiTeam; cfg: TeamConfigEntry | null }[] = [];
  if (config) {
    for (const cfg of config.teams) {
      const api = bySlug.get(cfg.slug);
      if (api) entries.push({ api, cfg });
      else warn(`getTeams 找不到設定中的隊伍 ${cfg.slug}`);
    }
  } else {
    for (const api of apiTeams) if (matchTeams.has(api.id)) entries.push({ api, cfg: null });
  }

  const inPlayin = new Set(playinMatches.flatMap((m) => [m.teamA?.id, m.teamB?.id]).filter(Boolean));

  const profiles = entries.map(({ api, cfg }): TeamProfile => {
    let team = matchTeams.get(api.id);
    if (!team) matchTeams.set(api.id, (team = teamFromApi(api)));
    team.league = cfg?.league ?? api.homeLeague?.name ?? team.league;
    team.seed = cfg?.seed ?? null;
    team.region = api.homeLeague?.region ?? team.region;
    return {
      team,
      startStage: cfg?.startStage ?? (playinMatches.length ? (inPlayin.has(api.id) ? "playin" : "swiss") : null),
      pool: cfg?.pool ?? null,
      players: toPlayers(api.players ?? [], cfg?.roster),
    };
  });

  const leagueRank = (l: string | null) => {
    const i = l ? LEAGUE_ORDER.indexOf(l) : -1;
    return i < 0 ? LEAGUE_ORDER.length : i;
  };
  return profiles.sort(
    (a, b) =>
      leagueRank(a.team.league) - leagueRank(b.team.league) ||
      (a.team.league ?? "").localeCompare(b.team.league ?? "") ||
      (a.team.seed ?? 99) - (b.team.seed ?? 99) ||
      a.team.code.localeCompare(b.team.code),
  );
}
