// 瑞士輪：由已完賽場次重建輪次、戰績桶與隊伍戰績

import { SWISS } from "../config/format-2026";
import type { ApiScheduleEvent } from "./api-types";
import { consoleWarn, type Warn } from "./normalize";
import type { Match, SwissRecord, SwissSlot, SwissView, Team } from "./types";

type Bucket = { round: number; wins: number; losses: number };
type SwissConfig = typeof SWISS;

// 由隊伍數與勝敗門檻推算每輪每個戰績桶的場數，依「同輪內勝場多者在前」排序。
// 16 隊、3 勝 3 敗 → 8 / 8 / 8 / 6 / 3 = 33 場
export function swissSlotTemplate(cfg: SwissConfig = SWISS): Bucket[] {
  let counts = new Map<string, number>([["0-0", cfg.teams]]);
  const slots: Bucket[] = [];
  for (let round = 1; counts.size > 0; round++) {
    const next = new Map<string, number>();
    const add = (w: number, l: number, n: number) => {
      if (w >= cfg.winsToQualify || l >= cfg.lossesToEliminate) return;
      next.set(`${w}-${l}`, (next.get(`${w}-${l}`) ?? 0) + n);
    };
    const buckets = [...counts.entries()]
      .map(([k, n]) => {
        const [w, l] = k.split("-").map(Number);
        return { w, l, n };
      })
      .sort((x, y) => y.w - x.w || x.l - y.l);
    for (const { w, l, n } of buckets) {
      const games = Math.floor(n / 2);
      for (let i = 0; i < games; i++) slots.push({ round, wins: w, losses: l });
      add(w + 1, l, games);
      add(w, l + 1, games);
    }
    counts = next;
  }
  return slots;
}

const byId = (a: Match, b: Match) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
const byTime = (a: Match, b: Match) => a.startTime.localeCompare(b.startTime) || byId(a, b);

export interface SwissBuild {
  view: SwissView;
  mismatches: { matchId: string; actual: Bucket; guess: Bucket }[];
}

export function buildSwiss(
  swissMatches: Match[],
  warn: Warn = consoleWarn,
  cfg: SwissConfig = SWISS,
): SwissBuild {
  const template = swissSlotTemplate(cfg);
  const sorted = [...swissMatches].sort(byId);
  if (sorted.length !== template.length)
    warn(`瑞士輪場數 ${sorted.length} 與賽制推算 ${template.length} 不符，id 推測可能失準`);
  const guess = new Map<string, Bucket>();
  sorted.forEach((m, i) => template[i] && guess.set(m.id, template[i]));

  // 逐場累計賽前戰績
  const records = new Map<string, { team: Team; wins: number; losses: number }>();
  const rec = (t: Team) => {
    let r = records.get(t.id);
    if (!r) records.set(t.id, (r = { team: t, wins: 0, losses: 0 }));
    return r;
  };
  const actual = new Map<string, Bucket>();
  const known = (m: Match) => m.teamA ?? m.teamB;

  for (const m of [...swissMatches].filter((x) => x.state === "completed").sort(byTime)) {
    if (!m.teamA || !m.teamB) {
      warn(`已完賽的瑞士輪場次 ${m.id} 缺隊伍資料`);
      continue;
    }
    const a = rec(m.teamA);
    const b = rec(m.teamB);
    if (a.wins !== b.wins || a.losses !== b.losses)
      warn(`瑞士輪 ${m.id} 雙方賽前戰績不同：${m.teamA.code} ${a.wins}-${a.losses} vs ${m.teamB.code} ${b.wins}-${b.losses}`);
    actual.set(m.id, { round: a.wins + a.losses + 1, wins: a.wins, losses: a.losses });
    if (m.winner === "A") (a.wins++, b.losses++);
    else if (m.winner === "B") (b.wins++, a.losses++);
  }

  // 未完賽但隊伍已知：賽前戰績 = 目前戰績
  for (const m of swissMatches) {
    if (m.state === "completed") continue;
    for (const t of [m.teamA, m.teamB]) if (t) rec(t);
    const t = known(m);
    if (!t) continue;
    const r = rec(t);
    actual.set(m.id, { round: r.wins + r.losses + 1, wins: r.wins, losses: r.losses });
  }

  const mismatches: SwissBuild["mismatches"] = [];
  const slots: SwissSlot[] = [];
  for (const m of sorted) {
    const g = guess.get(m.id);
    const a = actual.get(m.id);
    if (a && g && (a.round !== g.round || a.wins !== g.wins || a.losses !== g.losses)) {
      mismatches.push({ matchId: m.id, actual: a, guess: g });
      warn(`瑞士輪 ${m.id} 重算位置 R${a.round} ${a.wins}-${a.losses} 與 id 推測 R${g.round} ${g.wins}-${g.losses} 不一致`);
    }
    const b = a ?? g;
    if (!b) continue;
    m.round = b.round;
    slots.push({ match: m, round: b.round, wins: b.wins, losses: b.losses, provisional: !a });
  }

  const swissRecords: SwissRecord[] = [...records.values()].map((r) => ({
    ...r,
    status:
      r.wins >= cfg.winsToQualify ? "qualified" : r.losses >= cfg.lossesToEliminate ? "eliminated" : "alive",
  }));
  swissRecords.sort((x, y) => y.wins - x.wins || x.losses - y.losses || x.team.code.localeCompare(y.team.code));

  return { view: { slots, records: swissRecords }, mismatches };
}

// getStandings 的 swiss rankings 為空，改與 getSchedule 的 team.record（該隊目前階段戰績）交叉比對
export function crossCheckRecords(
  records: SwissRecord[],
  swissEvents: ApiScheduleEvent[],
  warn: Warn = consoleWarn,
): string[] {
  const latest = new Map<string, { wins: number; losses: number }>();
  for (const e of [...swissEvents].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    for (const t of e.match.teams) if (t.record && t.code !== "TBD") latest.set(t.code, t.record);
  const diffs: string[] = [];
  for (const r of records) {
    const s = latest.get(r.team.code);
    if (s && (s.wins !== r.wins || s.losses !== r.losses))
      diffs.push(`${r.team.code}: 計算 ${r.wins}-${r.losses} / API ${s.wins}-${s.losses}`);
  }
  if (diffs.length) warn("瑞士輪戰績與 API record 不一致", diffs);
  return diffs;
}
