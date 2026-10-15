import { describe, expect, it } from "vitest";
import config from "../config/teams-2026.json";
import type { ApiTeam } from "../lib/api-types";
import { buildProfiles, type TeamsConfig } from "../lib/teams";
import type { Team } from "../lib/types";
import { bundle, collectWarn, matches } from "./helpers";

function profiles(year: "2025" | "2026", cfg: TeamsConfig | null) {
  const b = bundle(year);
  const ms = matches(b, year);
  const map = new Map<string, Team>();
  for (const m of ms) for (const t of [m.teamA, m.teamB]) if (t) map.set(t.id, t);
  const { warn, msgs } = collectWarn();
  return { list: buildProfiles(b.teams, map, ms.filter((m) => m.stage === "playin"), cfg, warn), map, msgs };
}
const byCode = (list: ReturnType<typeof profiles>["list"], code: string) => list.find((p) => p.team.code === code)!;

describe("2026 參賽隊伍（getTeams × config）", () => {
  const { list, map, msgs } = profiles("2026", config as TeamsConfig);

  it("19 隊、無警告，依賽區再依種子序排列", () => {
    expect(list).toHaveLength(19);
    expect(msgs).toEqual([]);
    expect(list.slice(0, 4).map((p) => `${p.team.league}${p.team.seed}`)).toEqual(["LCK1", "LCK2", "LCK3", "LCK4"]);
    expect(list[0].team.code).toBe("GEN");
  });

  it("起始階段與種子序", () => {
    expect(byCode(list, "C9").startStage).toBe("playin");
    expect(byCode(list, "T1").startStage).toBe("swiss");
    expect([byCode(list, "FUR").team.league, byCode(list, "FUR").team.seed]).toEqual(["CBLOL", 2]);
  });

  it("選手名單以世界賽登錄名單過濾組織名單，依位置排序並帶照片", () => {
    const t1 = byCode(list, "T1").players;
    expect(t1.map((p) => p.name)).toEqual(["Doran", "Oner", "Faker", "Peyz", "Keria"]);
    expect(t1.map((p) => p.role)).toEqual(["top", "jungle", "mid", "bottom", "support"]);
    expect(t1.every((p) => p.photo?.startsWith("https://"))).toBe(true);
    expect(byCode(list, "BLG").players.filter((p) => p.role === "top").map((p) => p.name)).toEqual(["Bin", "Flandre"]);
  });

  it("賽區/種子序寫回比賽中共用的 Team 物件（tooltip 用）", () => {
    const fur = [...map.values()].find((t) => t.code === "FUR")!;
    expect([fur.league, fur.seed]).toEqual(["CBLOL", 2]);
  });
});

describe("2025 隊伍正規化（無 config）", () => {
  const { list, msgs } = profiles("2025", null);

  it("參賽隊伍 = 比賽中出現的 17 隊，種子序為 null，起始階段由 Play-In 場次推得", () => {
    expect(list).toHaveLength(17);
    expect(msgs).toEqual([]);
    expect(list.every((p) => p.team.seed === null)).toBe(true);
    expect(list.filter((p) => p.startStage === "playin").map((p) => p.team.code).sort()).toEqual(["IG", "T1"]);
  });

  it("無登錄名單時使用 getTeams 全部選手", () => {
    const t1 = byCode(list, "T1");
    expect(t1.players.length).toBeGreaterThan(5);
    expect(t1.players.every((p) => !p.substitute)).toBe(true);
  });
});

describe("缺資料不報錯", () => {
  const api = (over: Partial<ApiTeam>): ApiTeam => ({
    id: "1",
    slug: "x",
    name: "X",
    code: "X",
    image: "http://img/x.png",
    alternativeImage: null,
    backgroundImage: null,
    status: "active",
    homeLeague: null,
    ...over,
  });

  it("沒有照片、沒有種子序、選手名單為空", () => {
    const cfg: TeamsConfig = {
      tournamentSlug: "t",
      teams: [
        { slug: "a", roster: [{ name: "Ghost", role: "mid" }] }, // 名單選手不在 API
        { slug: "b" }, // 無種子序、無名單
        { slug: "c", roster: [] },
        { slug: "missing" },
      ],
    };
    const teams = [
      api({ id: "a", slug: "a", players: [{ id: "p", summonerName: "Other", firstName: "", lastName: "", image: null, role: "mid" }] }),
      api({ id: "b", slug: "b", players: [{ id: "q", summonerName: "NoPic", firstName: "", lastName: "", image: null, role: "coach" }] }),
      api({ id: "c", slug: "c" }), // 沒有 players 欄位
    ];
    const { warn, msgs } = collectWarn();
    const list = buildProfiles(teams, new Map(), [], cfg, warn);
    expect(list).toHaveLength(3);
    const a = list.find((p) => p.team.id === "a")!;
    expect(a.players).toEqual([{ id: "roster:Ghost", name: "Ghost", role: "mid", photo: null, substitute: false }]);
    const b = list.find((p) => p.team.id === "b")!;
    expect([b.team.seed, b.team.league, b.startStage]).toEqual([null, null, null]);
    expect(b.players[0]).toMatchObject({ name: "NoPic", photo: null, role: null });
    expect(list.find((p) => p.team.id === "c")!.players).toEqual([]);
    expect(msgs).toEqual(["getTeams 找不到設定中的隊伍 missing"]);
  });
});
