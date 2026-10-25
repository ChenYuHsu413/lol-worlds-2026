import { describe, expect, it } from "vitest";
import { buildSwiss } from "../lib/swiss";
import { swissTable } from "../lib/swiss-table";
import type { Match } from "../lib/types";
import { bundle, liveBundle, matches } from "./helpers";

const table = (ms: Match[]) => swissTable(buildSwiss(ms.filter((m) => m.stage === "swiss"), () => {}).view);
const row = (rows: ReturnType<typeof table>, code: string) => rows.find((r) => r.team.code === code)!;

describe("戰績表：2025 完整資料", () => {
  const rows = table(matches(bundle("2025"), "2025"));

  it("16 隊依戰績排序（勝多 → 敗少），同戰績依隊名", () => {
    expect(rows).toHaveLength(16);
    expect(rows.map((r) => `${r.wins}-${r.losses}`)).toEqual([
      "3-0", "3-0", "3-1", "3-1", "3-1", "3-2", "3-2", "3-2", "2-3", "2-3", "2-3", "1-3", "1-3", "1-3", "0-3", "0-3",
    ]);
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1], rows[i]];
      if (a.wins === b.wins && a.losses === b.losses) expect(a.team.name.localeCompare(b.team.name, "en")).toBeLessThan(0);
    }
    expect(rows.slice(0, 2).map((r) => r.team.code)).toEqual(["AL", "KT"]); // Anyone's Legend < KT Rolster
  });

  it("狀態：前 8 晉級、後 8 淘汰", () => {
    expect(rows.slice(0, 8).every((r) => r.status === "qualified")).toBe(true);
    expect(rows.slice(8).every((r) => r.status === "eliminated")).toBe(true);
  });

  it("T1（3-2）：五輪都有對手；Bo1 無比分、Bo3 有比分", () => {
    const t1 = row(rows, "T1");
    expect(t1.rounds.map((c) => c?.result)).toEqual(["win", "loss", "loss", "win", "win"]);
    expect(t1.rounds.map((c) => c?.opponent?.code)).toEqual(["FLY", "CFO", "GEN", "100T", "MKOI"]);
    expect(t1.rounds[0]!.score).toBeNull(); // Bo1
    expect(t1.rounds[3]!.score).toEqual([2, 0]); // R4 Bo3 對 100T
  });

  it("3-0 的隊伍 R4、R5 留空", () => {
    expect(row(rows, "KT").rounds.slice(3)).toEqual([null, null]);
  });
});

describe("戰績表：2026 正式資料（R3 進行中）", () => {
  const rows = table(matches(liveBundle("swiss-2026-10-26"), "2026"));

  it("16 隊；2-0 四隊在最前面並依隊名排序，全部進行中", () => {
    expect(rows).toHaveLength(16);
    expect(rows.slice(0, 4).map((r) => r.team.code)).toEqual(["DK", "GEN", "LYON", "MKOI"]);
    expect(rows.slice(-4).every((r) => r.wins === 0 && r.losses === 2)).toBe(true);
    expect(rows.every((r) => r.status === "alive")).toBe(true);
  });

  it("進行中的場次標 LIVE、尚未配對的留空", () => {
    const hle = row(rows, "HLE");
    expect(hle.rounds[2]).toMatchObject({ live: true, upcoming: false, result: null });
    expect(hle.rounds[2]!.opponent?.code).toBe("IG");
    expect(hle.rounds.slice(3)).toEqual([null, null]); // R4、R5 尚未配對
    expect(row(rows, "MKOI").rounds.slice(0, 2).map((c) => c?.result)).toEqual(["win", "win"]);
  });

  it("已配對但未開打：有對手與開賽時間、沒有勝負", () => {
    const r3 = row(rows, "MKOI").rounds[2]!;
    expect(r3).toMatchObject({ upcoming: true, live: false, result: null });
    expect(r3.opponent?.code).toBe("DK");
    expect(r3.match.startTime).toBe("2026-10-25T19:00:00Z"); // 台灣 10/26 03:00
    expect(row(rows, "DK").rounds[2]!.opponent?.code).toBe("MKOI");
  });
});
