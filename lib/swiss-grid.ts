// 瑞士輪桌機版「戰績網格」：橫軸為輪次、縱軸依勝敗差對齊（純函式）

import { SWISS } from "../config/format-2026";
import { swissSlotTemplate } from "./swiss";
import type { SwissView, Team } from "./types";

type SwissConfig = typeof SWISS;

export interface GridNode {
  key: string; // "w-l"
  wins: number;
  losses: number;
  kind: "bucket" | "qualified" | "eliminated";
  col: number; // 0 起算；= 已打場數，晉級/淘汰框落在產生它的桶的下一欄
  row: number; // 0 起算；勝敗差越大越上面
}

export interface GridEdge {
  from: string;
  to: string;
  win: boolean; // 勝者往右上、敗者往右下
}

const key = (w: number, l: number) => `${w}-${l}`;

/** 所有戰績桶與晉級/淘汰框的位置，以及桶到下一輪的勝/敗連線 */
export function swissGrid(cfg: SwissConfig = SWISS) {
  const nodes = new Map<string, GridNode>();
  const edges: GridEdge[] = [];
  const node = (w: number, l: number) => {
    const kind = w >= cfg.winsToQualify ? "qualified" : l >= cfg.lossesToEliminate ? "eliminated" : "bucket";
    if (!nodes.has(key(w, l))) nodes.set(key(w, l), { key: key(w, l), wins: w, losses: l, kind, col: w + l, row: cfg.winsToQualify - (w - l) });
  };
  const seen = new Set<string>();
  for (const { wins: w, losses: l } of swissSlotTemplate(cfg)) {
    if (seen.has(key(w, l))) continue;
    seen.add(key(w, l));
    node(w, l);
    node(w + 1, l);
    node(w, l + 1);
    edges.push({ from: key(w, l), to: key(w + 1, l), win: true }, { from: key(w, l), to: key(w, l + 1), win: false });
  }
  const list = [...nodes.values()];
  return {
    nodes: list,
    edges,
    cols: Math.max(...list.map((n) => n.col)) + 1,
    rows: cfg.winsToQualify + cfg.lossesToEliminate + 1,
  };
}

/** 晉級/淘汰框的名額：產生它的桶的場數（例如 3-0 = 2-0 桶的 2 場勝者） */
export function resultCapacity(wins: number, losses: number, cfg: SwissConfig = SWISS): number {
  const [w, l] = wins >= cfg.winsToQualify ? [wins - 1, losses] : [wins, losses - 1];
  return swissSlotTemplate(cfg).filter((s) => s.wins === w && s.losses === l).length;
}

/**
 * 戰績桶中還沒配對的場次：已知會進這一桶的隊伍（目前戰績 = 該桶、且還沒排進該桶的對戰）與剩下的空位。
 * 沒有未配對場次時 open = 0、teams 為空
 */
export function pendingSeats(view: SwissView, wins: number, losses: number): { teams: Team[]; open: number } {
  const slots = view.slots.filter((s) => s.wins === wins && s.losses === losses);
  const unpaired = slots.filter((s) => !s.match.teamA || !s.match.teamB).length;
  if (unpaired === 0) return { teams: [], open: 0 };
  const paired = new Set(slots.flatMap((s) => (s.match.teamA && s.match.teamB ? [s.match.teamA.id, s.match.teamB.id] : [])));
  const teams = view.records
    .filter((r) => r.wins === wins && r.losses === losses && !paired.has(r.team.id))
    .map((r) => r.team);
  return { teams, open: Math.max(0, unpaired * 2 - teams.length) };
}

/** 隊伍已走過的連線（"from>to"），依已完賽場次推得 */
export function teamEdges(view: SwissView, teamId: string): Set<string> {
  const out = new Set<string>();
  for (const s of view.slots) {
    const m = s.match;
    if (m.state !== "completed" || !m.winner) continue;
    const side = m.teamA?.id === teamId ? "A" : m.teamB?.id === teamId ? "B" : null;
    if (!side) continue;
    const won = m.winner === side;
    out.add(`${key(s.wins, s.losses)}>${won ? key(s.wins + 1, s.losses) : key(s.wins, s.losses + 1)}`);
  }
  return out;
}
