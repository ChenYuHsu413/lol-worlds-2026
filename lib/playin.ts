// Play-In 雙敗籤表：API 沒有勝部/敗部標示，依 startTime 順序對應位置，第 3/4 場依隊伍判定

import { PLAYIN_SLOT_ORDER } from "../config/format-2026";
import { loserOf, seatsBySource, seatsInApiOrder, winnerOf, type SeatSource } from "./bracket";
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

export { loserOf, winnerOf };

// 雙敗籤表的來源表：每一格由哪一場的勝者/敗者進入（上格、下格）。格位、連線、去向文字都由這張表產生
type SourceDef = { from: PlayInSlotKey; take: "winner" | "loser" };
export const PLAYIN_SOURCES: Partial<Record<PlayInSlotKey, [SourceDef, SourceDef]>> = {
  ubFinal: [{ from: "ub1a", take: "winner" }, { from: "ub1b", take: "winner" }],
  lbRound1: [{ from: "ub1a", take: "loser" }, { from: "ub1b", take: "loser" }],
  lbFinal: [{ from: "ubFinal", take: "loser" }, { from: "lbRound1", take: "winner" }],
  grandFinal: [{ from: "ubFinal", take: "winner" }, { from: "lbFinal", take: "winner" }],
};
export const sourceLabel = (s: SourceDef) => {
  const name = PLAYIN_LABELS[s.from];
  // 「勝部首輪 A 勝者」：名稱以英數字結尾時補空格
  return `${name}${/[A-Za-z0-9]$/.test(name) ? " " : ""}${s.take === "winner" ? "勝者" : "敗者"}`;
};

/** 由來源表反推某場的勝敗去向；沒有下一場的勝者晉級瑞士輪、敗者淘汰 */
export function playinNext(key: PlayInSlotKey): string {
  const target = (take: "winner" | "loser") =>
    (Object.entries(PLAYIN_SOURCES) as [PlayInSlotKey, [SourceDef, SourceDef]][]).find(([, srcs]) =>
      srcs.some((s) => s.from === key && s.take === take),
    )?.[0];
  const w = target("winner");
  const l = target("loser");
  return `${w ? `勝者 → ${PLAYIN_LABELS[w]}` : "勝者晉級瑞士輪"}・${l ? `敗者 → ${PLAYIN_LABELS[l]}` : "敗者淘汰"}`;
}
export const PLAYIN_PROVISIONAL_NEXT = "勝部決賽或敗部首輪，待勝部首輪結束後判定";

const teamsOf = (m: Match) => [m.teamA, m.teamB].filter((t): t is Team => t !== null);
const byTime = (a: Match, b: Match) =>
  a.startTime.localeCompare(b.startTime) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

export function buildPlayIn(playinMatches: Match[], warn: Warn = consoleWarn): PlayInView {
  const sorted = [...playinMatches].sort(byTime);
  if (sorted.length !== PLAYIN_SLOT_ORDER.length) {
    warn(`Play-In 場數 ${sorted.length} 與預期 ${PLAYIN_SLOT_ORDER.length} 不符，改以場次順序顯示`);
    return {
      slots: sorted.map((m, i) => ({
        key: null,
        label: `場次 ${i + 1}`,
        match: m,
        provisional: true,
        seats: seatsInApiOrder(m),
        next: "",
      })),
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
  const byKey = new Map<PlayInSlotKey, Match>([
    ["ub1a", ub1a],
    ["ub1b", ub1b],
    ["lbFinal", lbFinal],
    ["grandFinal", grandFinal],
  ]);
  if (keyA) byKey.set(keyA, d2a);
  if (keyB) byKey.set(keyB, d2b);
  const get = (k: PlayInSlotKey) => byKey.get(k);

  const slot = (key: PlayInSlotKey | null, match: Match, fallback: string): PlayInSlot => {
    const defs = key ? PLAYIN_SOURCES[key] : undefined;
    const sources = defs?.map((d): SeatSource => ({ match: get(d.from), take: d.take, label: sourceLabel(d) })) as
      | [SeatSource, SeatSource]
      | undefined;
    return {
      key,
      label: key ? PLAYIN_LABELS[key] : fallback,
      match,
      provisional: key === null,
      seats: sources ? seatsBySource(match, sources) : seatsInApiOrder(match),
      next: key ? playinNext(key) : PLAYIN_PROVISIONAL_NEXT,
    };
  };
  const slots: PlayInSlot[] = [
    slot("ub1a", ub1a, ""),
    slot("ub1b", ub1b, ""),
    slot(keyA, d2a, `${md} 場次 A`),
    slot(keyB, d2b, `${md} 場次 B`),
    slot("lbFinal", lbFinal, ""),
    slot("grandFinal", grandFinal, ""),
  ];

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
