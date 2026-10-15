import { describe, expect, it } from "vitest";
import type { ApiStandingsTeam, GetStandingsResponse } from "../lib/api-types";
import type { RawBundle } from "../lib/normalize";
import { PLAYIN_WINNER_PLACEHOLDER } from "../lib/swiss";
import { buildWorldsData } from "../lib/worlds";
import { bundle, collectWarn, syntheticBundle, tournament } from "./helpers";

const build = (b: RawBundle, warn = collectWarn().warn) => buildWorldsData(b, tournament("2026"), "test", warn);
const codes = (seats: { team: { code: string } | null; placeholder: string | null }[]) =>
  seats.map((s) => s.team?.code ?? s.placeholder);

// 官方 Worlds 2026 Primer 的 Tier（CBLOL1 = LOS、Play-Ins Winner 為佔位）
const OFFICIAL = {
  1: ["GEN", "AL", "TLAW", "G2"],
  2: ["LOS", "TSW", "HLE", "BLG"],
  3: ["LYON", "MKOI", "T1", "TES"],
  4: ["CFO", "IG", "DK", PLAYIN_WINNER_PLACEHOLDER],
};

describe("分池資料完整性", () => {
  it("16 席 = 15 隊 + Play-In 勝隊佔位，且與官方 Tier 一致", () => {
    const { msgs, warn } = collectWarn();
    const { swissDraw } = build(bundle("2026"), warn);
    expect(swissDraw.pools.map((p) => p.pool)).toEqual([1, 2, 3, 4]);
    expect(swissDraw.pools.flatMap((p) => p.seats)).toHaveLength(16);
    for (const { pool, seats } of swissDraw.pools)
      expect(codes(seats).sort()).toEqual([...OFFICIAL[pool as 1 | 2 | 3 | 4]].sort());
    expect(swissDraw.pools.flatMap((p) => p.seats).filter((s) => s.placeholder)).toHaveLength(1);
    expect(swissDraw.round1).toEqual([]);
    expect(swissDraw.issues).toBeNull(); // 第一輪尚未公布
    expect(msgs).toEqual([]);
  });

  it("Play-In 勝隊產生後，佔位由勝隊取代", () => {
    const { swissDraw } = build(syntheticBundle("playin-done")); // MVK 晉級
    const pool4 = swissDraw.pools.find((p) => p.pool === 4)!;
    expect(codes(pool4.seats)).toContain("MVK");
    expect(swissDraw.pools.flatMap((p) => p.seats).some((s) => s.placeholder)).toBe(false);
  });
});

describe("第一輪配對標示與檢查", () => {
  /** 以 playin-done 為底，把官方第一輪（瑞士輪 id 最小的 8 場）填入指定對戰 */
  function withRound1(pairs: [string, string][]): RawBundle {
    const b = structuredClone(syntheticBundle("playin-done"));
    const st = b.standings as GetStandingsResponse;
    const team = (code: string): ApiStandingsTeam => {
      const t = b.teams.find((x) => x.code === code)!;
      return { id: t.id, slug: t.slug, name: t.name, code: t.code, image: t.image, result: { outcome: null, gameWins: 0 } };
    };
    const swiss = st.data.standings[0].stages.find((s) => s.slug === "swiss")!.sections[0].matches;
    const r1 = [...swiss].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)).slice(0, 8);
    r1.forEach((m, i) => (m.teams = [team(pairs[i][0]), team(pairs[i][1])]));
    return b;
  }
  const VALID: [string, string][] = [
    ["GEN", "IG"], ["AL", "DK"], ["TLAW", "CFO"], ["G2", "MVK"],
    ["TSW", "LYON"], ["LOS", "MKOI"], ["HLE", "TES"], ["BLG", "T1"],
  ];

  it("符合規則：列出 8 組對戰、issues 為空", () => {
    const data = build(withRound1(VALID));
    const byId = new Map(data.teams.map((t) => [t.id, t.code]));
    expect(data.swissDraw.round1.map(([a, b]) => [byId.get(a), byId.get(b)])).toEqual(VALID);
    expect(data.swissDraw.issues).toEqual([]);
  });

  it("違反分池或同賽區：列出違規配對並 warn", () => {
    const bad = VALID.map((p) => [...p]) as [string, string][];
    bad[0] = ["GEN", "DK"]; // 同為 LCK
    bad[1] = ["AL", "IG"]; // 同為 LPL
    const { msgs, warn } = collectWarn();
    const data = build(withRound1(bad), warn);
    expect(data.swissDraw.issues).toEqual(["GEN vs DK 同為 LCK", "AL vs IG 同為 LPL"]);
    expect(msgs).toContain("瑞士輪第一輪配對與抽籤規則不符");
  });
});
