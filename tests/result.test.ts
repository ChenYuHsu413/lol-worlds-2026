/* eslint-disable @typescript-eslint/no-explicit-any -- 改寫原始 JSON */
import { describe, expect, it } from "vitest";
import type { GameDetail, MatchGames } from "../lib/games";
import type { RawBundle } from "../lib/normalize";
import { provisionalFromGames, reconcileGames, seriesResult } from "../lib/result";
import { buildSwiss } from "../lib/swiss";
import { swissTable } from "../lib/swiss-table";
import type { Match } from "../lib/types";
import { collectWarn, liveBundle, matches } from "./helpers";

// 2026 正式快照中進行中的 Bo1：IG vs HLE（standings 順序 IG、HLE）
const ID = "115660540726095045";

/** 合成：schedule 的 state、schedule 的比分、standings 的比分可各自設定（模擬上游端點更新時間不一） */
function scenario(opts: { state: string; schedule?: [number, number] | null; standings?: [number, number] }): RawBundle {
  const b: any = structuredClone(liveBundle("swiss-2026-10-26"));
  const ev = b.events.find((e: any) => e.match.id === ID);
  ev.state = opts.state;
  const res = (wins: [number, number] | null | undefined, i: number) =>
    wins ? { outcome: wins[i] > wins[1 - i] ? "win" : "loss", gameWins: wins[i] } : { outcome: null, gameWins: 0 };
  // schedule teams 順序是 HLE、IG；比分參數一律以 [IG, HLE] 表示
  for (const t of ev.match.teams) t.result = res(opts.schedule, t.code === "IG" ? 0 : 1);
  for (const st of b.standings.data.standings[0].stages)
    for (const s of st.sections)
      for (const m of s.matches) if (m.id === ID) for (const t of m.teams) t.result = res(opts.standings, t.code === "IG" ? 0 : 1);
  return b;
}
const swissOf = (b: RawBundle) => matches(b, "2026").filter((m) => m.stage === "swiss");
const target = (ms: Match[]) => ms.find((m) => m.id === ID)!;

/** 小局資料：第 1 局由 IG 獲勝（依終局數據推估） */
function gamesWonBy(teamId: string, otherId: string): MatchGames {
  const side = (id: string) => ({ teamId: id }) as GameDetail["blue"];
  return {
    games: [{ id: "g1", number: 1, state: "completed", blue: side(teamId), red: side(otherId), winner: "blue", winnerSource: "inferred" } as GameDetail],
  } as MatchGames;
}

describe("完賽後比分尚未更新", () => {
  const pending = target(swissOf(scenario({ state: "completed" })));
  const ig = pending.teamA!;
  const hle = pending.teamB!;

  it("state 已完賽但比分 0:0 → 結果更新中，不判定勝方", () => {
    expect(pending.resultPending).toBe(true);
    expect(pending.winner).toBeNull();
    expect(seriesResult(pending, undefined)).toEqual({ kind: "pending" });
  });

  it("小局資料已判定勝方 → 暫定比分", () => {
    expect(ig.code).toBe("IG");
    const p = provisionalFromGames(pending, gamesWonBy(ig.id, hle.id));
    expect(p).toEqual({ scoreA: 1, scoreB: 0 });
    expect(seriesResult(pending, p)).toEqual({ kind: "provisional", scoreA: 1, scoreB: 0 });
  });

  it("小局資料還沒有勝方 → 沒有暫定比分", () => {
    const none = { games: [{ ...gamesWonBy(ig.id, hle.id).games[0], winner: null, winnerSource: null }] } as MatchGames;
    expect(provisionalFromGames(pending, none)).toBeNull();
  });

  it("上游正式比分更新後 → 改回正式比分（暫定比分不再使用）", () => {
    const done = target(swissOf(scenario({ state: "completed", standings: [1, 0] })));
    expect(done.resultPending).toBeUndefined();
    expect(done.winner).toBe("A");
    expect(seriesResult(done, { scoreA: 0, scoreB: 1 })).toEqual({ kind: "official", scoreA: 1, scoreB: 0 });
  });

  it("standings 尚未更新、但同一份 schedule 已有比分 → 用 schedule 的比分", () => {
    const m = target(swissOf(scenario({ state: "completed", schedule: [1, 0] })));
    expect(m.resultPending).toBeUndefined();
    expect([m.scoreA, m.scoreB, m.winner]).toEqual([1, 0, "A"]);
  });

  it("結果更新中、暫定比分兩種狀態下，瑞士輪戰績、分桶與戰績表都與進行中時相同", () => {
    const live = buildSwiss(swissOf(scenario({ state: "inProgress" })), () => {}).view;
    const { msgs, warn } = collectWarn();
    const pend = buildSwiss(swissOf(scenario({ state: "completed" })), warn).view;
    expect(msgs).toEqual([]);
    const summary = (v: typeof live) => ({
      records: v.records.map((r) => `${r.team.code} ${r.wins}-${r.losses} ${r.status}`),
      buckets: v.slots.map((s) => `${s.match.id} R${s.round} ${s.wins}-${s.losses} ${s.provisional}`),
      table: swissTable(v).map((r) => `${r.team.code} ${r.wins}-${r.losses} ${r.rounds.map((c) => c?.result ?? "-").join(",")}`),
    });
    // 暫定比分只在前端顯示（不進入 buildSwiss），所以兩種狀態的瑞士輪資料相同
    expect(summary(pend)).toEqual(summary(live));
    const cell = swissTable(pend).find((r) => r.team.code === "IG")!.rounds[2]!;
    expect([cell.pending, cell.result, cell.score]).toEqual([true, null, null]);
  });
});

describe("小局面板與正式比分一致", () => {
  const done = target(swissOf(scenario({ state: "completed", standings: [0, 1] }))); // 正式：HLE 勝
  const ig = done.teamA!;
  const hle = done.teamB!;

  it("小局推估的勝方與正式比分衝突 → 以正式比分為準並 warn", () => {
    const { msgs, warn } = collectWarn();
    const games = reconcileGames(done, gamesWonBy(ig.id, hle.id).games, warn);
    expect(games[0].winner).toBeNull();
    expect(msgs).toHaveLength(1);
  });

  it("一致時不變動", () => {
    const { msgs, warn } = collectWarn();
    const games = gamesWonBy(hle.id, ig.id).games;
    expect(reconcileGames(done, games, warn)).toBe(games);
    expect(msgs).toEqual([]);
  });
});
