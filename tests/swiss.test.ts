import { describe, expect, it } from "vitest";
import { buildSwiss, crossCheckRecords, swissSlotTemplate } from "../lib/swiss";
import type { Match } from "../lib/types";
import { bundle, collectWarn, matches } from "./helpers";

const swiss2025 = () => matches(bundle("2025"), "2025").filter((m) => m.stage === "swiss");

describe("瑞士輪桶位模板", () => {
  it("16 隊 3 勝 3 敗 → 8/8/8/6/3", () => {
    const t = swissSlotTemplate();
    const perRound = [1, 2, 3, 4, 5].map((r) => t.filter((s) => s.round === r).length);
    expect(perRound).toEqual([8, 8, 8, 6, 3]);
    expect(t.filter((s) => s.round === 3).map((s) => `${s.wins}-${s.losses}`)).toEqual([
      "2-0", "2-0", "1-1", "1-1", "1-1", "1-1", "0-2", "0-2",
    ]);
  });
});

describe("2025 完整資料重建", () => {
  it("每場重算的輪次與桶位都與 id 推測一致", () => {
    const { msgs, warn } = collectWarn();
    const { view, mismatches } = buildSwiss(swiss2025(), warn);
    expect(mismatches).toEqual([]);
    expect(msgs).toEqual([]);
    expect(view.slots).toHaveLength(33);
    expect(view.slots.every((s) => !s.provisional)).toBe(true);
  });

  it("晉級/淘汰判定", () => {
    const { view } = buildSwiss(swiss2025());
    const by = (code: string) => view.records.find((r) => r.team.code === code)!;
    expect(view.records.filter((r) => r.status === "qualified")).toHaveLength(8);
    expect(view.records.filter((r) => r.status === "eliminated")).toHaveLength(8);
    expect([by("KT").wins, by("KT").losses, by("KT").status]).toEqual([3, 0, "qualified"]);
    expect([by("FNC").wins, by("FNC").losses, by("FNC").status]).toEqual([0, 3, "eliminated"]);
    expect([by("T1").wins, by("T1").losses]).toEqual([3, 2]);
  });

  it("與 schedule 的 team.record 交叉比對無差異", () => {
    const b = bundle("2025");
    const ms = swiss2025();
    const ids = new Set(ms.map((m) => m.id));
    const { view } = buildSwiss(ms);
    expect(crossCheckRecords(view.records, b.events.filter((e) => ids.has(e.match.id)), () => {})).toEqual([]);
  });
});

describe("進行到一半（截斷到 R3 中途）", () => {
  // 2025-10-18T09:30Z 時：R3 的 2-0 兩場、1-1 前兩場已完賽；R3 其餘場次隊伍已知未開打；R4 以後 TBD
  const CUTOFF = "2025-10-18T09:30:00Z";
  const R4_START = "2025-10-22";
  function truncated(): Match[] {
    return swiss2025().map((m) => {
      if (m.startTime < CUTOFF) return m;
      const tbd = m.startTime >= R4_START;
      return {
        ...m,
        state: "unstarted",
        scoreA: 0,
        scoreB: 0,
        winner: null,
        teamA: tbd ? null : m.teamA,
        teamB: tbd ? null : m.teamB,
      };
    });
  }

  it("R1–R3 由賽前戰績定位，R4/R5 為 provisional，且與 id 推測一致", () => {
    const { msgs, warn } = collectWarn();
    const { view, mismatches } = buildSwiss(truncated(), warn);
    expect(mismatches).toEqual([]);
    expect(msgs).toEqual([]);
    const prov = (r: number) => view.slots.filter((s) => s.round === r).map((s) => s.provisional);
    expect(prov(3).every((p) => !p)).toBe(true);
    expect(prov(4)).toEqual(Array(6).fill(true));
    expect(prov(5)).toEqual(Array(3).fill(true));
  });

  it("目前戰績正確，尚無隊伍晉級或淘汰", () => {
    const { view } = buildSwiss(truncated());
    const by = (code: string) => view.records.find((r) => r.team.code === code)!;
    expect([by("KT").wins, by("KT").losses]).toEqual([3, 0]); // R3 2-0 場已勝
    expect([by("AL").wins, by("AL").losses]).toEqual([3, 0]);
    expect([by("GEN").wins, by("GEN").losses]).toEqual([2, 1]); // 10-18 09:00 剛勝 T1
    expect([by("FNC").wins, by("FNC").losses]).toEqual([0, 2]); // 0-2 場尚未打
    expect(view.records.filter((r) => r.status === "eliminated")).toHaveLength(0);
    expect(view.records.filter((r) => r.status === "qualified").map((r) => r.team.code).sort()).toEqual(["AL", "KT"]);
  });
});
