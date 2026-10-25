// 賽程頁：進入時要捲到的日期（純函式）

import { taipeiDateKey } from "./time";
import type { Match } from "./types";

/**
 * 依序判斷：今天（台灣日期）有比賽 → 今天；今天休息 → 下一個比賽日；全部結束 → 最後一個比賽日。
 * 有隊伍篩選時只看該隊的場次。回傳台灣日期 "YYYY-MM-DD"；沒有任何場次時為 null
 */
export function getTargetDate(matches: Match[], now: Date, teamFilter: string | null): string | null {
  const days = [
    ...new Set(
      matches
        .filter((m) => m.startTime && (!teamFilter || m.teamA?.id === teamFilter || m.teamB?.id === teamFilter))
        .map((m) => taipeiDateKey(m.startTime)),
    ),
  ].sort();
  const today = taipeiDateKey(now.toISOString());
  return days.find((d) => d >= today) ?? days.at(-1) ?? null;
}
