import { describe, expect, it } from "vitest";
import { buildKnockout } from "../lib/knockout";
import { buildPlayIn, winnerOf } from "../lib/playin";
import { buildSwiss } from "../lib/swiss";
import { bundle, collectWarn, matches, syntheticBundle } from "./helpers";

const playin = (name: string) => {
  const { msgs, warn } = collectWarn();
  const ms = matches(syntheticBundle(name), "2026", warn).filter((m) => m.stage === "playin");
  return { view: buildPlayIn(ms, warn), msgs };
};
const keys = (v: ReturnType<typeof playin>["view"]) => v.slots.map((s) => s.key);
const labels = (v: ReturnType<typeof playin>["view"]) => v.slots.map((s) => s.label);

describe("Play-In 雙敗推進", () => {
  it("全未開打：第 3/4 場 provisional，顯示台灣日期場次 A/B", () => {
    const { view, msgs } = playin("playin-none");
    expect(keys(view)).toEqual(["ub1a", "ub1b", null, null, "lbFinal", "grandFinal"]);
    expect(labels(view).slice(2, 4)).toEqual(["10/17 場次 A", "10/17 場次 B"]);
    expect(view.slots.filter((s) => s.provisional)).toHaveLength(2);
    expect(view.qualified).toBeNull();
    expect(msgs).toEqual([]);
  });

  it("勝部首輪打完：依隊伍判定，較早那場為敗部首輪", () => {
    const { view, msgs } = playin("playin-r1");
    expect(keys(view)).toEqual(["ub1a", "ub1b", "lbRound1", "ubFinal", "lbFinal", "grandFinal"]);
    expect(view.slots.every((s) => !s.provisional)).toBe(true);
    expect(view.eliminated).toEqual([]);
    expect(msgs).toEqual([]);
  });

  it("打到敗部決賽：敗部首輪敗者淘汰", () => {
    const { view, msgs } = playin("playin-lbfinal");
    expect(keys(view)).toEqual(["ub1a", "ub1b", "lbRound1", "ubFinal", "lbFinal", "grandFinal"]);
    expect(view.eliminated.map((t) => t.code)).toEqual(["FUR"]);
    expect(view.qualified).toBeNull();
    expect(msgs).toEqual([]);
  });

  it("全部打完：總決賽勝者晉級，其餘三隊淘汰", () => {
    const { view, msgs } = playin("playin-done");
    expect(view.qualified?.code).toBe("MVK");
    expect(view.eliminated.map((t) => t.code).sort()).toEqual(["C9", "FUR", "KC"]);
    expect(msgs).toEqual([]);
  });

  it("推進不合理時 warn", () => {
    const { warn, msgs } = collectWarn();
    const ms = matches(syntheticBundle("playin-done"), "2026").filter((m) => m.stage === "playin");
    const gf = [...ms].sort((a, b) => a.startTime.localeCompare(b.startTime))[5];
    gf.teamA = ms.flatMap((m) => [m.teamA, m.teamB]).find((t) => t?.code === "FUR")!; // FUR 已在敗部首輪淘汰
    buildPlayIn(ms, warn);
    expect(msgs.some((m) => m.includes("總決賽"))).toBe(true);
  });
});

describe("淘汰賽籤表", () => {
  const all = () => matches(bundle("2025"), "2025");

  it("2025：id 排序切輪、勝者推進規則成立、3-0 分兩側", () => {
    const ms = all();
    const { view: swiss } = buildSwiss(ms.filter((m) => m.stage === "swiss"));
    const { warn, msgs } = collectWarn();
    const ko = buildKnockout(ms.filter((m) => m.stage === "knockout"), swiss.records, warn);
    expect(ko.rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(winnerOf(ko.rounds[2][0].match)?.code).toBe("T1");
    expect(ko.rounds[1][0].sourceLabels).toEqual(["八強賽 1 勝者", "八強賽 2 勝者"]);
    expect(msgs).toEqual([]);
  });

  it("3-0 隊伍同側時 warn", () => {
    const ms = all();
    const { view: swiss } = buildSwiss(ms.filter((m) => m.stage === "swiss"));
    const ko = ms.filter((m) => m.stage === "knockout");
    // 把 KT（3-0，原在第 4 場）換到第 2 場，與 AL（3-0，第 1 場）同側
    const sorted = [...ko].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    [sorted[1].teamB, sorted[3].teamB] = [sorted[3].teamB, sorted[1].teamB];
    const { warn, msgs } = collectWarn();
    buildKnockout(ko, swiss.records, warn);
    expect(msgs).toContain("兩支 3-0 隊伍被分在籤表同一側");
  });
});
