import { describe, expect, it } from "vitest";
import { taipeiDateKey, taipeiDayHeading, taipeiMonthDay, taipeiTime } from "../lib/time";

describe("台灣時間", () => {
  it("美洲當地 10/16 的 Play-In 在台灣跨日到 10/17", () => {
    expect(taipeiDateKey("2026-10-16T18:00:00Z")).toBe("2026-10-17");
    expect(taipeiMonthDay("2026-10-16T18:00:00Z")).toBe("10/17");
    expect(taipeiTime("2026-10-16T18:00:00Z")).toBe("02:00");
    expect(taipeiDayHeading("2026-10-16T18:00:00Z")).toBe("10月17日（六）");
  });
  it("午夜顯示 00:00", () => {
    expect(taipeiTime("2026-10-16T16:00:00Z")).toBe("00:00");
  });
});
