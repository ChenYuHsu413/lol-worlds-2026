// 瑞士輪「戰績表」：一列一隊，R1–R5 每輪的對手與勝敗（純函式）

import { SWISS } from "../config/format-2026";
import { swissSlotTemplate } from "./swiss";
import type { Match, SwissRecord, SwissView, Team } from "./types";

export interface TableCell {
  match: Match;
  opponent: Team | null;
  result: "win" | "loss" | null; // 進行中為 null
  live: boolean;
  pending: boolean; // 已完賽但結果更新中（不計勝敗）
  score: [number, number] | null; // [己方, 對手]；只有 Bo3 以上顯示
}

export interface TableRow {
  team: Team;
  wins: number;
  losses: number;
  status: SwissRecord["status"];
  rounds: (TableCell | null)[]; // 未打為 null
}

// 官方 Primer 沒有寫同戰績的排名規則，所以同戰績依隊名排序（畫面上會註明）
export const TIEBREAK_NOTE = "同戰績的排序：官方賽制說明未提供同戰績的排名規則，暫依隊名排序。";

export function swissTable(view: SwissView, cfg: typeof SWISS = SWISS): TableRow[] {
  const rounds = Math.max(...swissSlotTemplate(cfg).map((s) => s.round));
  return [...view.records]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.team.name.localeCompare(b.team.name, "en"))
    .map((r) => ({
      team: r.team,
      wins: r.wins,
      losses: r.losses,
      status: r.status,
      rounds: Array.from({ length: rounds }, (_, i) => {
        const m = view.slots.find((s) => s.round === i + 1 && (s.match.teamA?.id === r.team.id || s.match.teamB?.id === r.team.id))?.match;
        if (!m || m.state === "unstarted") return null;
        const isA = m.teamA?.id === r.team.id;
        const winner = m.state === "completed" ? m.winner : null;
        return {
          match: m,
          opponent: isA ? m.teamB : m.teamA,
          result: winner ? ((winner === "A") === isA ? "win" : "loss") : null,
          live: m.state === "inProgress",
          pending: !!m.resultPending,
          score: m.bestOf > 1 && !m.resultPending ? (isA ? [m.scoreA, m.scoreB] : [m.scoreB, m.scoreA]) : null,
        };
      }),
    }));
}
