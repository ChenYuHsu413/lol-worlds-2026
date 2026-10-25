import { describe, expect, it } from "vitest";
import { buildSwiss } from "../lib/swiss";
import { pendingSeats, resultCapacity, swissGrid, teamEdges } from "../lib/swiss-grid";
import type { Match } from "../lib/types";
import { bundle, liveBundle, matches } from "./helpers";

const swiss = (ms: Match[]) => buildSwiss(ms.filter((m) => m.stage === "swiss"), () => {}).view;
const view2025 = () => swiss(matches(bundle("2025"), "2025"));
const view2026 = () => swiss(matches(liveBundle("swiss-2026-10-26"), "2026"));

// 2025 截到 R3 中途：R3 的 2-0 兩場與 1-1 前兩場已完賽，R3 其餘場次隊伍已知未開打，R4 以後 TBD
function truncated2025() {
  return swiss(
    matches(bundle("2025"), "2025").map((m) => {
      if (m.stage !== "swiss" || m.startTime < "2025-10-18T09:30:00Z") return m;
      const tbd = m.startTime >= "2025-10-22";
      return { ...m, state: "unstarted", scoreA: 0, scoreB: 0, winner: null, teamA: tbd ? null : m.teamA, teamB: tbd ? null : m.teamB };
    }),
  );
}
const codes = (ts: { code: string }[]) => ts.map((t) => t.code).sort();

describe("戰績網格位置", () => {
  const g = swissGrid();
  const at = (k: string) => {
    const n = g.nodes.find((x) => x.key === k)!;
    return [n.col, n.row, n.kind];
  };

  it("9 個戰績桶 + 6 個晉級/淘汰框，6 欄 7 列", () => {
    expect(g.nodes.filter((n) => n.kind === "bucket").map((n) => n.key).sort()).toEqual(
      ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2"],
    );
    expect(g.nodes.filter((n) => n.kind === "qualified").map((n) => n.key).sort()).toEqual(["3-0", "3-1", "3-2"]);
    expect(g.nodes.filter((n) => n.kind === "eliminated").map((n) => n.key).sort()).toEqual(["0-3", "1-3", "2-3"]);
    expect([g.cols, g.rows]).toEqual([6, 7]);
  });

  it("同勝敗差在同一列；晉級框在產生它的桶的右上、淘汰框在右下", () => {
    expect(at("0-0")).toEqual([0, 3, "bucket"]);
    expect([at("1-0")[1], at("2-1")[1], at("3-2")[1]]).toEqual([2, 2, 2]);
    expect([at("1-1")[1], at("2-2")[1]]).toEqual([3, 3]);
    expect(at("2-0")).toEqual([2, 1, "bucket"]);
    expect(at("3-0")).toEqual([3, 0, "qualified"]); // 2-0 的右上
    expect(at("0-2")).toEqual([2, 5, "bucket"]);
    expect(at("0-3")).toEqual([3, 6, "eliminated"]); // 0-2 的右下
    expect(at("2-2")).toEqual([4, 3, "bucket"]);
    expect([at("3-2"), at("2-3")]).toEqual([[5, 2, "qualified"], [5, 4, "eliminated"]]);
  });

  it("每個桶兩條線：勝者往右上、敗者往右下", () => {
    expect(g.edges).toHaveLength(18);
    expect(g.edges.filter((e) => e.from === "2-0")).toEqual([
      { from: "2-0", to: "3-0", win: true },
      { from: "2-0", to: "2-1", win: false },
    ]);
    for (const e of g.edges) {
      const [a, b] = [g.nodes.find((n) => n.key === e.from)!, g.nodes.find((n) => n.key === e.to)!];
      expect(b.col).toBe(a.col + 1);
      expect(b.row).toBe(a.row + (e.win ? -1 : 1));
    }
  });
});

describe("晉級/淘汰名額", () => {
  it("3-0、0-3 各 2 名；3-1、3-2、1-3、2-3 各 3 名", () => {
    expect(["3-0", "3-1", "3-2", "0-3", "1-3", "2-3"].map((k) => resultCapacity(...(k.split("-").map(Number) as [number, number])))).toEqual([
      2, 3, 3, 2, 3, 3,
    ]);
  });

  it("2025 完整資料：每個框的隊伍數剛好等於名額", () => {
    const v = view2025();
    for (const n of swissGrid().nodes.filter((x) => x.kind !== "bucket"))
      expect(v.records.filter((r) => r.wins === n.wins && r.losses === n.losses)).toHaveLength(resultCapacity(n.wins, n.losses));
  });
});

describe("待抽籤隊伍", () => {
  it("2025 完整資料：所有桶都已配對", () => {
    const v = view2025();
    for (const n of swissGrid().nodes.filter((x) => x.kind === "bucket")) expect(pendingSeats(v, n.wins, n.losses)).toEqual({ teams: [], open: 0 });
  });

  it("前一輪部分完賽（2025 截到 R3 中途）：已知的列出，其餘為空位", () => {
    const v = truncated2025();
    expect(pendingSeats(v, 2, 0)).toEqual({ teams: [], open: 0 }); // R3 已配對
    const w21 = pendingSeats(v, 2, 1);
    expect(w21.teams).toHaveLength(4); // 2-0 的 2 個敗者 + 已打完的 2 場 1-1 勝者
    expect(w21.open).toBe(2);
    expect(codes(w21.teams)).toContain("GEN");
    const w12 = pendingSeats(v, 1, 2);
    expect(w12.teams).toHaveLength(2); // 已打完的 2 場 1-1 敗者；0-2 都還沒打
    expect(w12.open).toBe(4);
    expect(codes(w12.teams)).toContain("T1");
    expect(pendingSeats(v, 2, 2)).toEqual({ teams: [], open: 6 });
  });

  it("前一輪全部完賽（2025 截到 R4 開打前）：全部隊伍已知、沒有空位", () => {
    const v = swiss(
      matches(bundle("2025"), "2025").map((m) =>
        m.stage === "swiss" && m.startTime >= "2025-10-22"
          ? { ...m, state: "unstarted", scoreA: 0, scoreB: 0, winner: null, teamA: null, teamB: null }
          : m,
      ),
    );
    expect(pendingSeats(v, 2, 1)).toMatchObject({ open: 0 });
    expect(pendingSeats(v, 2, 1).teams).toHaveLength(6);
    expect(pendingSeats(v, 1, 2).teams).toHaveLength(6);
  });

  it("2026 正式資料（R3 進行中）：R3 已配對，R4、R5 的隊伍都還不知道", () => {
    const v = view2026();
    expect(pendingSeats(v, 2, 0)).toEqual({ teams: [], open: 0 });
    expect(pendingSeats(v, 1, 1)).toEqual({ teams: [], open: 0 });
    expect(pendingSeats(v, 2, 1)).toEqual({ teams: [], open: 6 });
    expect(pendingSeats(v, 1, 2)).toEqual({ teams: [], open: 6 });
    expect(pendingSeats(v, 2, 2)).toEqual({ teams: [], open: 6 });
  });
});

describe("隊伍路徑", () => {
  it("2025 T1（3-2）走過 5 條線，終點為 3-2", () => {
    const v = view2025();
    const t1 = v.records.find((r) => r.team.code === "T1")!.team.id;
    const e = [...teamEdges(v, t1)];
    expect(e).toHaveLength(5);
    expect(e.some((x) => x.endsWith(">3-2"))).toBe(true);
  });

  it("2026 正式資料：MKOI 兩連勝、TES 先敗後勝", () => {
    const v = view2026();
    const id = (c: string) => v.records.find((r) => r.team.code === c)!.team.id;
    expect([...teamEdges(v, id("MKOI"))].sort()).toEqual(["0-0>1-0", "1-0>2-0"]);
    expect([...teamEdges(v, id("TES"))].sort()).toEqual(["0-0>0-1", "0-1>1-1"]);
  });
});
