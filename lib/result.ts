// 系列賽結果的一致性：上游各端點（getSchedule 的 state、getStandings 的比分、getEventDetails 的小局）
// 更新時間不一，可能出現「已完賽但比分還沒達到勝場數」的組合（純函式）

import type { GameDetail, MatchGames } from "./games";
import type { Match } from "./types";

/** Bo1 → 1、Bo3 → 2、Bo5 → 3 */
export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1;

/** 比分已分出勝負（有一方達到勝場數）；bestOf 不明時視為完整 */
export const isDecided = (a: number, b: number, bestOf: number) => bestOf <= 0 || (a !== b && Math.max(a, b) >= winsNeeded(bestOf));

export type Score = { scoreA: number; scoreB: number };

export type SeriesResult =
  | ({ kind: "official" } & Score) // 上游正式比分（含未開打、進行中）
  | { kind: "pending" } // 已完賽但比分不完整：結果更新中
  | ({ kind: "provisional" } & Score); // 依小局資料的暫定比分

export function seriesResult(m: Match, provisional: Score | null | undefined): SeriesResult {
  if (!m.resultPending) return { kind: "official", scoreA: m.scoreA, scoreB: m.scoreB };
  return provisional ? { kind: "provisional", ...provisional } : { kind: "pending" };
}

/** 小局資料已判定的勝方加總；有一方達到勝場數才算數 */
export function provisionalFromGames(m: Match, games: MatchGames): Score | null {
  const won = (id: string | undefined) => games.games.filter((g) => g.winner && g[g.winner].teamId === id).length;
  const s = { scoreA: won(m.teamA?.id), scoreB: won(m.teamB?.id) };
  return isDecided(s.scoreA, s.scoreB, m.bestOf) && m.bestOf > 0 ? s : null;
}

/**
 * 小局面板：小局判定的勝方與上游正式比分衝突時以上游為準（清除推估的勝方）並 warn。
 * 結果更新中或未完賽時不比對
 */
export function reconcileGames(m: Match, games: GameDetail[], warn: (msg: string) => void = console.warn): GameDetail[] {
  if (m.state !== "completed" || m.resultPending) return games;
  const won = (id: string | undefined) => games.filter((g) => g.winner && g[g.winner].teamId === id).length;
  const [a, b] = [won(m.teamA?.id), won(m.teamB?.id)];
  // 小局勝方還沒補齊（例如 Leaguepedia 未更新、推估失敗）時只要不超過正式比分就不算衝突
  if (a <= m.scoreA && b <= m.scoreB) return games;
  warn(`[games] ${m.id} 小局勝方 ${a}:${b} 與正式比分 ${m.scoreA}:${m.scoreB} 不符，以正式比分為準`);
  return games.map((g) => (g.winnerSource === "inferred" ? { ...g, winner: null, winnerSource: null } : g));
}
