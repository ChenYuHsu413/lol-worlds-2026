import { describe, expect, it } from "vitest";
import type { GetScheduleResponse } from "../lib/api-types";
import { fetchSchedulePages, tournamentRange } from "../lib/lolesports";
import { mergeMatches } from "../lib/normalize";
import { bundle, collectWarn, fixture, tournament } from "./helpers";

describe("standings × schedule 合併", () => {
  it("2026：6 + 33 + 7 = 46 場全部以 match id 配對成功", () => {
    const { msgs, warn } = collectWarn();
    const r = mergeMatches(bundle("2026"), tournamentRange(tournament("2026")), warn);
    const count = (s: string) => r.matches.filter((m) => m.stage === s).length;
    expect([count("playin"), count("swiss"), count("knockout")]).toEqual([6, 33, 7]);
    expect(r.standingsOnly).toEqual([]);
    expect(r.scheduleOnly).toEqual([]);
    expect(r.matches.every((m) => m.bestOf > 0 && m.startTime)).toBe(true);
    expect(msgs).toEqual([]);
  });

  it("2025：1 + 33 + 7 = 41 場全部配對成功", () => {
    const { msgs, warn } = collectWarn();
    const r = mergeMatches(bundle("2025"), tournamentRange(tournament("2025")), warn);
    const count = (s: string) => r.matches.filter((m) => m.stage === s).length;
    expect([count("playin"), count("swiss"), count("knockout")]).toEqual([1, 33, 7]);
    expect(r.standingsOnly).toEqual([]);
    expect(r.scheduleOnly).toEqual([]);
    expect(msgs).toEqual([]);
  });

  it("配不上的場次會 warn 並保留，不靜默丟棄", () => {
    const b = bundle("2026");
    const dropped = b.events.find((e) => e.startTime >= "2026-10")!.match.id;
    b.events = b.events.filter((e) => e.match.id !== dropped);
    const { msgs, warn } = collectWarn();
    const r = mergeMatches(b, tournamentRange(tournament("2026")), warn);
    expect(r.standingsOnly).toEqual([dropped]);
    expect(r.matches.some((m) => m.id === dropped)).toBe(true);
    expect(msgs.length).toBe(1);
  });

  it("隊伍地區由 getTeams 補上", () => {
    const r = mergeMatches(bundle("2026"), tournamentRange(tournament("2026")));
    expect(r.teams.find((t) => t.code === "FUR")?.region).toBe("巴西");
  });
});

describe("getSchedule 分頁", () => {
  // fixtures 的 3 頁：[older, current, newer]
  const pages: GetScheduleResponse[] = fixture("getSchedule.json");
  const [older, current, newer] = pages.map((p) => p.data.schedule);
  const byToken = new Map<string | null, typeof current>([
    [null, current],
    [current.pages.older, older],
    [current.pages.newer, newer],
  ]);

  function fetcher() {
    const calls: (string | null)[] = [];
    const f = async (token: string | null) => {
      calls.push(token);
      const p = byToken.get(token);
      if (!p) return { pages: { older: null, newer: null }, events: [] };
      return p;
    };
    return { calls, f };
  }

  it("2026 只往 newer 翻，不往 older 翻；第二次直接用快取 token", async () => {
    const t = tournament("2026");
    const a = fetcher();
    const got = await fetchSchedulePages(t, a.f);
    expect(got).toEqual([current, newer]);
    expect(a.calls).not.toContain(current.pages.older);

    const b = fetcher();
    await fetchSchedulePages(t, b.f);
    expect(b.calls.sort()).toEqual([null, current.pages.newer].sort());
  });

  it("2025 會往 older 翻到涵蓋開賽日", async () => {
    const got = await fetchSchedulePages(tournament("2025"), fetcher().f);
    expect(got[0]).toBe(older);
  });
});
