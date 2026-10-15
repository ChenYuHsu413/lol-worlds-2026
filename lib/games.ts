// 小局細節正規化（純函式）：live stats + Leaguepedia + Data Dragon → GameDetail

import type { ApiEventDetails } from "./api-types";
import type { DDragonChampionFile, LeaguepediaGameRow, LiveTeamFrame, LiveTeamMeta, LiveWindow } from "./game-api-types";
import type { Player, Role } from "./types";

export type Side = "blue" | "red";

export interface ChampionDict {
  version: string;
  names: Record<string, string>; // Data Dragon id → 繁中官方譯名
}

export interface GamePlayer {
  participantId: number;
  rawName: string; // live stats 原始名稱，例如 "T1 Faker"
  name: string; // 去掉隊伍前綴後的選手 ID
  playerId: string | null; // 對應到「參賽隊伍」頁的 Player.id；對不上為 null
  role: Role | null;
  champion: string; // Data Dragon id
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  gold: number | null;
}

export interface GameSide {
  teamId: string | null;
  players: GamePlayer[];
  kills: number | null;
  towers: number | null;
  inhibitors: number | null;
  barons: number | null;
  dragons: string[] | null;
  gold: number | null;
  bans: string[] | null; // Data Dragon id，依 ban 順序
}

export interface DraftStep {
  side: Side;
  type: "ban" | "pick";
  champion: string;
}

export interface GameDetail {
  id: string;
  number: number;
  state: "completed" | "inProgress" | "unstarted" | "unneeded" | string;
  blue: GameSide;
  red: GameSide;
  winner: Side | null;
  winnerSource: "leaguepedia" | "inferred" | null;
  durationSec: number | null;
  patch: string | null;
  draft: DraftStep[] | null; // 20 步的 ban/pick 順序；無 Leaguepedia 資料時為 null
}

export interface MatchGames {
  matchId: string;
  teams: { id: string; code: string; name: string; gameWins: number }[];
  games: GameDetail[];
  champions: ChampionDict;
  sources: { leaguepedia: boolean };
}

// ---- 英雄 ----

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildChampionDict(zh: DDragonChampionFile): ChampionDict {
  return {
    version: zh.version,
    names: Object.fromEntries(Object.values(zh.data).map((c) => [c.id, c.name])),
  };
}

/** Leaguepedia 英文名稱 → Data Dragon id（依 en_US 名稱比對，忽略大小寫與符號） */
export function englishNameIndex(en: DDragonChampionFile): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of Object.values(en.data)) {
    idx.set(normName(c.name), c.id);
    idx.set(normName(c.id), c.id);
  }
  return idx;
}

export const championImage = (version: string, id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`;

// ---- 選手對應 ----

/** 去掉 live stats 名稱的隊伍代碼前綴：「T1 Faker」→「Faker」 */
export function stripTeamPrefix(raw: string, teamCode: string | null): string {
  if (teamCode && raw.toLowerCase().startsWith(teamCode.toLowerCase() + " ")) return raw.slice(teamCode.length + 1);
  // 代碼不一致時（例如 API 代碼與轉播名稱不同），去掉第一個空白前的字樣
  const i = raw.indexOf(" ");
  return i > 0 ? raw.slice(i + 1) : raw;
}

/** 對應到參賽隊伍頁的選手：先比 esportsPlayerId，再比去前綴後的名稱 */
export function matchPlayer(
  raw: string,
  esportsPlayerId: string,
  teamCode: string | null,
  roster: Player[],
): { name: string; player: Player | null } {
  const name = stripTeamPrefix(raw, teamCode);
  const byId = roster.find((p) => p.id === esportsPlayerId);
  if (byId) return { name: byId.name, player: byId };
  const byName = roster.find((p) => p.name.toLowerCase() === name.toLowerCase());
  return { name, player: byName ?? null };
}

// ---- Leaguepedia 比對 ----

/** 以「開局時間差 ≤ 45 分鐘」加「藍方 5 隻英雄相同」比對到 Leaguepedia 的局 */
export function findLeaguepediaRow(
  start: LiveWindow,
  rows: LeaguepediaGameRow[],
  enIndex: Map<string, string>,
): LeaguepediaGameRow | null {
  const t0 = Date.parse(start.frames[0]?.rfc460Timestamp ?? "");
  const blue = new Set(start.gameMetadata.blueTeamMetadata.participantMetadata.map((p) => p.championId));
  return (
    rows.find((r) => {
      const t = Date.parse(r["DateTime UTC"].replace(" ", "T") + "Z");
      if (!Number.isFinite(t0) || Math.abs(t - t0) > 45 * 60_000) return false;
      const picks = (r.Team1Picks ?? []).map((n) => enIndex.get(normName(n)));
      return picks.length === 5 && picks.every((id) => id && blue.has(id));
    }) ?? null
  );
}

// 2025 起的標準選角順序（B=藍、R=紅）
const BAN_ORDER: [Side, number][] = [["blue", 1], ["red", 1], ["blue", 2], ["red", 2], ["blue", 3], ["red", 3], ["red", 4], ["blue", 4], ["red", 5], ["blue", 5]];
const PICK_ORDER: [Side, number][] = [["blue", 1], ["red", 1], ["red", 2], ["blue", 2], ["blue", 3], ["red", 3], ["red", 4], ["blue", 4], ["blue", 5], ["red", 5]];

function draftFrom(row: LeaguepediaGameRow, enIndex: Map<string, string>): DraftStep[] | null {
  const get = (side: Side, type: "Ban" | "Pick", i: number) => {
    const raw = row[`Team${side === "blue" ? 1 : 2}${type}${i}` as `Team1Ban1`];
    return raw ? (enIndex.get(normName(raw)) ?? null) : null;
  };
  const steps = (order: [Side, number][], type: "ban" | "pick") =>
    order.map(([side, i]) => ({ side, type, champion: get(side, type === "ban" ? "Ban" : "Pick", i) }));
  const all = [...steps(BAN_ORDER.slice(0, 6), "ban"), ...steps(PICK_ORDER.slice(0, 6), "pick"), ...steps(BAN_ORDER.slice(6), "ban"), ...steps(PICK_ORDER.slice(6), "pick")];
  // 沒有 PB 資料（全空）時不顯示；個別空 ban（未禁用）略過
  if (all.every((s) => s.champion === null)) return null;
  return all.filter((s): s is DraftStep => s.champion !== null);
}

// ---- 單局 ----

const roleOf = (r: string): Role | null =>
  (["top", "jungle", "mid", "bottom", "support"] as const).includes(r as Role) ? (r as Role) : null;

export interface GameInput {
  game: ApiEventDetails["match"]["games"][number];
  start: LiveWindow | null;
  end: LiveWindow | null;
  row: LeaguepediaGameRow | null;
}

export function normalizeGame(
  input: GameInput,
  enIndex: Map<string, string>,
  teamCode: (teamId: string) => string | null,
  rosterOf: (teamId: string) => Player[],
): GameDetail {
  const { game, start, end, row } = input;
  const meta = (end ?? start)?.gameMetadata;
  const last = end?.frames.at(-1) ?? null;
  const sideTeam = (side: Side) =>
    meta?.[side === "blue" ? "blueTeamMetadata" : "redTeamMetadata"].esportsTeamId ??
    game.teams.find((t) => t.side === side)?.id ??
    null;

  const buildSide = (side: Side): GameSide => {
    const teamId = sideTeam(side);
    const m: LiveTeamMeta | undefined = meta?.[side === "blue" ? "blueTeamMetadata" : "redTeamMetadata"];
    const f: LiveTeamFrame | undefined = last?.[side === "blue" ? "blueTeam" : "redTeam"];
    const roster = teamId ? rosterOf(teamId) : [];
    const code = teamId ? teamCode(teamId) : null;
    const lpBans = row ? (side === "blue" ? row.Team1Bans : row.Team2Bans) : null;
    return {
      teamId,
      players: (m?.participantMetadata ?? []).map((p) => {
        const pf = f?.participants.find((x) => x.participantId === p.participantId);
        const { name, player } = matchPlayer(p.summonerName, p.esportsPlayerId, code, roster);
        return {
          participantId: p.participantId,
          rawName: p.summonerName,
          name,
          playerId: player?.id ?? null,
          role: roleOf(p.role),
          champion: p.championId,
          kills: pf?.kills ?? null,
          deaths: pf?.deaths ?? null,
          assists: pf?.assists ?? null,
          cs: pf?.creepScore ?? null,
          gold: pf?.totalGold ?? null,
        };
      }),
      kills: f?.totalKills ?? null,
      towers: f?.towers ?? null,
      inhibitors: f?.inhibitors ?? null,
      barons: f?.barons ?? null,
      dragons: f?.dragons ?? null,
      gold: f?.totalGold ?? null,
      bans: lpBans?.length ? lpBans.map((n) => enIndex.get(normName(n))).filter((x): x is string => !!x) : null,
    };
  };

  const blue = buildSide("blue");
  const red = buildSide("red");

  let winner: Side | null = null;
  let winnerSource: GameDetail["winnerSource"] = null;
  if (row?.Winner === 1 || row?.Winner === 2) {
    winner = row.Winner === 1 ? "blue" : "red";
    winnerSource = "leaguepedia";
  } else if (last?.gameState === "finished") {
    // 無 Leaguepedia 時推估：兵營 → 塔 → 金錢；之後再用系列賽比分驗證
    const score = (s: LiveTeamFrame) => [s.inhibitors, s.towers, s.totalGold];
    const [b, r] = [score(last.blueTeam), score(last.redTeam)];
    const cmp = b.map((x, i) => x - r[i]).find((d) => d !== 0) ?? 0;
    if (cmp !== 0) {
      winner = cmp > 0 ? "blue" : "red";
      winnerSource = "inferred";
    }
  }

  const first = start?.frames[0]?.rfc460Timestamp;
  const durationSec =
    row?.["Gamelength Number"] != null
      ? Math.round(row["Gamelength Number"] * 60)
      : first && last
        ? Math.round((Date.parse(last.rfc460Timestamp) - Date.parse(first)) / 1000)
        : null;

  return {
    id: game.id,
    number: game.number,
    state: game.state,
    blue,
    red,
    winner,
    winnerSource,
    durationSec,
    patch: meta?.patchVersion ?? null,
    draft: row ? draftFrom(row, enIndex) : null,
  };
}

/** 推估的勝方加總若與系列賽比分不符，視為不可靠並清除 */
export function verifyInferredWinners(games: GameDetail[], gameWins: Record<string, number>): GameDetail[] {
  const count: Record<string, number> = {};
  for (const g of games) {
    const t = g.winner ? g[g.winner].teamId : null;
    if (t) count[t] = (count[t] ?? 0) + 1;
  }
  const consistent = Object.entries(gameWins).every(([id, n]) => (count[id] ?? 0) === n);
  return consistent
    ? games
    : games.map((g) => (g.winnerSource === "inferred" ? { ...g, winner: null, winnerSource: null } : g));
}

// ---- Fearless ----

export interface FearlessStep {
  beforeGame: number; // 第 n 局開打前
  used: Record<string, string[]>; // teamId → 該隊在先前各局用過的英雄（依局數累加）
}

/** 依局數累加雙方已使用的英雄；第 n 局之前用過的英雄，之後不得再選 */
export function fearless(games: GameDetail[]): FearlessStep[] {
  const used: Record<string, string[]> = {};
  const steps: FearlessStep[] = [];
  for (const g of [...games].sort((a, b) => a.number - b.number)) {
    if (g.blue.players.length === 0 && g.red.players.length === 0) continue;
    steps.push({ beforeGame: g.number, used: Object.fromEntries(Object.entries(used).map(([k, v]) => [k, [...v]])) });
    for (const side of [g.blue, g.red]) {
      if (!side.teamId) continue;
      used[side.teamId] ??= [];
      for (const p of side.players) if (!used[side.teamId].includes(p.champion)) used[side.teamId].push(p.champion);
    }
  }
  return steps;
}

// ---- 整場系列賽 ----

export interface MatchGamesInput {
  event: ApiEventDetails;
  windows: Record<string, { start: LiveWindow | null; end: LiveWindow | null }>;
  leaguepedia: LeaguepediaGameRow[] | null; // null = 取不到（隱藏 Ban/Pick 順序）
  zh: DDragonChampionFile;
  en: DDragonChampionFile;
  rosterOf: (teamId: string) => Player[];
}

export function assembleMatchGames(input: MatchGamesInput): MatchGames {
  const { event, windows, leaguepedia, zh, en, rosterOf } = input;
  const enIndex = englishNameIndex(en);
  const teams = event.match.teams.map((t) => ({ id: t.id, code: t.code, name: t.name, gameWins: t.result?.gameWins ?? 0 }));
  const teamCode = (id: string) => teams.find((t) => t.id === id)?.code ?? null;
  const games = event.match.games
    .filter((g) => g.state !== "unneeded")
    .map((game) => {
      const w = windows[game.id] ?? { start: null, end: null };
      const row = w.start && leaguepedia ? findLeaguepediaRow(w.start, leaguepedia, enIndex) : null;
      return normalizeGame({ game, start: w.start, end: w.end, row }, enIndex, teamCode, rosterOf);
    });
  return {
    matchId: event.id,
    teams,
    games: verifyInferredWinners(games, Object.fromEntries(teams.map((t) => [t.id, t.gameWins]))),
    champions: buildChampionDict(zh),
    sources: { leaguepedia: leaguepedia !== null },
  };
}
