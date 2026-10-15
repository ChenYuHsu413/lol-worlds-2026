// 由 2026 真實 fixtures 產生 Play-In 合成情境：fixtures/synthetic/playin-*.json
// 執行：node scripts/make-synthetic.ts
// 注意：第 3/4 場刻意讓「時間較早的那場」為敗部首輪，驗證判定不依賴 id/時間順序

import { mkdir, readFile, writeFile } from "node:fs/promises";

const dir = new URL("../fixtures/", import.meta.url);
const read = async (f: string) => JSON.parse(await readFile(new URL(f, dir), "utf8"));

const standings = await read("getStandings_2026.json");
const pages = await read("getSchedule.json");
const teamsRes = await read("getTeams_2026.json");

const events = pages
  .flatMap((p: any) => p.data.schedule.events)
  .filter((e: any) => e.startTime >= "2026-10-01");

const playinStage = standings.data.standings[0].stages.find((s: any) => s.slug === "play_ins");
const playinIds: string[] = playinStage.sections[0].matches.map((m: any) => m.id);
const ordered = events
  .filter((e: any) => playinIds.includes(e.match.id))
  .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime))
  .map((e: any) => e.match.id as string);

const allTeams: any[] = playinStage.sections[0].matches.flatMap((m: any) => m.teams);
const team = (code: string) => allTeams.find((t) => t.code === code);

type Result = { a: string; b: string; sa?: number; sb?: number; state?: "unstarted" | "inProgress" | "completed" };

function scenario(results: (Result | null)[]) {
  const s = structuredClone(standings);
  const ev = structuredClone(events);
  const stage = s.data.standings[0].stages.find((x: any) => x.slug === "play_ins");
  results.forEach((r, i) => {
    if (!r) return;
    const id = ordered[i];
    const state = r.state ?? "completed";
    const sa = r.sa ?? 0;
    const sb = r.sb ?? 0;
    const outcome = (mine: number, theirs: number) =>
      state === "completed" ? (mine > theirs ? "win" : "loss") : null;
    const sm = stage.sections[0].matches.find((m: any) => m.id === id);
    sm.state = state;
    sm.teams = [
      { ...team(r.a), result: { outcome: outcome(sa, sb), gameWins: sa } },
      { ...team(r.b), result: { outcome: outcome(sb, sa), gameWins: sb } },
    ];
    const e = ev.find((x: any) => x.match.id === id);
    e.state = state;
    e.match.teams = sm.teams.map((t: any) => ({
      name: t.name,
      code: t.code,
      image: t.image,
      result: t.result,
      record: null,
    }));
  });
  return { tournamentSlug: "worlds_2026", standings: s, events: ev, teams: teamsRes.data.teams };
}

const r1: Result[] = [
  { a: "C9", b: "KC", sa: 3, sb: 1 },
  { a: "FUR", b: "MVK", sa: 2, sb: 3 },
];
const day2: Result[] = [
  { a: "KC", b: "FUR", sa: 3, sb: 0 }, // 較早那場 = 敗部首輪
  { a: "C9", b: "MVK", sa: 3, sb: 2 }, // 勝部決賽
];

const scenarios: Record<string, (Result | null)[]> = {
  none: [],
  r1: [...r1, { a: "KC", b: "FUR", state: "unstarted" }, { a: "C9", b: "MVK", state: "unstarted" }],
  lbfinal: [...r1, ...day2, { a: "MVK", b: "KC", sa: 1, sb: 1, state: "inProgress" }],
  done: [...r1, ...day2, { a: "MVK", b: "KC", sa: 3, sb: 1 }, { a: "C9", b: "MVK", sa: 2, sb: 3 }],
};

await mkdir(new URL("synthetic/", dir), { recursive: true });
for (const [name, results] of Object.entries(scenarios)) {
  await writeFile(new URL(`synthetic/playin-${name}.json`, dir), JSON.stringify(scenario(results), null, 1));
  console.log(`saved fixtures/synthetic/playin-${name}.json`);
}
