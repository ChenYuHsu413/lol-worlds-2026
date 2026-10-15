"use client";

import { createContext, useContext } from "react";
import { parsePrediction, type PredictionState, type SimResult } from "@/lib/simulate";
import type { Match } from "@/lib/types";

const STORAGE_KEY = "worlds:prediction";

export function loadStoredPrediction(): PredictionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parsePrediction(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function storePrediction(state: PredictionState | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 隱私模式或空間不足：預測只保留在記憶體
  }
}

export interface PredictCtx {
  enabled: boolean;
  sim: SimResult | null;
  /** 開啟預測面板 */
  open: (matchId: string) => void;
  /** 實際結果模式：開啟小局細節 */
  openGames: (matchId: string) => void;
  /** 換配對/排籤模式下，目前選取的隊伍 */
  swapSelected: string | null;
  /** 依序點兩支隊伍以交換配對 */
  swapClick: (scope: "swiss" | "ko", teamId: string, round?: number) => void;
  /** 直接交換兩支隊伍（拖曳用） */
  swap: (scope: "swiss" | "ko", a: string, b: string, round?: number) => void;
  swapMode: boolean;
}

export const PredictContext = createContext<PredictCtx>({
  enabled: false,
  sim: null,
  open: () => {},
  openGames: () => {},
  swapSelected: null,
  swapClick: () => {},
  swap: () => {},
  swapMode: false,
});

export const usePredict = () => useContext(PredictContext);

/** 實際結果模式下可展開小局：已開打的真實比賽 */
export const hasGames = (m: Match) => (m.state === "completed" || m.state === "inProgress") && !m.sim?.result;

/** 預測模式下可點選勝隊：尚未開打且雙方已知 */
export const isPredictable = (m: Match) => m.state === "unstarted" && m.teamA !== null && m.teamB !== null;
