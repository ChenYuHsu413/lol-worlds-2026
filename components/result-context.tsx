"use client";

import { createContext, useContext } from "react";
import { seriesResult, type Score } from "@/lib/result";
import type { Match } from "@/lib/types";

/** 結果更新中的場次，依小局資料推得的暫定比分（match id → 比分）；卡片與小局面板共用 */
export const ProvisionalContext = createContext<Record<string, Score>>({});
export const useSeriesResult = (m: Match) => seriesResult(m, useContext(ProvisionalContext)[m.id]);

/** 系列賽比分「a : b」；結果更新中、暫定比分另外標示。leftIsA = 左邊是 teamA */
export function SeriesScore({ match, leftIsA = true, sep = " : " }: { match: Match; leftIsA?: boolean; sep?: string }) {
  const r = useSeriesResult(match);
  if (r.kind === "pending") return <span className="whitespace-nowrap text-xs font-normal text-muted">結果更新中</span>;
  const [l, rr] = leftIsA ? [r.scoreA, r.scoreB] : [r.scoreB, r.scoreA];
  return (
    <span className="whitespace-nowrap">
      {`${l}${sep}${rr}`}
      {r.kind === "provisional" && <span className="ml-1 align-middle text-[10px] font-normal text-accent-2">暫定</span>}
    </span>
  );
}
