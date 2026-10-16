// 籤表格位：每一格的隊伍由「來源」（哪一場的勝者/敗者）決定，不看 API teams 的順序；
// 比分依 team id 對應。Play-In 與淘汰賽共用

import type { Match, Seat, Team } from "./types";

export interface SeatSource {
  match: Match | undefined; // 來源場次；undefined = 首輪（無來源）
  take: "winner" | "loser";
  label: string; // 隊伍未定時顯示，例如「勝部首輪 A 勝者」
}

export const winnerOf = (m: Match | undefined): Team | null =>
  m?.state === "completed" ? (m.winner === "A" ? m.teamA : m.winner === "B" ? m.teamB : null) : null;
export const loserOf = (m: Match | undefined): Team | null =>
  m?.state === "completed" ? (m.winner === "A" ? m.teamB : m.winner === "B" ? m.teamA : null) : null;

/** 單一隊伍在這場的比分與勝負（依 team id，不依順序） */
function seatOf(m: Match, team: Team | null, placeholder: string | null): Seat {
  if (!team) return { team: null, score: null, result: null, placeholder };
  const isA = m.teamA?.id === team.id;
  const started = m.state !== "unstarted";
  const won = m.state === "completed" && m.winner === (isA ? "A" : "B");
  const lost = m.state === "completed" && m.winner !== null && !won;
  return { team, score: started ? (isA ? m.scoreA : m.scoreB) : null, result: won ? "win" : lost ? "loss" : null, placeholder };
}

/** 首輪或無來源：依 API 原始順序 */
export const seatsInApiOrder = (m: Match): [Seat, Seat] => [seatOf(m, m.teamA, "TBD"), seatOf(m, m.teamB, "TBD")];

/**
 * 依來源決定上下兩格：
 * 1. 來源已產生的隊伍（勝者/敗者）放進對應的格
 * 2. 其餘已知隊伍（來源尚未完賽、或資料與來源不符）依序補進空格
 * 3. 仍為空的格顯示來源文字
 */
export function seatsBySource(m: Match, sources: [SeatSource, SeatSource]): [Seat, Seat] {
  const teams = [m.teamA, m.teamB].filter((t): t is Team => t !== null);
  const seats: (Team | null)[] = [null, null];
  const placed = new Set<string>();
  sources.forEach((s, i) => {
    const expected = s.take === "winner" ? winnerOf(s.match) : loserOf(s.match);
    const t = expected && teams.find((x) => x.id === expected.id);
    if (t) {
      seats[i] = t;
      placed.add(t.id);
    }
  });
  for (const t of teams) {
    if (placed.has(t.id)) continue;
    const free = seats.findIndex((s, i) => s === null && !(sources[i].take === "winner" ? winnerOf(sources[i].match) : loserOf(sources[i].match)));
    const i = free >= 0 ? free : seats.indexOf(null);
    if (i >= 0) {
      seats[i] = t;
      placed.add(t.id);
    }
  }
  return [seatOf(m, seats[0], sources[0].label), seatOf(m, seats[1], sources[1].label)];
}
