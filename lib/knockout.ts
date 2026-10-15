// 淘汰賽籤表：依 id 排序切輪，下一輪第 i 場由上一輪第 2i、2i+1 場勝者對戰（見 config/format-2026.ts）

import { KNOCKOUT_ROUND_NAMES, KNOCKOUT_ROUND_SIZES } from "../config/format-2026";
import { consoleWarn, type Warn } from "./normalize";
import { winnerOf } from "./playin";
import type { KnockoutSlot, KnockoutView, Match, SwissRecord } from "./types";

const byId = (a: Match, b: Match) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);

export function buildKnockout(
  knockoutMatches: Match[],
  swissRecords: SwissRecord[],
  warn: Warn = consoleWarn,
): KnockoutView {
  const sorted = [...knockoutMatches].sort(byId);
  const total = KNOCKOUT_ROUND_SIZES.reduce((a, b) => a + b, 0);
  if (sorted.length !== total) warn(`淘汰賽場數 ${sorted.length} 與預期 ${total} 不符`);

  const rounds: KnockoutSlot[][] = [];
  let offset = 0;
  KNOCKOUT_ROUND_SIZES.forEach((size, r) => {
    rounds.push(
      sorted.slice(offset, offset + size).map((match, index) => {
        match.round = r + 1;
        const prev = KNOCKOUT_ROUND_NAMES[r - 1];
        return {
          round: r,
          index,
          match,
          sourceLabels: r === 0 ? null : [`${prev} ${index * 2 + 1} 勝者`, `${prev} ${index * 2 + 2} 勝者`],
        };
      }),
    );
    offset += size;
  });

  // 推進檢查
  for (let r = 1; r < rounds.length; r++) {
    for (const slot of rounds[r]) {
      const feeders = [rounds[r - 1][slot.index * 2], rounds[r - 1][slot.index * 2 + 1]];
      const expected = feeders.map((f) => winnerOf(f?.match));
      for (const t of [slot.match.teamA, slot.match.teamB]) {
        if (t && expected.every((e) => e !== null) && !expected.some((e) => e!.id === t.id))
          warn(`淘汰賽 ${slot.match.id} 的 ${t.code} 不是上一輪對應場次的勝者，籤表規則可能不成立`);
      }
    }
  }

  // 淘汰賽抽籤規則（出處見 config/format-2026.ts 的 KNOCKOUT_DRAW_SOURCES）：
  // 兩支 3-0 隊伍分在籤表兩側，且各自的八強對手為 3-2 隊伍
  const recordOf = new Map(swissRecords.map((r) => [r.team.id, r]));
  const threeZero = new Set(swissRecords.filter((r) => r.wins === 3 && r.losses === 0).map((r) => r.team.id));
  const qf = rounds[0] ?? [];
  const half = Math.floor(qf.length / 2);
  const placed = qf.flatMap((s, i) =>
    [s.match.teamA, s.match.teamB].filter((t) => t && threeZero.has(t.id)).map((t) => ({ team: t!, slot: s, side: i < half ? 0 : 1 })),
  );
  if (placed.length === 2 && placed[0].side === placed[1].side) warn("兩支 3-0 隊伍被分在籤表同一側");
  for (const { team, slot } of placed) {
    const opp = slot.match.teamA?.id === team.id ? slot.match.teamB : slot.match.teamA;
    const rec = opp ? recordOf.get(opp.id) : undefined;
    if (rec && !(rec.wins === 3 && rec.losses === 2))
      warn(`3-0 隊伍 ${team.code} 的八強對手 ${opp!.code} 戰績 ${rec.wins}-${rec.losses}，不是 3-2`);
  }

  return { rounds, roundNames: KNOCKOUT_ROUND_NAMES.slice(0, rounds.length) };
}
