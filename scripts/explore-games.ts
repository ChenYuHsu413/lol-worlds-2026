// 探索小局資料來源，把實際回應存到 fixtures/games/
// 執行：node --env-file=.env.local scripts/explore-games.ts [matchId ...]
// 預設抓 Worlds 2025：決賽（Bo5 3-2）、八強 T1-AL（Bo5 3-2）、瑞士輪首場（Bo1）

import { mkdir, writeFile } from "node:fs/promises";

const API_KEY = process.env.ESPORTS_API_KEY;
if (!API_KEY) throw new Error("未設定 ESPORTS_API_KEY（請用 --env-file=.env.local 執行）");
const OUT = new URL("../fixtures/games/", import.meta.url);
const UA = { "user-agent": "lol-worlds-viz/0.1 (personal project)" };

const matchIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["113475871524050783", "113475871523985211", "113475798006599034"];

async function json(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function save(name: string, data: unknown) {
  await writeFile(new URL(name, OUT), JSON.stringify(data, null, 1));
  console.log(`saved fixtures/games/${name}`);
}
const tenSec = (ms: number) => new Date(Math.floor(ms / 10000) * 10000).toISOString().replace(/\.\d+Z$/, "Z");

await mkdir(OUT, { recursive: true });

for (const matchId of matchIds) {
  const ev = await json(
    `https://esports-api.lolesports.com/persisted/gw/getEventDetails?hl=zh-TW&id=${matchId}`,
    { "x-api-key": API_KEY },
  );
  await save(`eventDetails_${matchId}.json`, ev);
  for (const g of ev.data.event.match.games) {
    if (g.state !== "completed") continue;
    // 不帶 startingTime：開局的前幾個 frame（含 gameMetadata、開局時間）
    const start = await json(`https://feed.lolesports.com/livestats/v1/window/${g.id}`);
    await save(`window_${g.id}_start.json`, start);
    // startingTime 超過結束時間時，回傳終局 frame（gameState: finished）
    const t0 = Date.parse(start.frames[0].rfc460Timestamp);
    await save(`window_${g.id}_end.json`, await json(`https://feed.lolesports.com/livestats/v1/window/${g.id}?startingTime=${tenSec(t0 + 4 * 3600_000)}`));
    // details/{gameId} 另有出裝、傷害占比等；本站只用 KDA/金錢/補刀，window 終局 frame 已包含，故不使用
  }
}

// Leaguepedia：ScoreboardGames × PicksAndBansS7（Special:CargoExport；api.php 的 cargoquery 匿名查詢會被限流）
const fields = [
  "SG.GameId", "SG.Team1", "SG.Team2", "SG.Winner", "SG.DateTime_UTC", "SG.Gamelength_Number",
  "SG.Team1Picks", "SG.Team2Picks", "SG.Team1Bans", "SG.Team2Bans",
  ...[1, 2, 3, 4, 5].flatMap((i) => [`PB.Team1Ban${i}`, `PB.Team2Ban${i}`, `PB.Team1Pick${i}`, `PB.Team2Pick${i}`]),
];
const lp = new URL("https://lol.fandom.com/wiki/Special:CargoExport");
lp.search = new URLSearchParams({
  tables: "ScoreboardGames=SG,PicksAndBansS7=PB",
  join_on: "SG.GameId=PB.GameId",
  fields: fields.join(","),
  where: 'SG.OverviewPage="2025 Season World Championship/Main Event"',
  limit: "500",
  format: "json",
}).toString();
await save("leaguepedia_2025_main.json", await json(lp.toString(), UA));

// Data Dragon：最新版本 + 英雄（zh_TW 顯示用、en_US 用來對應 Leaguepedia 的英文名）
const versions = await json("https://ddragon.leagueoflegends.com/api/versions.json");
await save("ddragon_versions.json", versions.slice(0, 5));
for (const lang of ["zh_TW", "en_US"])
  await save(`ddragon_champion_${lang}.json`, await json(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/${lang}/champion.json`));
