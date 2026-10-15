import { describe, expect, it } from "vitest";
import config from "../config/teams-2026.json";
import {
  decodePrediction,
  drawPairs,
  emptyPrediction,
  encodePrediction,
  pairKey,
  parsePrediction,
  rng,
  setPick,
  settle,
  simulate,
  swapKo,
  swapSwiss,
  validKoDraw,
  type PredictionState,
} from "../lib/simulate";
import type { Match, WorldsData } from "../lib/types";
import { buildStageViews } from "../lib/views";
import { buildWorldsData } from "../lib/worlds";
import { bundle, syntheticBundle, tournament } from "./helpers";

const quiet = () => {};
const data2026 = (synthetic?: string): WorldsData =>
  buildWorldsData(synthetic ? syntheticBundle(synthetic) : bundle("2026"), tournament("2026"), "test", quiet);

/** 反覆推演，替每場可預測的比賽選勝隊，直到推演到底 */
function pickAll(data: WorldsData, choose: (m: Match) => string = (m) => m.teamA!.id, seed = 42) {
  let state: PredictionState = emptyPrediction(seed);
  for (let i = 0; i < 80; i++) {
    const sim = simulate(data.matches, data.profiles, state);
    const next = sim.matches.find((m) => m.state === "unstarted" && m.teamA && m.teamB && !state.picks[m.id]);
    if (!next) return { state, sim };
    state = setPick(state, next.id, { w: choose(next) });
  }
  throw new Error("推演未收斂");
}

describe("完整推演（2026，Play-In 全未開打）", () => {
  const data = data2026();
  const { sim } = pickAll(data);
  const swiss = sim.matches.filter((m) => m.stage === "swiss");

  it("一路推演到決賽，產生預測冠軍", () => {
    expect(sim.matches.every((m) => m.state === "completed")).toBe(true);
    expect(sim.champion).not.toBeNull();
    expect(sim.notes).toEqual([]);
  });

  it("瑞士輪不重複交手", () => {
    const keys = swiss.map((m) => pairKey(m.teamA!.id, m.teamB!.id));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("同桶配對：每場雙方賽前戰績相同，且 Bo 數沿用資料", () => {
    const views = buildStageViews(sim.matches, quiet);
    expect(views.swiss.slots.every((s) => !s.provisional)).toBe(true);
    for (const s of views.swiss.slots) expect(s.match.bestOf).toBe(s.wins === 2 || s.losses === 2 ? 3 : 1);
  });

  it("3 勝晉級 / 3 敗淘汰：8 晉 8 淘，戰績分布 2/3/3", () => {
    const { records } = buildStageViews(sim.matches, quiet).swiss;
    expect(records).toHaveLength(16);
    expect(records.filter((r) => r.status === "qualified")).toHaveLength(8);
    expect(records.filter((r) => r.status === "eliminated")).toHaveLength(8);
    const q = records.filter((r) => r.status === "qualified").map((r) => r.losses);
    expect([0, 1, 2].map((l) => q.filter((x) => x === l).length)).toEqual([2, 3, 3]);
  });

  it("第一輪：第 1 池對第 4 池、第 2 池對第 3 池，且不同賽區", () => {
    const pool = (id: string) => {
      const p = data.profiles.find((x) => x.team.id === id)!;
      return p.pool ?? 4; // Play-In 晉級隊伍為第 4 池
    };
    const r1 = swiss.filter((m) => m.round === 1);
    expect(r1).toHaveLength(8);
    for (const m of r1) {
      expect(pool(m.teamA!.id) + pool(m.teamB!.id)).toBe(5);
      expect(m.teamA!.league).not.toBe(m.teamB!.league);
    }
    expect(config.teams.filter((t) => "pool" in t)).toHaveLength(15);
  });

  it("淘汰賽種子：兩支 3-0 在籤表兩側（八強 1、3），對手為 3-2", () => {
    const rec = sim.records;
    const qf = sim.matches.filter((m) => m.stage === "knockout").sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)).slice(0, 4);
    expect(rec[qf[0].teamA!.id][1]).toBe(0);
    expect(rec[qf[2].teamA!.id][1]).toBe(0);
    expect(rec[qf[0].teamB!.id][1]).toBe(2);
    expect(rec[qf[2].teamB!.id][1]).toBe(2);
  });

  it("相同 state 推演結果穩定（隨機抽籤以 seed 決定）", () => {
    const again = pickAll(data).sim;
    expect(again.matches.map((m) => `${m.teamA?.id}-${m.teamB?.id}`)).toEqual(
      sim.matches.map((m) => `${m.teamA?.id}-${m.teamB?.id}`),
    );
  });
});

describe("配對回溯", () => {
  it("貪婪第一步會卡死時能回溯找到唯一解", () => {
    const allowed = new Set([pairKey("a", "b"), pairKey("a", "c"), pairKey("b", "d")]);
    for (let seed = 0; seed < 30; seed++) {
      const pairs = drawPairs(["a", "b", "c", "d"], (x, y) => allowed.has(pairKey(x, y)), rng(seed))!;
      expect(new Set(pairs.map(([x, y]) => pairKey(x, y)))).toEqual(new Set([pairKey("a", "c"), pairKey("b", "d")]));
    }
  });
  it("無解時回傳 null", () => {
    expect(drawPairs(["a", "b", "c", "d"], () => false, rng(1))).toBeNull();
  });
});

describe("手動配對與排籤", () => {
  const data = data2026();
  const { state, sim } = pickAll(data);

  it("瑞士輪：同桶交換配對；造成重複交手則拒絕", () => {
    const r2 = sim.swissDrawn[2];
    const bucket = r2.filter((d) => d.bucket === "1-0");
    const [x] = bucket[0].pair;
    const [y] = bucket[1].pair;
    const swapped = swapSwiss(state, sim, 2, x, y);
    expect(swapped).not.toBeNull();
    const after = simulate(data.matches, data.profiles, swapped!);
    const pairs = after.swissDrawn[2].map((d) => pairKey(...d.pair));
    expect(pairs).toContain(pairKey(x, bucket[1].pair[1]));
    // 與先前對手重複交手則拒絕：找一組「把 t 的同場對手換成 t 先前交手過的隊伍」的交換
    let rejected = false;
    for (const r of [3, 4, 5]) {
      const prev = new Set(sim.playedBefore[r]);
      for (const d of sim.swissDrawn[r] ?? []) {
        const [t, x] = d.pair;
        const target = sim.swissDrawn[r].find(
          (e) => e !== d && e.bucket === d.bucket && e.pair.some((y) => prev.has(pairKey(t, y))),
        );
        if (!target) continue;
        const y = target.pair.find((z) => prev.has(pairKey(t, z)))!;
        expect(swapSwiss(swapped!, after, r, x, y)).toBeNull();
        rejected = true;
        break;
      }
      if (rejected) break;
    }
    expect(rejected).toBe(true);
    // 不同桶不能交換
    const other = r2.find((d) => d.bucket === "0-1")!.pair[0];
    expect(swapSwiss(state, sim, 2, x, other)).toBeNull();
  });

  it("淘汰賽：交換兩支 3-1 隊伍可行；把 3-0 換離種子位不可行", () => {
    const draw = sim.koDraw!;
    const rec = sim.records;
    const ones = draw.filter((id) => rec[id][1] === 1);
    expect(swapKo(state, sim, ones[0], ones[1])).not.toBeNull();
    expect(swapKo(state, sim, draw[0], ones[0])).toBeNull();
    expect(validKoDraw([...draw].reverse(), draw, rec)).toBe(false);
  });
});

describe("上游改動的連鎖移除與復原", () => {
  it("改 R2 配對 → 下游預測被移除；復原後與改動前完全相同", () => {
    const data = data2026();
    const { state, sim } = pickAll(data);
    const before = structuredClone(state);
    const bucket = sim.swissDrawn[2].filter((d) => d.bucket === "1-0");
    const changed = swapSwiss(state, sim, 2, bucket[0].pair[0], bucket[1].pair[0])!;
    const { state: settled, removed } = settle(changed, data.matches, data.profiles);
    expect(removed.length).toBeGreaterThan(0);
    expect(new Set(removed).size).toBe(removed.length);
    for (const id of removed) expect(settled.picks[id]).toBeUndefined();
    expect(simulate(data.matches, data.profiles, settled).stale).toEqual([]);
    // 復原 = 回到改動前保存的狀態
    const undone = before;
    expect(undone).toEqual(state);
    expect(simulate(data.matches, data.profiles, undone).champion?.id).toBe(sim.champion?.id);
  });
});

describe("預測與實際結果衝突", () => {
  it("實際結果與預測不同 → 已被覆蓋並計入命中率", () => {
    const data = data2026("playin-r1"); // 實際：C9 勝 KC、MVK 勝 FUR
    const [ub1a, ub1b] = data.matches.filter((m) => m.stage === "playin").sort((a, b) => a.startTime.localeCompare(b.startTime));
    let state = emptyPrediction(1);
    state = setPick(state, ub1a.id, { w: ub1a.teamB!.id }); // 猜 KC（錯）
    state = setPick(state, ub1b.id, { w: ub1b.winner === "A" ? ub1b.teamA!.id : ub1b.teamB!.id }); // 猜對
    const sim = simulate(data.matches, data.profiles, state);
    expect(sim.overridden).toEqual([ub1a.id]);
    expect(sim.hits).toEqual({ correct: 1, total: 2 });
    // 已完賽比賽鎖定為實際結果
    expect(sim.matches.find((m) => m.id === ub1a.id)!.sim?.result).toBeUndefined();
  });

  it("官方公布的對戰隊伍與預測不符 → 覆蓋；上游預測改變 → stale", () => {
    const data = data2026("playin-r1"); // 第 3/4 場隊伍已由官方填入
    const pi = data.matches.filter((m) => m.stage === "playin").sort((a, b) => a.startTime.localeCompare(b.startTime));
    const fur = data.teams.find((t) => t.code === "FUR")!;
    let state = setPick(emptyPrediction(1), pi[3].id, { w: fur.id }); // FUR 不在第 4 場
    let sim = simulate(data.matches, data.profiles, state);
    expect(sim.overridden).toContain(pi[3].id);

    // playin-r1：第 3 場為敗部首輪 KC-FUR、第 4 場為勝部決賽 C9-MVK
    const mvk = data.teams.find((t) => t.code === "MVK")!;
    state = setPick(emptyPrediction(1), pi[2].id, { w: pi[2].teamA!.id }); // KC 勝敗部首輪
    state = setPick(state, pi[3].id, { w: pi[3].teamA!.id }); // C9 勝勝部決賽 → 敗部決賽 MVK vs KC
    state = setPick(state, pi[4].id, { w: mvk.id });
    sim = simulate(data.matches, data.profiles, state);
    expect(sim.matches.find((m) => m.id === pi[4].id)!.sim?.result).toBe(true);
    state = setPick(state, pi[3].id, { w: mvk.id }); // 改成 MVK 勝 → 敗部決賽變成 C9 vs KC
    sim = simulate(data.matches, data.profiles, state);
    expect(sim.stale).toEqual([pi[4].id]);
    expect(sim.overridden).toEqual([]);
  });

  it("比分：合法比分沿用，否則預設橫掃", () => {
    const data = data2026("playin-none");
    const m = data.matches.find((x) => x.stage === "playin" && x.teamA)!;
    let sim = simulate(data.matches, data.profiles, setPick(emptyPrediction(1), m.id, { w: m.teamB!.id, s: [3, 2] }));
    expect(sim.matches.find((x) => x.id === m.id)).toMatchObject({ scoreA: 2, scoreB: 3, winner: "B" });
    sim = simulate(data.matches, data.profiles, setPick(emptyPrediction(1), m.id, { w: m.teamA!.id, s: [2, 1] }));
    expect(sim.matches.find((x) => x.id === m.id)).toMatchObject({ scoreA: 3, scoreB: 0 });
  });
});

describe("URL 分享序列化", () => {
  it("編碼後可還原，且不含 query string 特殊字元", async () => {
    const { state } = pickAll(data2026());
    const withKo = { ...state, swiss: { 2: [["a", "b"]] as [string, string][] }, ko: ["x", "y"] };
    const enc = await encodePrediction(withKo);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePrediction(enc)).toEqual(withKo);
    expect(enc.length).toBeLessThan(JSON.stringify(withKo).length);
  });
  it("損壞或不合法的資料回傳 null / 過濾", async () => {
    expect(await decodePrediction("not-valid!!")).toBeNull();
    expect(parsePrediction({ v: 2 })).toBeNull();
    expect(parsePrediction({ v: 1, seed: 1, picks: { a: { w: 1 }, b: { w: "t" } } })).toEqual({
      v: 1,
      seed: 1,
      picks: { b: { w: "t" } },
      swiss: {},
      ko: null,
    });
  });
});
