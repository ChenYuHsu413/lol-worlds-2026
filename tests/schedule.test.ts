import { describe, expect, it } from "vitest";
import { getTargetDate } from "../lib/schedule";
import type { Match, Team } from "../lib/types";

const team = (code: string): Team => ({ id: code, code, name: code, logo: "", region: null, league: null, seed: null });
const match = (startTime: string, a: string | null, b: string | null): Match => ({
  id: startTime,
  stage: "swiss",
  round: null,
  bestOf: 1,
  teamA: a ? team(a) : null,
  teamB: b ? team(b) : null,
  scoreA: 0,
  scoreB: 0,
  winner: null,
  state: "unstarted",
  startTime,
  blockName: "",
});

// 台灣日期：10/24、10/25（兩場）、10/27、10/28（TBD）
const MATCHES = [
  match("2026-10-24T09:00:00Z", "T1", "GEN"),
  match("2026-10-25T09:00:00Z", "HLE", "G2"),
  match("2026-10-25T15:30:00Z", "BLG", "KC"), // 台灣 10/25 23:30
  match("2026-10-27T09:00:00Z", "T1", "BLG"),
  match("2026-10-28T09:00:00Z", null, null),
];
const at = (iso: string) => new Date(iso);

describe("賽程頁目標日期", () => {
  it("今天有比賽 → 今天", () => {
    expect(getTargetDate(MATCHES, at("2026-10-25T02:00:00Z"), null)).toBe("2026-10-25");
  });

  it("今天休息 → 下一個比賽日", () => {
    expect(getTargetDate(MATCHES, at("2026-10-26T02:00:00Z"), null)).toBe("2026-10-27");
  });

  it("全部結束 → 最後一個比賽日", () => {
    expect(getTargetDate(MATCHES, at("2026-11-20T02:00:00Z"), null)).toBe("2026-10-28");
  });

  it("賽事尚未開始 → 第一個比賽日", () => {
    expect(getTargetDate(MATCHES, at("2026-10-01T02:00:00Z"), null)).toBe("2026-10-24");
  });

  it("有隊伍篩選時只看該隊場次", () => {
    expect(getTargetDate(MATCHES, at("2026-10-25T02:00:00Z"), "T1")).toBe("2026-10-27"); // T1 10/25 休息
    expect(getTargetDate(MATCHES, at("2026-10-29T02:00:00Z"), "T1")).toBe("2026-10-27"); // T1 已打完
    expect(getTargetDate(MATCHES, at("2026-10-25T02:00:00Z"), "GEN")).toBe("2026-10-24");
    expect(getTargetDate(MATCHES, at("2026-10-25T02:00:00Z"), "NOPE")).toBeNull();
  });

  it("跨日邊界：台灣 23:59 仍是當天，00:00 起算隔天", () => {
    expect(getTargetDate(MATCHES, at("2026-10-25T15:59:00Z"), null)).toBe("2026-10-25"); // 台灣 10/25 23:59
    expect(getTargetDate(MATCHES, at("2026-10-25T16:00:00Z"), null)).toBe("2026-10-27"); // 台灣 10/26 00:00
    expect(getTargetDate(MATCHES, at("2026-10-23T15:59:00Z"), null)).toBe("2026-10-24"); // 台灣 10/23 23:59
    expect(getTargetDate(MATCHES, at("2026-10-23T16:00:00Z"), null)).toBe("2026-10-24"); // 台灣 10/24 00:00
  });

  it("沒有場次 → null", () => {
    expect(getTargetDate([], at("2026-10-25T02:00:00Z"), null)).toBeNull();
  });
});
