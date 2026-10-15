// 由比賽清單組出各階段視圖（純函式）

import { SWISS } from "../config/format-2026";
import { buildKnockout } from "./knockout";
import { consoleWarn, type Warn } from "./normalize";
import { buildPlayIn } from "./playin";
import { buildSwiss } from "./swiss";
import type { KnockoutView, Match, PlayInView, Stage, SwissView } from "./types";

export interface StageViews {
  swiss: SwissView;
  playin: PlayInView;
  knockout: KnockoutView;
}

export function buildStageViews(matches: Match[], warn: Warn = consoleWarn): StageViews {
  const of = (s: Stage) => matches.filter((m) => m.stage === s);
  const swiss = buildSwiss(of("swiss"), warn, SWISS).view;
  return {
    swiss,
    playin: buildPlayIn(of("playin"), warn),
    knockout: buildKnockout(of("knockout"), swiss.records, warn),
  };
}

export function currentStage(matches: Match[]): Stage {
  const live = matches.find((m) => m.state === "inProgress");
  if (live) return live.stage;
  const next = matches
    .filter((m) => m.state === "unstarted" && m.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  return next?.stage ?? "knockout";
}
