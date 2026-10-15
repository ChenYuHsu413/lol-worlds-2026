/* eslint-disable @typescript-eslint/no-explicit-any -- 處理形狀未定的原始 JSON */
// 探索 LoL Esports 非官方 API，將實際回應存成 fixtures/*.json
// 執行：node --env-file=.env.local scripts/explore-api.ts（Node 24 原生支援 TS type stripping）

import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE = "https://esports-api.lolesports.com/persisted/gw";
const API_KEY = process.env.ESPORTS_API_KEY;
if (!API_KEY) throw new Error("未設定 ESPORTS_API_KEY（請用 --env-file=.env.local 執行）");
const HL = "zh-TW";
const OUT = new URL("../fixtures/", import.meta.url);

async function get(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ hl: HL, ...params });
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, { headers: { "x-api-key": API_KEY! } });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function save(name: string, data: unknown) {
  await writeFile(new URL(`${name}.json`, OUT), JSON.stringify(data, null, 2));
  console.log(`saved fixtures/${name}.json`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const leagues = await get("getLeagues");
  await save("getLeagues", leagues);
  const worlds = leagues.data.leagues.find((l: any) => l.slug === "worlds");
  console.log("Worlds leagueId:", worlds.id);

  const tournaments = await get("getTournamentsForLeague", { leagueId: worlds.id });
  await save("getTournamentsForLeague", tournaments);
  const list = tournaments.data.leagues[0].tournaments;

  // 2026 為目標；2025 已完賽，作為測試用完整資料
  for (const slug of ["worlds_2026", "worlds_2025"]) {
    const t = list.find((x: any) => x.slug === slug);
    if (!t) {
      console.warn(`找不到 ${slug}`);
      continue;
    }
    const year = slug.split("_")[1];
    console.log(`${slug} tournamentId:`, t.id);

    const standings = await get("getStandings", { tournamentId: t.id });
    await save(`getStandings_${year}`, standings);
    await save(`getCompletedEvents_${year}`, await get("getCompletedEvents", { tournamentId: t.id }));

    // getTeams（不在原清單，但同一 API）：唯一提供 homeLeague.region 的端點，id 可用逗號串多個 slug
    const slugs = new Set<string>();
    for (const stage of standings.data.standings[0].stages)
      for (const sec of stage.sections)
        for (const m of sec.matches)
          for (const team of m.teams) if (team.slug && team.slug !== "tbd") slugs.add(team.slug);
    // 2026 的瑞士輪隊伍在 standings 中仍是 TBD，另從 config/teams-2026.json 補上參賽隊伍
    if (year === "2026") {
      const config = JSON.parse(await readFile(new URL("../config/teams-2026.json", import.meta.url), "utf8"));
      for (const team of config.teams) slugs.add(team.slug);
    }
    await save(`getTeams_${year}`, await get("getTeams", { id: [...slugs].join(",") }));
  }

  // getSchedule 以 league 為單位分頁，從「目前」頁開始；往 newer 翻到底，往 older 翻一頁（涵蓋 2025）
  const first = await get("getSchedule", { leagueId: worlds.id });
  const pages: any[] = [first];
  let token: string | undefined = first.data.schedule.pages.newer;
  while (token && pages.length < 10) {
    const page = await get("getSchedule", { leagueId: worlds.id, pageToken: token });
    pages.push(page);
    token = page.data.schedule.pages.newer;
  }
  token = first.data.schedule.pages.older;
  if (token) pages.unshift(await get("getSchedule", { leagueId: worlds.id, pageToken: token }));
  await save("getSchedule", pages);

  // 取一場已完成與一場未開始比賽的 event details
  const events = pages.flatMap((p) => p.data.schedule.events);
  const completed = events.findLast((e: any) => e.type === "match" && e.state === "completed");
  const upcoming = events.find((e: any) => e.type === "match" && e.state === "unstarted");
  if (completed) await save("getEventDetails_completed", await get("getEventDetails", { id: completed.match.id }));
  if (upcoming) await save("getEventDetails_unstarted", await get("getEventDetails", { id: upcoming.match.id }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
