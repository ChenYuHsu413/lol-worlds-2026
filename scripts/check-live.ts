/* eslint-disable @typescript-eslint/no-explicit-any -- 處理形狀未定的原始 JSON */
// 檢查正式站 /api/worlds：印出每場的狀態、比分、隊伍、provisional
// 執行：node scripts/check-live.ts [網址]（預設正式站）

const BASE = process.argv[2] ?? "https://lol-worlds-2026.vercel.app";

const res = await fetch(`${BASE}/api/worlds`);
const payload: { data: any; error: { kind: string; message: string } | null } = await res.json();
console.log(`HTTP ${res.status}  cache=${res.headers.get("x-vercel-cache") ?? "-"}`);
if (payload.error) console.log(`錯誤：[${payload.error.kind}] ${payload.error.message}`);
const data = payload.data;
if (!data) process.exit(1);

console.log(`來源 ${data.source}  更新 ${data.fetchedAt}  目前階段 ${data.currentStage}  revalidate ${data.revalidateSeconds}s\n`);

// provisional 只存在於瑞士輪 slot 與 Play-In slot
const provisional = new Map<string, string>();
for (const s of data.swiss.slots) provisional.set(s.match.id, s.provisional ? `R${s.round} ${s.wins}-${s.losses}?` : `R${s.round} ${s.wins}-${s.losses}`);
for (const s of data.playin.slots) provisional.set(s.match.id, s.provisional ? `${s.label}?` : s.label);
for (const r of data.knockout.rounds) for (const s of r) provisional.set(s.match.id, `${data.knockout.roundNames[s.round]} ${s.index + 1}`);

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length * (/[^\x00-\xff]/.test(s) ? 2 : 1)));
const taipei = (iso: string) =>
  new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(5, 16).replace("T", " ");

for (const m of [...data.matches].sort((a: any, b: any) => a.startTime.localeCompare(b.startTime))) {
  const a = m.teamA?.code ?? "TBD";
  const b = m.teamB?.code ?? "TBD";
  const score = m.state === "unstarted" ? "  -  " : `${m.scoreA} : ${m.scoreB}`;
  console.log(
    [
      taipei(m.startTime),
      pad(m.stage, 9),
      `Bo${m.bestOf}`,
      pad(m.state, 11),
      `${a.padStart(4)} ${score} ${b.padEnd(4)}`,
      provisional.get(m.id) ?? "",
    ].join("  "),
  );
}
console.log("\n（時間為台灣時間 UTC+8；標 ? 者為 provisional）");

export {}; // 讓 TS 視為 module，允許 top-level await
