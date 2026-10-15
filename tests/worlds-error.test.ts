import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./helpers";

// 以 fixtures 模擬上游 API；mode 控制回應
let mode: "ok" | "401" | "offline" = "ok";

function fakeFetch(input: string | URL) {
  if (mode === "offline") return Promise.reject(new TypeError("fetch failed"));
  if (mode === "401") return Promise.resolve(new Response("Forbidden", { status: 403 }));
  const url = new URL(String(input));
  const endpoint = url.pathname.split("/").pop();
  const pages = fixture("getSchedule.json");
  const body = (() => {
    switch (endpoint) {
      case "getLeagues": return fixture("getLeagues.json");
      case "getTournamentsForLeague": return fixture("getTournamentsForLeague.json");
      case "getStandings": return fixture("getStandings_2026.json");
      case "getTeams": return fixture("getTeams_2026.json");
      case "getSchedule": {
        const token = url.searchParams.get("pageToken");
        const current = pages[1].data.schedule;
        if (!token) return pages[1];
        if (token === current.pages.newer) return pages[2];
        if (token === current.pages.older) return pages[0];
        return { data: { schedule: { pages: { older: null, newer: null }, events: [] } } };
      }
    }
  })();
  return Promise.resolve(Response.json(body));
}

beforeEach(() => {
  vi.resetModules(); // 每個測試重置模組內的 lastGood / token 快取
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubEnv("ESPORTS_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mode = "ok";
});

describe("loadWorlds 錯誤處理", () => {
  it("正常：回傳 2026 資料", async () => {
    const { loadWorlds } = await import("../lib/worlds");
    const r = await loadWorlds();
    expect(r.error).toBeNull();
    expect(r.data?.matches).toHaveLength(46);
    expect(r.data?.currentStage).toBe("playin");
  });

  it("金鑰失效（403）且無快取：auth 錯誤、data 為 null", async () => {
    mode = "401";
    const { loadWorlds } = await import("../lib/worlds");
    const r = await loadWorlds();
    expect(r.error?.kind).toBe("auth");
    expect(r.error?.message).toBe("資料來源金鑰失效");
    expect(r.data).toBeNull();
  });

  it("先成功、後失效：保留最後一次成功資料", async () => {
    const { loadWorlds } = await import("../lib/worlds");
    const ok = await loadWorlds();
    mode = "401";
    const r = await loadWorlds();
    expect(r.error?.kind).toBe("auth");
    expect(r.data?.fetchedAt).toBe(ok.data?.fetchedAt);
  });

  it("斷網：network 錯誤", async () => {
    mode = "offline";
    const { loadWorlds } = await import("../lib/worlds");
    const r = await loadWorlds();
    expect(r.error?.kind).toBe("network");
  });

  it("未設定金鑰視為 auth 錯誤", async () => {
    vi.stubEnv("ESPORTS_API_KEY", "");
    const { loadWorlds } = await import("../lib/worlds");
    expect((await loadWorlds()).error?.kind).toBe("auth");
  });
});
