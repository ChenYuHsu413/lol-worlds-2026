import { describe, expect, it } from "vitest";
import type { GetStandingsResponse } from "../lib/api-types";
import type { RawBundle } from "../lib/normalize";
import type { PlayInSlotKey, Seat, WorldsData } from "../lib/types";
import { buildWorldsData } from "../lib/worlds";
import { bundle, liveBundle, syntheticBundle, tournament } from "./helpers";

const build = (b: RawBundle, year: "2025" | "2026" = "2026"): WorldsData => buildWorldsData(b, tournament(year), "test", () => {});
const slot = (d: WorldsData, k: PlayInSlotKey) => d.playin.slots.find((s) => s.key === k)!;
const show = (s: Seat) => (s.team ? `${s.team.code}${s.score === null ? "" : ` ${s.score}`}${s.result ? `(${s.result})` : ""}` : `[${s.placeholder}]`);
const seats = (d: WorldsData, k: PlayInSlotKey) => slot(d, k).seats.map(show);

/** 把 standings 每場的 teams 順序對調（模擬 API 回傳順序不同） */
function reversed(b: RawBundle): RawBundle {
  const c = structuredClone(b);
  for (const st of (c.standings as GetStandingsResponse).data.standings[0].stages)
    for (const sec of st.sections) for (const m of sec.matches) m.teams.reverse();
  return c;
}

describe("Play-In 格位（正式資料 2026-10-16：KC 3:2 C9 已完賽、MVK vs FUR 進行中）", () => {
  const d = build(liveBundle("playin-2026-10-16"));

  it("勝部決賽：KC 在上格（勝部首輪 A 勝者），下格顯示「勝部首輪 B 勝者」", () => {
    expect(seats(d, "ubFinal")).toEqual(["KC", "[勝部首輪 B 勝者]"]);
  });
  it("敗部首輪：C9 在上格（勝部首輪 A 敗者），下格顯示「勝部首輪 B 敗者」", () => {
    expect(seats(d, "lbRound1")).toEqual(["C9", "[勝部首輪 B 敗者]"]);
  });
  it("首輪依 API 原始順序；進行中比分依 team id 對應", () => {
    expect(seats(d, "ub1a")).toEqual(["KC 3(win)", "C9 2(loss)"]);
    expect(seats(d, "ub1b")).toEqual(["MVK 1", "FUR 0"]);
  });
  it("後續場次顯示來源文字", () => {
    expect(seats(d, "lbFinal")).toEqual(["[勝部決賽敗者]", "[敗部首輪勝者]"]);
    expect(seats(d, "grandFinal")).toEqual(["[勝部決賽勝者]", "[敗部決賽勝者]"]);
  });
  it("去向文字由同一張來源表產生", () => {
    expect(slot(d, "ub1a").next).toBe("勝者 → 勝部決賽・敗者 → 敗部首輪");
    expect(slot(d, "ubFinal").next).toBe("勝者 → 總決賽・敗者 → 敗部決賽");
    expect(slot(d, "lbRound1").next).toBe("勝者 → 敗部決賽・敗者淘汰");
    expect(slot(d, "grandFinal").next).toBe("勝者晉級瑞士輪・敗者淘汰");
  });
});

describe("全部完賽（合成）：每格隊伍與比分", () => {
  const d = build(syntheticBundle("playin-done"));
  it("依來源固定上下，比分跟著隊伍走", () => {
    expect(seats(d, "ubFinal")).toEqual(["C9 3(win)", "MVK 2(loss)"]);
    expect(seats(d, "lbRound1")).toEqual(["KC 3(win)", "FUR 0(loss)"]);
    expect(seats(d, "lbFinal")).toEqual(["MVK 3(win)", "KC 1(loss)"]);
    expect(seats(d, "grandFinal")).toEqual(["C9 2(loss)", "MVK 3(win)"]);
  });

  it("API teams 順序對調：有來源的格位與比分完全不變；首輪隊伍與比分仍正確對應", () => {
    const r = build(reversed(syntheticBundle("playin-done")));
    for (const k of ["ubFinal", "lbRound1", "lbFinal", "grandFinal"] as const) expect(seats(r, k)).toEqual(seats(d, k));
    for (const k of ["ub1a", "ub1b"] as const) expect([...seats(r, k)].sort()).toEqual([...seats(d, k)].sort());
  });

  it("正式資料對調順序也不變", () => {
    const a = build(liveBundle("playin-2026-10-16"));
    const b = build(reversed(liveBundle("playin-2026-10-16")));
    for (const k of ["ubFinal", "lbRound1", "lbFinal", "grandFinal"] as const) expect(seats(b, k)).toEqual(seats(a, k));
  });
});

describe("淘汰賽共用同一套格位規則（2025）", () => {
  const d = build(bundle("2025"), "2025");
  const ko = (r: number, i: number) => d.knockout.rounds[r][i];

  it("四強 1：API 順序為 TES、T1，格位仍依來源（八強 1 勝者 T1 在上）", () => {
    expect([ko(1, 0).match.teamA?.code, ko(1, 0).match.teamB?.code]).toEqual(["TES", "T1"]);
    expect(ko(1, 0).seats.map(show)).toEqual(["T1 3(win)", "TES 0(loss)"]);
    expect(ko(1, 0).next).toBe("勝者 → 決賽");
  });
  it("決賽：上格四強 1 勝者、下格四強 2 勝者", () => {
    expect(ko(2, 0).seats.map(show)).toEqual(["T1 3(win)", "KT 2(loss)"]);
    expect(ko(2, 0).next).toBe("勝者奪冠");
    expect(ko(0, 2).next).toBe("勝者 → 四強第 2 場");
  });
  it("API 順序對調時格位不變", () => {
    const r = build(reversed(bundle("2025")), "2025");
    for (const [a, b] of [[1, 0], [1, 1], [2, 0]]) expect(r.knockout.rounds[a][b].seats.map(show)).toEqual(ko(a, b).seats.map(show));
  });
});
