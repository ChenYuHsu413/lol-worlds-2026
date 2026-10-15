// Play-In 雙敗籤表：API 沒有勝部/敗部標示，依 startTime 順序對應位置，第 3/4 場依隊伍判定

import { PLAYIN_SLOT_ORDER } from "../config/format-2026";
import { consoleWarn, type Warn } from "./normalize";
import { taipeiMonthDay } from "./time";
import type { Match, PlayInSlot, PlayInSlotKey, PlayInView, Team } from "./types";

export const PLAYIN_LABELS: Record<PlayInSlotKey, string> = {
  ub1a: "勝部首輪 A",
  ub1b: "勝部首輪 B",
  ubFinal: "勝部決賽",
  lbRound1: "敗部首輪",
  lbFinal: "敗部決賽",
  grandFinal: "總決賽",
};

export const winnerOf = (m: Match | undefined): Team | null =>
  !m || m.state !== "completed" ? null : m.winner === "A" ? m.teamA : m.winner === "B" ? m.teamB : null;
export const loserOf = (m: Match | undefined): Team | null =>
  !m || m.state !== "completed" ? null : m.winner === "A" ? m.teamB : m.winner === "B" ? m.teamA : null;

const teamsOf = (m: Match) => [m.teamA, m.teamB].filter((t): t is Team => t !== null);
const byTime = (a: Match, b: Match) =>
  a.startTime.localeCompare(b.startTime) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

export function buildPlayIn(playinMatches: Match[], warn: Warn = consoleWarn): PlayInView {
  const sorted = [...playinMatches].sort(byTime);
  if (sorted.length !== PLAYIN_SLOT_ORDER.length) {
    warn(`Play-In 場數 ${sorted.length} 與預期 ${PLAYIN_SLOT_ORDER.length} 不符，改以場次順序顯示`);
    return {
      slots: sorted.map((m, i) => ({ key: null, label: `場次 ${i + 1}`, match: m, provisional: true })),
      qualified: null,
      eliminated: [],
    };
  }

  const [ub1a, ub1b, d2a, d2b, lbFinal, grandFinal] = sorted;
  const r1Winners = new Set([winnerOf(ub1a), winnerOf(ub1b)].filter(Boolean).map((t) => t!.id));
  const r1Losers = new Set([loserOf(ub1a), loserOf(ub1b)].filter(Boolean).map((t) => t!.id));

  // 第 3/4 場：含勝部首輪勝者 → 勝部決賽；含敗者 → 敗部首輪
  const classify = (m: Match): PlayInSlotKey | null => {
    const ids = teamsOf(m).map((t) => t.id);
    const inW = ids.some((id) => r1Winners.has(id));
    const inL = ids.some((id) => r1Losers.has(id));
    if (inW && inL) {
      warn(`Play-In ${m.id} 同時包含勝部首輪的勝者與敗者，無法判定位置`);
      return null;
    }
    return inW ? "ubFinal" : inL ? "lbRound1" : null;
  };
  let keyA = classify(d2a);
  let keyB = classify(d2b);
  if (keyA && keyA === keyB) {
    warn(`Play-In 第 3、4 場被判定為同一位置（${keyA}）`);
    keyA = keyB = null;
  }
  if (keyA && !keyB) keyB = keyA === "ubFinal" ? "lbRound1" : "ubFinal";
  if (keyB && !keyA) keyA = keyB === "ubFinal" ? "lbRound1" : "ubFinal";

  const md = taipeiMonthDay(d2a.startTime);
  const slot = (key: PlayInSlotKey | null, match: Match, fallback: string): PlayInSlot => ({
    key,
    label: key ? PLAYIN_LABELS[key] : fallback,
    match,
    provisional: key === null,
  });
  const slots: PlayInSlot[] = [
    slot("ub1a", ub1a, ""),
    slot("ub1b", ub1b, ""),
    slot(keyA, d2a, `${md} 場次 A`),
    slot(keyB, d2b, `${md} 場次 B`),
    slot("lbFinal", lbFinal, ""),
    slot("grandFinal", grandFinal, ""),
  ];

  const get = (k: PlayInSlotKey) => slots.find((s) => s.key === k)?.match;
  const ubFinal = get("ubFinal");
  const lbRound1 = get("lbRound1");

  // 推進檢查：已知隊伍必須來自正確的上游
  const expect = (m: Match | undefined, allowed: (Team | null)[], name: string) => {
    if (!m || allowed.some((t) => t === null)) return;
    const ok = new Set(allowed.map((t) => t!.id));
    for (const t of teamsOf(m)) if (!ok.has(t.id)) warn(`Play-In ${name} 出現非預期隊伍 ${t.code}`);
  };
  expect(lbFinal, [loserOf(ubFinal), winnerOf(lbRound1)], "敗部決賽");
  expect(grandFinal, [winnerOf(ubFinal), winnerOf(lbFinal)], "總決賽");

  return {
    slots,
    qualified: winnerOf(grandFinal),
    eliminated: [loserOf(lbRound1), loserOf(lbFinal), loserOf(grandFinal)].filter((t): t is Team => t !== null),
  };
}
