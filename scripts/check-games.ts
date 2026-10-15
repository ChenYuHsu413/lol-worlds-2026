/* eslint-disable @typescript-eslint/no-explicit-any -- 處理形狀未定的原始 JSON */
// 檢查正式站 /api/games/{matchId}：列出每局的資料完整度（同 check-live 的做法）
// 執行：node scripts/check-games.ts [matchId] [網址]
//   不給 matchId 時，從 /api/worlds 取所有已開打的場次逐一檢查

const BASE = process.argv[3] ?? "https://lol-worlds-2026.vercel.app";

async function ids(): Promise<string[]> {
  if (process.argv[2]) return [process.argv[2]];
  const { data } = await (await fetch(`${BASE}/api/worlds`)).json();
  return (data?.matches ?? []).filter((m: any) => m.state !== "unstarted").map((m: any) => m.id);
}

const list = await ids();
if (!list.length) console.log("目前沒有已開打的場次");
for (const id of list) {
  const res = await fetch(`${BASE}/api/games/${id}`);
  const { data, error } = await res.json();
  console.log(`\n${id}  HTTP ${res.status}  cache=${res.headers.get("x-vercel-cache") ?? "-"}  ${res.headers.get("cache-control")}`);
  if (!data) {
    console.log(`  錯誤：${error}`);
    continue;
  }
  console.log(`  ${data.teams.map((t: any) => `${t.code} ${t.gameWins}`).join(" : ")}  Data Dragon ${data.champions.version}  Leaguepedia ${data.sources.leaguepedia ? "OK" : "無法連線"}`);
  for (const g of data.games) {
    const players = [...g.blue.players, ...g.red.players];
    const unmatched = players.filter((p: any) => !p.playerId).map((p: any) => p.rawName);
    const noName = players.filter((p: any) => !data.champions.names[p.champion]).map((p: any) => p.champion);
    console.log(
      [
        `  G${g.number} ${g.state}`,
        `勝方 ${g.winner ?? "-"}(${g.winnerSource ?? "-"})`,
        `時長 ${g.durationSec ?? "-"}s`,
        `選手 ${players.length}`,
        `KDA ${players.every((p: any) => p.kills !== null) ? "OK" : "缺"}`,
        `Ban ${g.blue.bans ? "OK" : "缺"}`,
        `選角順序 ${g.draft ? g.draft.length : "缺"}`,
        unmatched.length ? `未對應選手 ${unmatched.join(", ")}` : "選手全對應",
        noName.length ? `缺譯名 ${noName.join(",")}` : "",
      ].join("  "),
    );
  }
}

export {}; // 讓 TS 視為 module，允許 top-level await
