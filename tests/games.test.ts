import { describe, expect, it } from "vitest";
import type { ApiEventDetails } from "../lib/api-types";
import type { DDragonChampionFile, LeaguepediaGameRow, LiveWindow } from "../lib/game-api-types";
import { assembleMatchGames, fearless, matchPlayer, stripTeamPrefix, type MatchGames } from "../lib/games";
import type { Player } from "../lib/types";
import { buildWorldsData } from "../lib/worlds";
import { bundle, fixture, tournament } from "./helpers";

const FINAL = "113475871524050783"; // T1 3-2 KT，5 局
const QF = "113475871523985211"; // T1 3-2 AL
const BO1 = "113475798006599034"; // VKS 0-1 TSW

const g = <T,>(name: string): T => fixture<T>("games", name);
const zh = g<DDragonChampionFile>("ddragon_champion_zh_TW.json");
const en = g<DDragonChampionFile>("ddragon_champion_en_US.json");
const lp = g<LeaguepediaGameRow[]>("leaguepedia_2025_main.json");
const profiles = buildWorldsData(bundle("2025"), tournament("2025"), "test", () => {}).profiles;
const rosterOf = (id: string): Player[] => profiles.find((p) => p.team.id === id)?.players ?? [];

function load(matchId: string, opts: { leaguepedia?: boolean; end?: boolean } = {}): MatchGames {
  const event = g<{ data: { event: ApiEventDetails } }>(`eventDetails_${matchId}.json`).data.event;
  const windows: Record<string, { start: LiveWindow | null; end: LiveWindow | null }> = {};
  for (const game of event.match.games)
    if (game.state === "completed")
      windows[game.id] = {
        start: g(`window_${game.id}_start.json`),
        end: opts.end === false ? null : g(`window_${game.id}_end.json`),
      };
  return assembleMatchGames({ event, windows, leaguepedia: opts.leaguepedia === false ? null : lp, zh, en, rosterOf });
}

describe("決賽 5 局（live stats × Leaguepedia × Data Dragon）", () => {
  const m = load(FINAL);
  const t1 = m.teams.find((t) => t.code === "T1")!.id;

  it("每局勝方取自 Leaguepedia，合計等於系列賽 3-2", () => {
    expect(m.games).toHaveLength(5);
    expect(m.games.every((x) => x.winnerSource === "leaguepedia")).toBe(true);
    expect(m.games.filter((x) => x.winner && x[x.winner].teamId === t1)).toHaveLength(3);
  });

  it("時長、藍紅方、版本", () => {
    const g1 = m.games[0];
    expect(g1.durationSec).toBe(36 * 60 + 10);
    expect(g1.blue.teamId).not.toBe(t1); // 第 1 局 KT 藍方
    expect(g1.red.teamId).toBe(t1);
    expect(g1.patch).toMatch(/^15\.20/);
  });

  it("雙方 5 位選手：位置、英雄、KDA，局內數據與 Leaguepedia 金錢一致", () => {
    const g1 = m.games[0];
    expect(g1.red.players.map((p) => `${p.role}:${p.champion}`)).toEqual([
      "top:Ambessa", "jungle:XinZhao", "mid:Taliyah", "bottom:Varus", "support:Poppy",
    ]);
    expect(g1.red.players.every((p) => p.kills !== null && p.deaths !== null && p.assists !== null)).toBe(true);
    expect([g1.blue.gold, g1.red.gold]).toEqual([61309, 75206]);
    expect(g1.red.kills).toBe(25);
    expect(g1.red.dragons).toEqual(["mountain", "mountain", "mountain"]);
  });

  it("Ban 位 10 個與 20 步選角順序", () => {
    const g1 = m.games[0];
    expect(g1.blue.bans).toEqual(["Bard", "Neeko", "Yunara", "Alistar", "Renata"]);
    expect(g1.draft).toHaveLength(20);
    expect(g1.draft!.slice(0, 6).every((s) => s.type === "ban")).toBe(true);
    expect(g1.draft![6]).toEqual({ side: "blue", type: "pick", champion: "MonkeyKing" }); // KT 首選悟空
  });

  it("所有英雄都有繁中譯名", () => {
    const ids = m.games.flatMap((x) => [...x.blue.players, ...x.red.players].map((p) => p.champion));
    const bans = m.games.flatMap((x) => [...(x.blue.bans ?? []), ...(x.red.bans ?? [])]);
    expect([...ids, ...bans].filter((id) => !m.champions.names[id])).toEqual([]);
    expect(m.champions.names.MonkeyKing).toBe("悟空");
  });

  it("沒有 Leaguepedia 時：推估勝方與實際一致（兵營/塔/金錢），Ban/選角順序隱藏", () => {
    const n = load(FINAL, { leaguepedia: false });
    expect(n.sources.leaguepedia).toBe(false);
    expect(n.games.map((x) => x.winner)).toEqual(m.games.map((x) => x.winner));
    expect(n.games.every((x) => x.winnerSource === "inferred" && x.draft === null && x.blue.bans === null)).toBe(true);
  });
});

describe("Fearless 累加", () => {
  it("第 n 局前列出雙方已用英雄，依局數累加且不重複", () => {
    const m = load(FINAL);
    const steps = fearless(m.games);
    expect(steps.map((s) => s.beforeGame)).toEqual([1, 2, 3, 4, 5]);
    expect(Object.keys(steps[0].used)).toHaveLength(0);
    for (const [i, s] of steps.entries())
      for (const team of m.teams) expect(s.used[team.id] ?? []).toHaveLength(i * 5);
    // 2025 實際資料：系列賽中沒有任何英雄重複出場（兩隊皆然）
    const all = m.games.flatMap((x) => [...x.blue.players, ...x.red.players].map((p) => p.champion));
    expect(new Set(all).size).toBe(all.length);
  });

  it("Bo1 只有一步；沒有選手資料的局不計入", () => {
    const m = load(BO1);
    expect(fearless(m.games)).toHaveLength(1);
    const empty = { ...m.games[0], number: 2, blue: { ...m.games[0].blue, players: [] }, red: { ...m.games[0].red, players: [] } };
    expect(fearless([...m.games, empty])).toHaveLength(1);
  });
});

describe("缺資料", () => {
  it("沒有局內數據（只有開局 frame）：統計為 null，不報錯", () => {
    const m = load(QF, { end: false, leaguepedia: false });
    const x = m.games[0];
    expect(x.blue.players).toHaveLength(5);
    expect([x.blue.kills, x.blue.towers, x.winner, x.blue.players[0].kills]).toEqual([null, null, null, null]);
  });

  it("進行中的局：終局 frame 為 in_game → 不判定勝方，時長以 frame 計算", () => {
    const event = g<{ data: { event: ApiEventDetails } }>(`eventDetails_${BO1}.json`).data.event;
    const game = event.match.games[0];
    const start = g<LiveWindow>(`window_${game.id}_start.json`);
    const mid: LiveWindow = { ...start, frames: start.frames.map((f) => ({ ...f, rfc460Timestamp: new Date(Date.parse(f.rfc460Timestamp) + 600_000).toISOString() })) };
    const live = { ...event, match: { ...event.match, games: [{ ...game, state: "inProgress" }] } };
    const m = assembleMatchGames({ event: live, windows: { [game.id]: { start, end: mid } }, leaguepedia: null, zh, en, rosterOf });
    expect(m.games[0].winner).toBeNull();
    expect(m.games[0].durationSec).toBeGreaterThanOrEqual(600);
  });

  it("完全沒有 live stats：選手為空、欄位皆 null", () => {
    const event = g<{ data: { event: ApiEventDetails } }>(`eventDetails_${BO1}.json`).data.event;
    const m = assembleMatchGames({ event, windows: {}, leaguepedia: lp, zh, en, rosterOf });
    expect(m.games[0].blue.players).toEqual([]);
    expect([m.games[0].durationSec, m.games[0].draft, m.games[0].patch]).toEqual([null, null, null]);
  });
});

describe("選手名稱對應", () => {
  const roster: Player[] = [
    { id: "p1", name: "Faker", role: "mid", photo: null, substitute: false },
    { id: "p2", name: "Hans Sama", role: "bottom", photo: null, substitute: false },
  ];
  it("去掉隊伍代碼前綴", () => {
    expect(stripTeamPrefix("T1 Faker", "T1")).toBe("Faker");
    expect(stripTeamPrefix("G2 Hans Sama", "G2")).toBe("Hans Sama");
    expect(stripTeamPrefix("MKOI Supa", "MKF")).toBe("Supa"); // 代碼不一致時去掉第一段
  });
  it("先比 esportsPlayerId，再比名稱（不分大小寫），對不上回傳 null", () => {
    expect(matchPlayer("T1 Whoever", "p1", "T1", roster).player?.name).toBe("Faker");
    expect(matchPlayer("G2 hans sama", "x", "G2", roster).player?.id).toBe("p2");
    expect(matchPlayer("T1 Nobody", "x", "T1", roster).player).toBeNull();
  });
});
