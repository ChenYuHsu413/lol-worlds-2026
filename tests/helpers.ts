/* eslint-disable @typescript-eslint/no-explicit-any -- 處理形狀未定的原始 JSON */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ApiTournament } from "../lib/api-types";
import { tournamentRange } from "../lib/lolesports";
import { mergeMatches, type RawBundle } from "../lib/normalize";
import type { Match } from "../lib/types";

export const fixture = <T = any>(...parts: string[]): T =>
  JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", ...parts), "utf8"));

export function tournament(year: string): ApiTournament {
  const t = fixture("getTournamentsForLeague.json").data.leagues[0].tournaments.find(
    (x: ApiTournament) => x.slug === `worlds_${year}`,
  );
  if (!t) throw new Error(`no tournament ${year}`);
  return t;
}

export function bundle(year: string): RawBundle {
  return {
    standings: fixture(`getStandings_${year}.json`),
    events: fixture("getSchedule.json").flatMap((p: any) => p.data.schedule.events),
    teams: fixture(`getTeams_${year}.json`).data.teams,
  };
}

export function syntheticBundle(name: string): RawBundle {
  return fixture("synthetic", `${name}.json`);
}

export function collectWarn() {
  const msgs: string[] = [];
  const warn = (msg: string) => void msgs.push(msg);
  return { msgs, warn };
}

export function matches(b: RawBundle, year: string, warn = collectWarn().warn): Match[] {
  return mergeMatches(b, tournamentRange(tournament(year)), warn).matches;
}

/** fixtures/live 下的正式資料快照（格式同 synthetic） */
export function liveBundle(name: string): RawBundle {
  return fixture("live", `${name}.json`);
}
