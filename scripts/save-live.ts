/* eslint-disable @typescript-eslint/no-explicit-any -- 處理形狀未定的原始 JSON */
// 把目前正式 API 的原始資料（standings × schedule × teams）存成 fixtures/live/<名稱>.json，
// 格式同 fixtures/synthetic，開發時可用 ?fixture=live-<名稱> 重現當下畫面
// 執行：node --env-file=.env.local scripts/save-live.ts <名稱>

import { mkdir, readFile, writeFile } from "node:fs/promises";

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error("請給檔名（小寫英數與 -）");
const KEY = process.env.ESPORTS_API_KEY;
if (!KEY) throw new Error("未設定 ESPORTS_API_KEY（請用 --env-file=.env.local 執行）");

const BASE = "https://esports-api.lolesports.com/persisted/gw";
const get = async (endpoint: string, params: Record<string, string>) => {
  const res = await fetch(`${BASE}/${endpoint}?${new URLSearchParams({ hl: "zh-TW", ...params })}`, { headers: { "x-api-key": KEY } });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
  return res.json();
};

const tournaments = await get("getTournamentsForLeague", { leagueId: "98767975604431411" });
const t = tournaments.data.leagues[0].tournaments.find((x: any) => x.slug === "worlds_2026");
const standings = await get("getStandings", { tournamentId: t.id });

// schedule：從目前頁往 newer 翻到底，只留賽事期間的場次
const events: any[] = [];
let page = (await get("getSchedule", { leagueId: "98767975604431411" })).data.schedule;
for (let i = 0; i < 10; i++) {
  events.push(...page.events.filter((e: any) => e.startTime >= t.startDate));
  if (!page.pages.newer) break;
  page = (await get("getSchedule", { leagueId: "98767975604431411", pageToken: page.pages.newer })).data.schedule;
}

const config = JSON.parse(await readFile(new URL("../config/teams-2026.json", import.meta.url), "utf8"));
const teams = (await get("getTeams", { id: config.teams.map((x: any) => x.slug).join(",") })).data.teams;

await mkdir(new URL("../fixtures/live/", import.meta.url), { recursive: true });
await writeFile(
  new URL(`../fixtures/live/${name}.json`, import.meta.url),
  JSON.stringify({ tournamentSlug: "worlds_2026", savedAt: new Date().toISOString(), standings, events, teams }, null, 1),
);
console.log(`saved fixtures/live/${name}.json（${events.length} 場）`);
